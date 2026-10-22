-- =====================================================================
-- Recursos inspirados no Jira:
--  • tipos de item (história, tarefa, bug)
--  • épicos e checklist (subtarefas) por tarefa
--  • rótulos coloridos e filtros salvos
--  • comentários com @menções, notificações e registro de atividades
--  • colunas personalizáveis no quadro (cada coluna pertence a uma das
--    cinco etapas fixas, que continuam alimentando as métricas)
--  • objetivo, encerramento e relatório de sprint (velocidade)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos de item e colunas
-- ---------------------------------------------------------------------

alter table public.tasks
  add column kind text not null default 'tarefa' check (kind in ('historia', 'tarefa', 'bug')),
  add column column_key text;

-- Colunas do quadro: null = as cinco padrão. Formato:
-- [{"id":"revisao-codigo","label":"Revisão de código","category":"review","wip":3}, ...]
alter table public.projects add column columns jsonb;

create or replace function public.validate_columns(c jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare
  n int;
  e jsonb;
  ids text[] := '{}';
begin
  if c is null then
    return;
  end if;
  if jsonb_typeof(c) <> 'array' then
    raise exception 'Colunas inválidas';
  end if;
  n := jsonb_array_length(c);
  if n < 2 or n > 12 then
    raise exception 'O quadro precisa ter de 2 a 12 colunas';
  end if;
  for e in select * from jsonb_array_elements(c) loop
    if coalesce(e->>'id', '') !~ '^[a-z0-9-]{1,40}$' then
      raise exception 'Identificador de coluna inválido';
    end if;
    if e->>'id' = any (ids) then
      raise exception 'Há duas colunas com o mesmo identificador';
    end if;
    ids := ids || (e->>'id');
    if char_length(coalesce(trim(e->>'label'), '')) not between 1 and 40 then
      raise exception 'Cada coluna precisa de um nome com até 40 caracteres';
    end if;
    if coalesce(e->>'category', '') not in ('backlog', 'todo', 'doing', 'review', 'done') then
      raise exception 'Etapa de coluna inválida';
    end if;
    if e ? 'wip' and jsonb_typeof(e->'wip') <> 'null'
       and (jsonb_typeof(e->'wip') <> 'number' or (e->>'wip')::numeric not between 1 and 99) then
      raise exception 'O limite de cartões (WIP) precisa ficar entre 1 e 99';
    end if;
  end loop;
  if not exists (select 1 from jsonb_array_elements(c) x where x->>'category' = 'done') then
    raise exception 'O quadro precisa de pelo menos uma coluna da etapa Feito';
  end if;
  if not exists (select 1 from jsonb_array_elements(c) x where x->>'category' <> 'done') then
    raise exception 'O quadro precisa de pelo menos uma coluna antes de Feito';
  end if;
end;
$$;

create or replace function public.guard_project_columns()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.validate_columns(new.columns);
  return new;
end;
$$;
create trigger projects_guard_columns before insert or update of columns on public.projects
  for each row execute function public.guard_project_columns();

-- Coluna removida: os cartões voltam para a primeira coluna da mesma etapa
create or replace function public.release_removed_columns()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.tasks t set column_key = null
   where t.project_id = new.id and t.column_key is not null
     and not exists (select 1 from jsonb_array_elements(coalesce(new.columns, '[]'::jsonb)) c where c->>'id' = t.column_key);
  return null;
end;
$$;
create trigger projects_release_columns after update of columns on public.projects
  for each row execute function public.release_removed_columns();

-- A etapa (status) da tarefa sempre segue a coluna escolhida
create or replace function public.sync_task_column()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  cols jsonb;
  cat text;
begin
  if new.column_key is null then
    return new;
  end if;
  select columns into cols from public.projects where id = new.project_id;
  if cols is null then
    cat := case when new.column_key in ('backlog', 'todo', 'doing', 'review', 'done') then new.column_key end;
  else
    select c->>'category' into cat from jsonb_array_elements(cols) c where c->>'id' = new.column_key;
  end if;
  if cat is null then
    new.column_key := null;
  elsif tg_op = 'UPDATE' and new.column_key is not distinct from old.column_key
        and new.status is distinct from old.status then
    -- mudou só a etapa (sem escolher coluna): solta a coluna se ela não for daquela etapa
    if cat <> new.status then
      new.column_key := null;
    end if;
  else
    new.status := cat;
  end if;
  return new;
end;
$$;
create trigger tasks_sync_column before insert or update of column_key, status on public.tasks
  for each row execute function public.sync_task_column();

-- O histórico de etapas passa a valer para qualquer mudança de etapa, inclusive
-- a feita pelo gatilho acima ao trocar de coluna (antes só disparava com "status" no update)
create or replace trigger tasks_status_history after insert or update on public.tasks
  for each row execute function public.log_status();

-- ---------------------------------------------------------------------
-- Épicos
-- ---------------------------------------------------------------------

create table public.epics (
  id          bigint generated always as identity primary key,
  project_id  uuid not null references public.projects(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  color       text not null default '#5577b0' check (color ~ '^#[0-9a-fA-F]{6}$'),
  description text not null default '',
  position    double precision not null default 0,
  created_at  timestamptz not null default now()
);
create index on public.epics(project_id);

alter table public.tasks add column epic_id bigint references public.epics(id) on delete set null;

-- O épico precisa ser do mesmo projeto da tarefa
create or replace function public.check_task_epic()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.epic_id is not null
     and not exists (select 1 from public.epics e where e.id = new.epic_id and e.project_id = new.project_id) then
    raise exception 'O épico precisa ser do mesmo projeto';
  end if;
  return new;
end;
$$;
create trigger tasks_check_epic before insert or update of epic_id on public.tasks
  for each row execute function public.check_task_epic();

-- ---------------------------------------------------------------------
-- Rótulos
-- ---------------------------------------------------------------------

create table public.labels (
  id         bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  name       text not null check (char_length(trim(name)) between 1 and 40),
  color      text not null default '#8a5fc0' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now()
);
create unique index labels_unique_name on public.labels(project_id, lower(trim(name)));

create table public.task_labels (
  task_id    bigint not null references public.tasks(id) on delete cascade,
  label_id   bigint not null references public.labels(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  primary key (task_id, label_id)
);
create index on public.task_labels(project_id);

create or replace function public.prepare_task_label()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select project_id into new.project_id from public.tasks where id = new.task_id;
  if new.project_id is null
     or not exists (select 1 from public.labels l where l.id = new.label_id and l.project_id = new.project_id) then
    raise exception 'O rótulo precisa ser do mesmo projeto';
  end if;
  return new;
end;
$$;
create trigger task_labels_prepare before insert on public.task_labels
  for each row execute function public.prepare_task_label();

-- ---------------------------------------------------------------------
-- Checklist (subtarefas)
-- ---------------------------------------------------------------------

create table public.checklist_items (
  id         bigint generated always as identity primary key,
  task_id    bigint not null references public.tasks(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title      text not null check (char_length(trim(title)) between 1 and 300),
  done       boolean not null default false,
  position   double precision not null default 0,
  done_by    uuid references public.profiles(id) on delete set null,
  done_at    timestamptz,
  created_at timestamptz not null default now()
);
create index on public.checklist_items(project_id);
create index on public.checklist_items(task_id);

create or replace function public.prepare_checklist_item()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select project_id into new.project_id from public.tasks where id = new.task_id;
    if new.project_id is null then
      raise exception 'Tarefa não encontrada';
    end if;
  else
    new.task_id := old.task_id;
    new.project_id := old.project_id;
  end if;
  if new.done and (tg_op = 'INSERT' or not old.done) then
    new.done_by := auth.uid();
    new.done_at := now();
  elsif not new.done then
    new.done_by := null;
    new.done_at := null;
  end if;
  return new;
end;
$$;
create trigger checklist_items_prepare before insert or update on public.checklist_items
  for each row execute function public.prepare_checklist_item();

-- ---------------------------------------------------------------------
-- Comentários, notificações e atividade
-- ---------------------------------------------------------------------

create table public.task_comments (
  id         bigint generated always as identity primary key,
  task_id    bigint not null references public.tasks(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body       text not null check (char_length(trim(body)) between 1 and 4000),
  mentions   uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.task_comments(task_id, created_at);
create index on public.task_comments(project_id);

create table public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id    bigint references public.tasks(id) on delete cascade,
  comment_id bigint references public.task_comments(id) on delete cascade,
  actor_id   uuid references public.profiles(id) on delete set null,
  kind       text not null check (kind in ('mention', 'comment')),
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index on public.notifications(user_id, read_at);

create table public.task_activity (
  id         bigint generated always as identity primary key,
  task_id    bigint not null references public.tasks(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_id   uuid references public.profiles(id) on delete set null,
  action     text not null,
  detail     jsonb not null default '{}'::jsonb,
  at         timestamptz not null default now()
);
create index on public.task_activity(task_id, at);
create index on public.task_activity(project_id);

-- Autor, horário e projeto do comentário vêm do banco; menções só valem para quem participa
create or replace function public.prepare_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select project_id into new.project_id from public.tasks where id = new.task_id;
  if new.project_id is null then
    raise exception 'Tarefa não encontrada';
  end if;
  new.author_id := auth.uid();
  new.created_at := now();
  new.mentions := coalesce(array(
    select distinct m from unnest(new.mentions) m
    where m <> auth.uid()
      and (public.is_member_of(new.project_id, m)
           or exists (select 1 from public.profiles p join public.app_admins a on a.email = lower(p.email)
                      where p.id = m and a.revoked_at is null))
  ), '{}');
  return new;
end;
$$;
create trigger task_comments_prepare before insert on public.task_comments
  for each row execute function public.prepare_comment();

-- Avisa quem foi mencionado e os responsáveis pela tarefa
create or replace function public.notify_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, project_id, task_id, comment_id, actor_id, kind)
  select m, new.project_id, new.task_id, new.id, new.author_id, 'mention'
  from unnest(new.mentions) m;

  insert into public.notifications (user_id, project_id, task_id, comment_id, actor_id, kind)
  select a.user_id, new.project_id, new.task_id, new.id, new.author_id, 'comment'
  from public.task_assignees a
  where a.task_id = new.task_id and a.user_id <> new.author_id and not (a.user_id = any (new.mentions));
  return null;
end;
$$;
create trigger task_comments_notify after insert on public.task_comments
  for each row execute function public.notify_comment();

-- Registro de atividades (escrito só pelo banco)
create or replace function public.log_activity(p_task bigint, p_project uuid, p_action text, p_detail jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.task_activity (task_id, project_id, actor_id, action, detail)
  values (p_task, p_project, auth.uid(), p_action, coalesce(p_detail, '{}'::jsonb));
$$;

create or replace function public.track_task_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  f text;
  a text;
  b text;
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.id, new.project_id, 'criou', jsonb_build_object('kind', new.kind));
    return null;
  end if;
  if new.title is distinct from old.title then
    perform public.log_activity(new.id, new.project_id, 'campo', jsonb_build_object('campo', 'title', 'de', old.title, 'para', new.title));
  end if;
  if new.description is distinct from old.description then
    perform public.log_activity(new.id, new.project_id, 'campo', jsonb_build_object('campo', 'description'));
  end if;
  if new.kind is distinct from old.kind then
    perform public.log_activity(new.id, new.project_id, 'campo', jsonb_build_object('campo', 'kind', 'de', old.kind, 'para', new.kind));
  end if;
  if new.priority is distinct from old.priority then
    perform public.log_activity(new.id, new.project_id, 'campo', jsonb_build_object('campo', 'priority', 'de', old.priority, 'para', new.priority));
  end if;
  if new.points is distinct from old.points then
    perform public.log_activity(new.id, new.project_id, 'campo', jsonb_build_object('campo', 'points', 'de', old.points, 'para', new.points));
  end if;
  if new.start_date is distinct from old.start_date then
    perform public.log_activity(new.id, new.project_id, 'campo', jsonb_build_object('campo', 'start', 'de', old.start_date, 'para', new.start_date));
  end if;
  if new.due_date is distinct from old.due_date then
    perform public.log_activity(new.id, new.project_id, 'campo', jsonb_build_object('campo', 'due', 'de', old.due_date, 'para', new.due_date));
  end if;
  if new.phase is distinct from old.phase then
    perform public.log_activity(new.id, new.project_id, 'campo', jsonb_build_object('campo', 'phase', 'de', old.phase, 'para', new.phase));
  end if;
  if new.sprint_id is distinct from old.sprint_id then
    select s.name into a from public.sprints s where s.id = old.sprint_id;
    select s.name into b from public.sprints s where s.id = new.sprint_id;
    perform public.log_activity(new.id, new.project_id, 'campo', jsonb_build_object('campo', 'sprint', 'de', a, 'para', b));
  end if;
  if new.epic_id is distinct from old.epic_id then
    select e.name into a from public.epics e where e.id = old.epic_id;
    select e.name into b from public.epics e where e.id = new.epic_id;
    perform public.log_activity(new.id, new.project_id, 'campo', jsonb_build_object('campo', 'epic', 'de', a, 'para', b));
  end if;
  if new.status is distinct from old.status or new.column_key is distinct from old.column_key then
    perform public.log_activity(new.id, new.project_id, 'coluna',
      jsonb_build_object('de', coalesce(old.column_key, old.status), 'para', coalesce(new.column_key, new.status)));
  end if;
  return null;
end;
$$;
create trigger tasks_track_changes after insert or update on public.tasks
  for each row execute function public.track_task_changes();

-- Responsáveis, rótulos e checklist também entram na atividade.
-- Quando a própria tarefa está sendo apagada, não registra nada.
create or replace function public.track_task_links()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r record;
  nm text;
begin
  if tg_op = 'DELETE' then
    r := old;
  else
    r := new;
  end if;
  if not exists (select 1 from public.tasks t where t.id = r.task_id) then
    return null;
  end if;
  if tg_table_name = 'task_assignees' then
    select coalesce(nullif(p.full_name, ''), split_part(p.email, '@', 1)) into nm from public.profiles p where p.id = r.user_id;
    perform public.log_activity(r.task_id, r.project_id, case when tg_op = 'DELETE' then 'responsavel_saiu' else 'responsavel_entrou' end,
      jsonb_build_object('nome', nm));
  elsif tg_table_name = 'task_labels' then
    select l.name into nm from public.labels l where l.id = r.label_id;
    if nm is null then
      return null;
    end if;
    perform public.log_activity(r.task_id, r.project_id, case when tg_op = 'DELETE' then 'rotulo_saiu' else 'rotulo_entrou' end,
      jsonb_build_object('nome', nm));
  elsif tg_table_name = 'checklist_items' then
    if tg_op = 'INSERT' then
      perform public.log_activity(r.task_id, r.project_id, 'checklist_novo', jsonb_build_object('item', new.title));
    elsif tg_op = 'UPDATE' and new.done is distinct from old.done then
      perform public.log_activity(r.task_id, r.project_id, case when new.done then 'checklist_feito' else 'checklist_reaberto' end,
        jsonb_build_object('item', new.title));
    end if;
  end if;
  return null;
end;
$$;
create trigger task_assignees_track after insert or delete on public.task_assignees
  for each row execute function public.track_task_links();
create trigger task_labels_track after insert or delete on public.task_labels
  for each row execute function public.track_task_links();
create trigger checklist_items_track after insert or update on public.checklist_items
  for each row execute function public.track_task_links();

-- ---------------------------------------------------------------------
-- Filtros salvos
-- ---------------------------------------------------------------------

create table public.saved_filters (
  id         bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name       text not null check (char_length(trim(name)) between 1 and 60),
  query      jsonb not null default '{}'::jsonb,
  shared     boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.saved_filters(project_id);

create or replace function public.prepare_saved_filter()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.owner_id := auth.uid();
  else
    new.owner_id := old.owner_id;
    new.project_id := old.project_id;
  end if;
  return new;
end;
$$;
create trigger saved_filters_prepare before insert or update on public.saved_filters
  for each row execute function public.prepare_saved_filter();

-- ---------------------------------------------------------------------
-- Sprints: objetivo, encerramento e relatório
-- ---------------------------------------------------------------------

alter table public.sprints
  add column goal text not null default '' check (char_length(goal) <= 300),
  add column closed_at timestamptz,
  add column report jsonb;

-- Encerra o sprint: guarda o resultado e leva o que sobrou para o próximo
-- sprint (p_next) ou para fora de sprint (p_next nulo)
create or replace function public.close_sprint(p_sprint bigint, p_next bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.sprints;
  rep jsonb;
begin
  select * into s from public.sprints where id = p_sprint;
  if s.id is null or not public.can_edit(s.project_id) then
    raise exception 'Sprint não encontrado ou sem permissão';
  end if;
  if s.closed_at is not null then
    raise exception 'Este sprint já foi encerrado';
  end if;
  if p_next is not null and not exists (
    select 1 from public.sprints n where n.id = p_next and n.project_id = s.project_id and n.closed_at is null and n.id <> s.id
  ) then
    raise exception 'Escolha um sprint aberto do mesmo projeto';
  end if;
  select jsonb_build_object(
    'committed_points', coalesce(sum(t.points) filter (where not t.milestone), 0),
    'completed_points', coalesce(sum(t.points) filter (where not t.milestone and t.status = 'done'), 0),
    'committed_tasks', count(*),
    'completed_tasks', count(*) filter (where t.status = 'done'),
    'completed', coalesce(jsonb_agg(t.id) filter (where t.status = 'done'), '[]'::jsonb),
    'carried', coalesce(jsonb_agg(t.id) filter (where t.status <> 'done'), '[]'::jsonb),
    'bugs_open', count(*) filter (where t.kind = 'bug' and t.status <> 'done'),
    'next_sprint', p_next
  ) into rep
  from public.tasks t where t.sprint_id = s.id;

  update public.tasks set sprint_id = p_next where sprint_id = s.id and status <> 'done';
  update public.sprints set closed_at = now(), report = rep where id = s.id;
  return rep;
end;
$$;

-- Reabre um sprint encerrado por engano (o que já foi movido continua onde está)
create or replace function public.reopen_sprint(p_sprint bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.sprints;
begin
  select * into s from public.sprints where id = p_sprint;
  if s.id is null or not public.can_edit(s.project_id) then
    raise exception 'Sprint não encontrado ou sem permissão';
  end if;
  update public.sprints set closed_at = null where id = s.id;
end;
$$;

-- ---------------------------------------------------------------------
-- Notificações: lista e leitura
-- ---------------------------------------------------------------------

create or replace function public.my_notifications()
returns table (
  id bigint, project_id uuid, project_name text, task_id bigint, task_title text,
  comment_id bigint, excerpt text, actor_name text, kind text, created_at timestamptz, read_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select n.id, n.project_id, p.name, n.task_id, t.title, n.comment_id,
         left(c.body, 160), coalesce(nullif(a.full_name, ''), split_part(a.email, '@', 1)),
         n.kind, n.created_at, n.read_at
  from public.notifications n
  join public.projects p on p.id = n.project_id
  left join public.tasks t on t.id = n.task_id
  left join public.task_comments c on c.id = n.comment_id
  left join public.profiles a on a.id = n.actor_id
  where n.user_id = auth.uid()
    and (public.is_member(n.project_id) or public.is_admin())
  order by n.created_at desc
  limit 60;
$$;

-- p_ids nulo = todas; p_task = as de uma tarefa
create or replace function public.mark_notifications_read(p_ids bigint[] default null, p_task bigint default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null
     and (p_ids is null or id = any (p_ids))
     and (p_task is null or task_id = p_task);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------
-- Regras de acesso
-- ---------------------------------------------------------------------

alter table public.epics           enable row level security;
alter table public.labels          enable row level security;
alter table public.task_labels     enable row level security;
alter table public.checklist_items enable row level security;
alter table public.task_comments   enable row level security;
alter table public.notifications   enable row level security;
alter table public.task_activity   enable row level security;
alter table public.saved_filters   enable row level security;

-- épicos, rótulos e checklist: todos leem; criador e editores mudam
create policy "ver épicos" on public.epics for select to authenticated using (public.is_member(project_id) or public.is_admin());
create policy "criar épico" on public.epics for insert to authenticated with check (public.can_edit(project_id));
create policy "editar épico" on public.epics for update to authenticated using (public.can_edit(project_id)) with check (public.can_edit(project_id));
create policy "excluir épico" on public.epics for delete to authenticated using (public.can_edit(project_id));

create policy "ver rótulos" on public.labels for select to authenticated using (public.is_member(project_id) or public.is_admin());
create policy "criar rótulo" on public.labels for insert to authenticated with check (public.can_edit(project_id));
create policy "editar rótulo" on public.labels for update to authenticated using (public.can_edit(project_id)) with check (public.can_edit(project_id));
create policy "excluir rótulo" on public.labels for delete to authenticated using (public.can_edit(project_id));

create policy "ver rótulos das tarefas" on public.task_labels for select to authenticated using (public.is_member(project_id) or public.is_admin());
create policy "pôr rótulo" on public.task_labels for insert to authenticated with check (public.can_edit(project_id));
create policy "tirar rótulo" on public.task_labels for delete to authenticated using (public.can_edit(project_id));

create policy "ver checklist" on public.checklist_items for select to authenticated using (public.is_member(project_id) or public.is_admin());
create policy "criar item" on public.checklist_items for insert to authenticated with check (public.can_edit(project_id));
create policy "marcar item" on public.checklist_items for update to authenticated using (public.can_edit(project_id)) with check (public.can_edit(project_id));
create policy "excluir item" on public.checklist_items for delete to authenticated using (public.can_edit(project_id));

-- comentários: todos os integrantes (inclusive leitores) e o admin comentam; o autor apaga o seu
create policy "ver comentários" on public.task_comments for select to authenticated using (public.is_member(project_id) or public.is_admin());
create policy "comentar" on public.task_comments for insert to authenticated with check (public.is_member(project_id) or public.is_admin());
create policy "apagar o próprio comentário" on public.task_comments for delete to authenticated using (author_id = (select auth.uid()));

create policy "ver minhas notificações" on public.notifications for select to authenticated using (user_id = (select auth.uid()));

create policy "ver atividade" on public.task_activity for select to authenticated using (public.is_member(project_id) or public.is_admin());

-- filtros: o dono vê e muda os seus; compartilhados aparecem para a equipe
create policy "ver filtros" on public.saved_filters for select to authenticated
  using (owner_id = (select auth.uid()) or (shared and (public.is_member(project_id) or public.is_admin())));
create policy "salvar filtro" on public.saved_filters for insert to authenticated
  with check (public.is_member(project_id) or public.is_admin());
create policy "editar filtro" on public.saved_filters for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "excluir filtro" on public.saved_filters for delete to authenticated using (owner_id = (select auth.uid()));

-- Funções internas fora da API
revoke execute on function
  public.validate_columns(jsonb), public.guard_project_columns(), public.release_removed_columns(),
  public.sync_task_column(), public.check_task_epic(), public.prepare_task_label(), public.prepare_checklist_item(),
  public.prepare_comment(), public.notify_comment(), public.log_activity(bigint, uuid, text, jsonb),
  public.track_task_changes(), public.track_task_links(), public.prepare_saved_filter()
from public, anon, authenticated;
revoke execute on function
  public.close_sprint(bigint, bigint), public.reopen_sprint(bigint),
  public.my_notifications(), public.mark_notifications_read(bigint[], bigint)
from public, anon;
grant execute on function
  public.close_sprint(bigint, bigint), public.reopen_sprint(bigint),
  public.my_notifications(), public.mark_notifications_read(bigint[], bigint)
to authenticated;

-- Tempo real
alter publication supabase_realtime add table
  public.epics, public.labels, public.task_labels, public.checklist_items,
  public.task_comments, public.notifications, public.saved_filters;
