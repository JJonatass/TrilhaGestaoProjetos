-- Trilha de Projetos: script único. Cole no Supabase → SQL Editor → Run.
-- Equivale às migrações 0001 a 0006 desta pasta, nessa ordem.

-- =====================================================================
-- Trilha de Projetos · esquema, regras de acesso (RLS) e automações
-- =====================================================================

-- ---------- Perfis (um por conta do Supabase Auth) ----------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text not null default '',
  created_at timestamptz not null default now()
);

-- Administradores do sistema, por e-mail (vale mesmo antes do cadastro).
create table public.app_admins (
  email text primary key check (email = lower(email))
);

create type public.member_role as enum ('owner', 'editor', 'viewer');

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  owner_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  wip         jsonb not null default '{"doing": 3, "review": 2}',
  -- Integrantes podem se colocar como responsáveis sem depender do criador
  self_assign boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       public.member_role not null default 'editor',
  joined_at  timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index on public.project_members(user_id);

create table public.project_invites (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  email      text not null check (email = lower(email) and position('@' in email) > 1),
  role       public.member_role not null default 'editor' check (role <> 'owner'),
  invited_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (project_id, email)
);
create index on public.project_invites(email);

create table public.sprints (
  id         bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  name       text not null,
  start_date date not null,
  end_date   date not null,
  check (end_date >= start_date)
);
create index on public.sprints(project_id);

create table public.tasks (
  id          bigint generated always as identity primary key,
  project_id  uuid not null references public.projects(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 300),
  description text not null default '',
  priority    text not null default 'media' check (priority in ('baixa', 'media', 'alta', 'critica')),
  points      integer not null default 1 check (points >= 0),
  status      text not null default 'backlog' check (status in ('backlog', 'todo', 'doing', 'review', 'done')),
  phase       text not null default 'Desenvolvimento',
  sprint_id   bigint references public.sprints(id) on delete set null,
  start_date  date,
  due_date    date,
  milestone   boolean not null default false,
  position    double precision not null default 0,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index on public.tasks(project_id);

-- Responsáveis: um ou mais integrantes por tarefa
create table public.task_assignees (
  task_id     bigint not null references public.tasks(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid default auth.uid() references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index on public.task_assignees(project_id);
create index on public.task_assignees(user_id);

create table public.task_dependencies (
  task_id    bigint not null references public.tasks(id) on delete cascade,
  depends_on bigint not null references public.tasks(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  primary key (task_id, depends_on),
  check (task_id <> depends_on)
);
create index on public.task_dependencies(project_id);

-- Histórico de colunas: escrito só pelo banco (gatilho), nunca pelo navegador
create table public.status_history (
  id          bigint generated always as identity primary key,
  project_id  uuid not null references public.projects(id) on delete cascade,
  task_id     bigint not null references public.tasks(id) on delete cascade,
  from_status text,
  to_status   text not null,
  changed_by  uuid references public.profiles(id) on delete set null,
  at          timestamptz not null default now()
);
create index on public.status_history(project_id, at);

-- Mensagens entre o administrador e cada integrante, dentro de um projeto.
-- Uma conversa = (project_id, user_id). read_at marca quando o outro lado leu.
create table public.messages (
  id         bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  sender_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  task_id    bigint references public.tasks(id) on delete set null,
  body       text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index on public.messages(user_id, project_id, created_at);
create index on public.messages(project_id) where read_at is null;

-- =====================================================================
-- Funções auxiliares (security definer evita recursão nas políticas)
-- =====================================================================

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    join public.app_admins a on a.email = lower(u.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null
  );
$$;

create or replace function public.project_role(p uuid)
returns public.member_role language sql stable security definer set search_path = '' as $$
  select role from public.project_members where project_id = p and user_id = auth.uid();
$$;

create or replace function public.is_member(p uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.project_members where project_id = p and user_id = auth.uid());
$$;

create or replace function public.can_edit(p uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.project_role(p) in ('owner', 'editor'), false);
$$;

create or replace function public.is_owner(p uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.project_role(p) = 'owner', false);
$$;

create or replace function public.shares_project(other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members a
    join public.project_members b on a.project_id = b.project_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

create or replace function public.self_assign_allowed(p uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select self_assign from public.projects where id = p), false);
$$;

-- =====================================================================
-- Gatilhos
-- =====================================================================

-- Perfil criado junto com a conta
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Quem cria o projeto vira dono
create or replace function public.handle_new_project()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.project_members (project_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;
create trigger on_project_created after insert on public.projects
  for each row execute function public.handle_new_project();

-- Histórico automático de colunas
create or replace function public.log_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.status_history (project_id, task_id, from_status, to_status, changed_by, at)
    values (new.project_id, new.id, null, new.status, auth.uid(), new.created_at);
  elsif new.status is distinct from old.status then
    insert into public.status_history (project_id, task_id, from_status, to_status, changed_by)
    values (new.project_id, new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;
create trigger tasks_status_history after insert or update of status on public.tasks
  for each row execute function public.log_status();

-- A tarefa não pode mudar de projeto
create or replace function public.lock_task_project()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.project_id <> old.project_id then
    raise exception 'Uma tarefa não pode ser movida para outro projeto';
  end if;
  return new;
end;
$$;
create trigger tasks_lock_project before update on public.tasks
  for each row execute function public.lock_task_project();

-- Responsáveis: o projeto vem da tarefa, e o responsável precisa ser integrante
create or replace function public.prepare_assignee()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select project_id into new.project_id from public.tasks where id = new.task_id;
  if new.project_id is null then
    raise exception 'Tarefa não encontrada';
  end if;
  if not exists (select 1 from public.project_members where project_id = new.project_id and user_id = new.user_id) then
    raise exception 'O responsável precisa ser integrante do projeto';
  end if;
  new.assigned_by := auth.uid();
  return new;
end;
$$;
create trigger task_assignees_prepare before insert on public.task_assignees
  for each row execute function public.prepare_assignee();

-- Dependências só entre tarefas do mesmo projeto
create or replace function public.prepare_dependency()
returns trigger language plpgsql security definer set search_path = '' as $$
declare other uuid;
begin
  select project_id into new.project_id from public.tasks where id = new.task_id;
  select project_id into other from public.tasks where id = new.depends_on;
  if new.project_id is null or other is distinct from new.project_id then
    raise exception 'Dependências precisam ser do mesmo projeto';
  end if;
  return new;
end;
$$;
create trigger task_dependencies_prepare before insert on public.task_dependencies
  for each row execute function public.prepare_dependency();

-- Quem sai do projeto deixa de ser responsável pelas tarefas dele
create or replace function public.cleanup_member()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.task_assignees where project_id = old.project_id and user_id = old.user_id;
  return old;
end;
$$;
create trigger project_members_cleanup after delete on public.project_members
  for each row execute function public.cleanup_member();

-- Mensagens: remetente e horário definidos pelo banco
create or replace function public.prepare_message()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.sender_id := auth.uid();
  new.created_at := now();
  new.read_at := null;
  return new;
end;
$$;
create trigger messages_prepare before insert on public.messages
  for each row execute function public.prepare_message();

-- =====================================================================
-- Regras de acesso (Row Level Security)
-- =====================================================================

alter table public.profiles          enable row level security;
alter table public.app_admins        enable row level security;
alter table public.projects          enable row level security;
alter table public.project_members   enable row level security;
alter table public.project_invites   enable row level security;
alter table public.sprints           enable row level security;
alter table public.tasks             enable row level security;
alter table public.task_assignees    enable row level security;
alter table public.task_dependencies enable row level security;
alter table public.status_history    enable row level security;
alter table public.messages          enable row level security;

-- profiles: você, quem divide projeto com você, e o admin
create policy "perfis visíveis" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_project(id) or public.is_admin());
create policy "editar o próprio perfil" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

-- app_admins: só o próprio admin enxerga
create policy "admins visíveis ao admin" on public.app_admins for select to authenticated
  using (public.is_admin());

-- projects
create policy "ver projetos" on public.projects for select to authenticated
  using (public.is_member(id) or owner_id = (select auth.uid()) or public.is_admin());
create policy "criar projeto" on public.projects for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "dono edita projeto" on public.projects for update to authenticated
  using (public.is_owner(id)) with check (public.is_owner(id) and owner_id = (select auth.uid()));
create policy "dono exclui projeto" on public.projects for delete to authenticated
  using (public.is_owner(id));

-- project_members (entradas só pelo gatilho do dono ou por aceitar convite)
create policy "ver integrantes" on public.project_members for select to authenticated
  using (public.is_member(project_id) or public.is_admin());
create policy "dono muda papel" on public.project_members for update to authenticated
  using (public.is_owner(project_id) and role <> 'owner')
  with check (public.is_owner(project_id) and role <> 'owner');
create policy "dono remove ou integrante sai" on public.project_members for delete to authenticated
  using (
    role <> 'owner' and (public.is_owner(project_id) or user_id = (select auth.uid()))
  );

-- project_invites
create policy "ver convites" on public.project_invites for select to authenticated
  using (public.is_owner(project_id) or public.is_admin() or email = lower((select auth.jwt()) ->> 'email'));
create policy "dono convida" on public.project_invites for insert to authenticated
  with check (public.is_owner(project_id) and invited_by = (select auth.uid()));
create policy "cancelar ou recusar convite" on public.project_invites for delete to authenticated
  using (public.is_owner(project_id) or email = lower((select auth.jwt()) ->> 'email'));

-- sprints, tasks, dependências: integrantes leem; dono e editores escrevem
create policy "ver sprints" on public.sprints for select to authenticated
  using (public.is_member(project_id) or public.is_admin());
create policy "criar sprint" on public.sprints for insert to authenticated with check (public.can_edit(project_id));
create policy "editar sprint" on public.sprints for update to authenticated
  using (public.can_edit(project_id)) with check (public.can_edit(project_id));
create policy "excluir sprint" on public.sprints for delete to authenticated using (public.can_edit(project_id));

create policy "ver tarefas" on public.tasks for select to authenticated
  using (public.is_member(project_id) or public.is_admin());
create policy "criar tarefa" on public.tasks for insert to authenticated with check (public.can_edit(project_id));
create policy "editar tarefa" on public.tasks for update to authenticated
  using (public.can_edit(project_id)) with check (public.can_edit(project_id));
create policy "excluir tarefa" on public.tasks for delete to authenticated using (public.can_edit(project_id));

create policy "ver dependências" on public.task_dependencies for select to authenticated
  using (public.is_member(project_id) or public.is_admin());
create policy "criar dependência" on public.task_dependencies for insert to authenticated
  with check (public.can_edit(project_id));
create policy "excluir dependência" on public.task_dependencies for delete to authenticated
  using (public.can_edit(project_id));

-- Responsáveis: o dono atribui qualquer integrante; os demais (dono ou editor)
-- podem se atribuir sozinhos quando o projeto permite (self_assign).
create policy "ver responsáveis" on public.task_assignees for select to authenticated
  using (public.is_member(project_id) or public.is_admin());
create policy "atribuir responsável" on public.task_assignees for insert to authenticated
  with check (
    public.is_owner(project_id)
    or (user_id = (select auth.uid()) and public.can_edit(project_id) and public.self_assign_allowed(project_id))
  );
create policy "remover responsável" on public.task_assignees for delete to authenticated
  using (
    public.is_owner(project_id)
    or (user_id = (select auth.uid()) and public.can_edit(project_id) and public.self_assign_allowed(project_id))
  );

create policy "ver histórico" on public.status_history for select to authenticated
  using (public.is_member(project_id) or public.is_admin());

-- Mensagens: cada integrante vê a própria conversa; o admin vê todas.
create policy "ver mensagens" on public.messages for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy "enviar mensagem" on public.messages for insert to authenticated
  with check (
    exists (select 1 from public.project_members m where m.project_id = messages.project_id and m.user_id = messages.user_id)
    and (public.is_admin() or (user_id = (select auth.uid()) and public.is_member(project_id)))
  );

-- Visitantes não autenticados não acessam nada
revoke all on all tables in schema public from anon;

-- =====================================================================
-- Funções chamadas pelo app (RPC)
-- =====================================================================

-- Convites pendentes para o e-mail de quem está logado
create or replace function public.my_invites()
returns table (id uuid, project_id uuid, project_name text, role public.member_role, invited_by_name text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.id, i.project_id, p.name, i.role, coalesce(nullif(pr.full_name, ''), pr.email), i.created_at
  from public.project_invites i
  join public.projects p on p.id = i.project_id
  join public.profiles pr on pr.id = i.invited_by
  join auth.users u on u.id = auth.uid()
  where i.email = lower(u.email) and u.email_confirmed_at is not null
  order by i.created_at desc;
$$;

create or replace function public.accept_invite(invite_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare inv public.project_invites;
begin
  select i.* into inv from public.project_invites i
  join auth.users u on u.id = auth.uid()
  where i.id = invite_id and i.email = lower(u.email) and u.email_confirmed_at is not null;
  if inv.id is null then
    raise exception 'Convite não encontrado para este e-mail';
  end if;
  insert into public.project_members (project_id, user_id, role)
  values (inv.project_id, auth.uid(), inv.role)
  on conflict (project_id, user_id) do nothing;
  delete from public.project_invites where id = inv.id;
  return inv.project_id;
end;
$$;

-- Marca como lidas as mensagens recebidas numa conversa
create or replace function public.mark_thread_read(p_project uuid, p_user uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer := 0;
begin
  if auth.uid() = p_user then
    update public.messages set read_at = now()
    where project_id = p_project and user_id = p_user and sender_id <> p_user and read_at is null;
    get diagnostics n = row_count;
  elsif public.is_admin() then
    update public.messages set read_at = now()
    where project_id = p_project and user_id = p_user and sender_id = p_user and read_at is null;
    get diagnostics n = row_count;
  end if;
  return n;
end;
$$;

-- Caixa de mensagens: uma linha por conversa.
-- unread       = mensagens que EU ainda não li
-- unread_other = mensagens que EU enviei e o outro lado ainda não leu
create or replace function public.inbox()
returns table (
  project_id uuid, project_name text, user_id uuid, user_name text, user_email text,
  last_body text, last_at timestamptz, last_sender uuid, unread integer, unread_other integer
)
language sql stable security definer set search_path = '' as $$
  with me as (select auth.uid() as id, public.is_admin() as admin),
  threads as (
    select m.project_id, m.user_id
    from public.messages m, me
    where m.user_id = me.id or me.admin
    group by m.project_id, m.user_id
  )
  select t.project_id, p.name, t.user_id,
         coalesce(nullif(pr.full_name, ''), pr.email), pr.email,
         last.body, last.created_at, last.sender_id,
         (select count(*)::int from public.messages x, me
           where x.project_id = t.project_id and x.user_id = t.user_id and x.read_at is null
             and (case when me.id = t.user_id then x.sender_id <> t.user_id else x.sender_id = t.user_id end)),
         (select count(*)::int from public.messages x, me
           where x.project_id = t.project_id and x.user_id = t.user_id and x.read_at is null
             and (case when me.id = t.user_id then x.sender_id = t.user_id else x.sender_id <> t.user_id end))
  from threads t
  join public.projects p on p.id = t.project_id
  join public.profiles pr on pr.id = t.user_id
  cross join lateral (
    select body, created_at, sender_id from public.messages
    where project_id = t.project_id and user_id = t.user_id
    order by created_at desc limit 1
  ) last
  order by last.created_at desc;
$$;

-- Visão geral para o administrador
create or replace function public.admin_projects()
returns table (
  id uuid, name text, owner_name text, owner_email text, created_at timestamptz,
  members integer, tasks integer, done integer, late integer,
  points_total integer, points_done integer, last_activity timestamptz, unread integer
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito ao administrador';
  end if;
  return query
  select p.id, p.name, coalesce(nullif(o.full_name, ''), o.email), o.email, p.created_at,
    (select count(*)::int from public.project_members m where m.project_id = p.id),
    (select count(*)::int from public.tasks t where t.project_id = p.id),
    (select count(*)::int from public.tasks t where t.project_id = p.id and t.status = 'done'),
    (select count(*)::int from public.tasks t where t.project_id = p.id and t.status <> 'done' and t.due_date < current_date),
    (select coalesce(sum(t.points), 0)::int from public.tasks t where t.project_id = p.id and not t.milestone),
    (select coalesce(sum(t.points), 0)::int from public.tasks t where t.project_id = p.id and not t.milestone and t.status = 'done'),
    greatest(p.created_at, (select max(h.at) from public.status_history h where h.project_id = p.id)),
    (select count(*)::int from public.messages x where x.project_id = p.id and x.sender_id = x.user_id and x.read_at is null)
  from public.projects p
  join public.profiles o on o.id = p.owner_id
  order by 12 desc nulls last;
end;
$$;

create or replace function public.admin_users()
returns table (
  id uuid, email text, full_name text, created_at timestamptz, last_sign_in_at timestamptz,
  projects integer, open_tasks integer, unread integer
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito ao administrador';
  end if;
  return query
  select pr.id, pr.email, pr.full_name, pr.created_at, u.last_sign_in_at,
    (select count(*)::int from public.project_members m where m.user_id = pr.id),
    (select count(*)::int from public.task_assignees a join public.tasks t on t.id = a.task_id
       where a.user_id = pr.id and t.status <> 'done'),
    (select count(*)::int from public.messages x where x.user_id = pr.id and x.sender_id = pr.id and x.read_at is null)
  from public.profiles pr
  join auth.users u on u.id = pr.id
  order by u.last_sign_in_at desc nulls last;
end;
$$;

-- Permissões de execução
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.is_admin(), public.project_role(uuid), public.is_member(uuid), public.can_edit(uuid),
  public.is_owner(uuid), public.shares_project(uuid), public.self_assign_allowed(uuid),
  public.my_invites(), public.accept_invite(uuid), public.mark_thread_read(uuid, uuid),
  public.inbox(), public.admin_projects(), public.admin_users()
to authenticated;

-- =====================================================================
-- Tempo real: o app recebe alterações sem recarregar
-- =====================================================================
alter publication supabase_realtime add table
  public.projects, public.project_members, public.sprints, public.tasks,
  public.task_assignees, public.task_dependencies, public.status_history, public.messages;

-- =====================================================================
-- Projeto de exemplo: tarefas, sprints, dependências e histórico com
-- datas relativas a hoje, para os gráficos já nascerem preenchidos.
-- Chamado pelo app em "Novo projeto → com dados de exemplo".
-- =====================================================================

-- O histórico automático fica em pausa só enquanto o exemplo é montado
create or replace function public.log_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('trilha.seeding', true) = '1' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    insert into public.status_history (project_id, task_id, from_status, to_status, changed_by, at)
    values (new.project_id, new.id, null, new.status, auth.uid(), new.created_at);
  elsif new.status is distinct from old.status then
    insert into public.status_history (project_id, task_id, from_status, to_status, changed_by)
    values (new.project_id, new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

create or replace function public.seed_sample_project(p uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  t0 date := current_date - 27;
  sprint_ids bigint[] := '{}';
  task_ids bigint[] := '{}';
  sid bigint;
  tid bigint;
  r record;
  h text;
  parts text[];
  prev text;
  k int;
  owner uuid;
begin
  if not public.is_owner(p) then
    raise exception 'Apenas o dono pode preencher o projeto com o exemplo';
  end if;
  select owner_id into owner from public.projects where id = p;
  perform set_config('trilha.seeding', '1', true);

  for i in 0..3 loop
    insert into public.sprints (project_id, name, start_date, end_date)
    values (p, 'Sprint ' || (i + 1), t0 + i * 14, t0 + i * 14 + 13)
    returning id into sid;
    sprint_ids := sprint_ids || sid;
  end loop;

  for r in
    select * from (values
      (1,  'Matriz CSD e entrevistas com alunos', 'Levantar certezas, suposições e dúvidas sobre a procura por monitoria.', 'Ideação', 3, 'alta', 0, 3, '{}'::int[], 1, false, '{todo:0,doing:0,done:3}'::text[]),
      (2,  'Personas e mapa de empatia', 'Duas personas: aluno com dificuldade e monitor voluntário.', 'Ideação', 2, 'media', 2, 3, '{1}', 1, false, '{todo:0,doing:2,review:4,done:5}'),
      (3,  'Lean Canvas', 'Problema, segmentos, proposta de valor e métricas-chave.', 'Definição', 2, 'alta', 4, 2, '{2}', 1, false, '{todo:0,doing:4,done:6}'),
      (4,  'Problema validado', 'Marco: hipótese principal confirmada com 12 entrevistas.', 'Definição', 0, 'alta', 6, 0, '{3}', 1, true, '{todo:0,done:6}'),
      (5,  'User Story Mapping e backlog', 'Mapa do fluxo do aluno e corte do MVP.', 'Planejamento', 3, 'alta', 7, 3, '{4}', 1, false, '{todo:1,doing:7,done:10}'),
      (6,  'Wireframes das telas', 'Agenda, reserva, perfil do monitor e notificações.', 'Design', 5, 'media', 9, 5, '{5}', 1, false, '{todo:1,doing:9,review:13,done:15}'),
      (7,  'Design system', 'Cores, tipografia, espaçamentos e componentes base.', 'Design', 3, 'media', 11, 4, '{5}', 1, false, '{todo:1,doing:12,done:16}'),
      (8,  'Protótipo navegável e teste de usabilidade', 'Teste com 5 alunos; ajustar fluxo de reserva.', 'Design', 5, 'alta', 15, 5, '{6,7}', 2, false, '{todo:14,doing:16,review:20,done:22}'),
      (9,  'Repositório e integração contínua', 'Monorepo, lint, testes automáticos no GitHub Actions.', 'Desenvolvimento', 2, 'media', 10, 2, '{5}', 1, false, '{todo:1,doing:10,done:12}'),
      (10, 'Login com Google', 'Restringir ao domínio institucional.', 'Desenvolvimento', 5, 'alta', 14, 6, '{9}', 2, false, '{todo:14,doing:15,review:22,done:24}'),
      (11, 'Agenda de monitorias', 'Listar horários livres e reservar vaga.', 'Desenvolvimento', 8, 'critica', 20, 9, '{8,10}', 2, false, '{todo:14,doing:21}'),
      (12, 'Notificações de lembrete', 'Aviso 1 h antes da monitoria.', 'Desenvolvimento', 5, 'media', 22, 6, '{10}', 2, false, '{todo:14,doing:22,review:26}'),
      (13, 'Painel do monitor', 'Ver reservas do dia e marcar presença.', 'Desenvolvimento', 5, 'media', 24, 5, '{10}', 2, false, '{todo:14}'),
      (14, 'Termos de uso e LGPD', 'Texto revisado pela coordenação.', 'Planejamento', 2, 'alta', 18, 3, '{}', 2, false, '{todo:14,doing:19}'),
      (15, 'Testes E2E dos fluxos principais', 'Reserva, cancelamento e lembrete.', 'Testes', 5, 'alta', 30, 5, '{11,12}', 3, false, '{todo:20}'),
      (16, 'Correções do teste beta', 'Reservar capacidade para ajustes.', 'Testes', 3, 'media', 35, 4, '{15}', 3, false, '{backlog:20}'),
      (17, 'Checklist de release e plano de rollback', '', 'Lançamento', 2, 'media', 38, 2, '{15}', 3, false, '{backlog:20}'),
      (18, 'Lançamento beta', 'Marco: turma piloto usando o app.', 'Lançamento', 0, 'critica', 40, 0, '{16,17}', 3, true, '{backlog:20}'),
      (19, 'Painel de métricas (OKRs e funil AARRR)', 'Sem datas definidas: o Gantt estima pela pontuação e dependências.', 'Operação', 3, 'baixa', null, 3, '{18}', 4, false, '{backlog:22}'),
      (20, 'Plano de descontinuação da versão piloto', 'Comunicação, exportação de dados e arquivamento.', 'Fim do ciclo', 2, 'baixa', null, 2, '{19}', null, false, '{backlog:25}')
    ) as v(idx, title, descr, phase, points, prio, start_off, dur, deps, sprint, ms, hist)
    order by idx
  loop
    parts := string_to_array(r.hist[array_length(r.hist, 1)], ':');
    insert into public.tasks (project_id, title, description, phase, points, priority, status, sprint_id,
                              start_date, due_date, milestone, position, created_by, created_at)
    values (
      p, r.title, r.descr, r.phase, r.points, r.prio, parts[1],
      case when r.sprint is null then null else sprint_ids[r.sprint] end,
      case when r.start_off is null then null else t0 + r.start_off end,
      case when r.start_off is null then null else t0 + r.start_off + greatest(0, r.dur - case when r.ms then 0 else 1 end) end,
      r.ms, r.idx, owner,
      (t0 + split_part(r.hist[1], ':', 2)::int + time '09:00')::timestamp at time zone 'America/Sao_Paulo'
    )
    returning id into tid;
    task_ids := task_ids || tid;

    -- histórico retroativo (o registro automático está em pausa)
    prev := null;
    k := 0;
    foreach h in array r.hist loop
      parts := string_to_array(h, ':');
      insert into public.status_history (project_id, task_id, from_status, to_status, changed_by, at)
      values (p, tid, prev, parts[1], owner,
              (t0 + parts[2]::int + time '09:00' + make_interval(mins => r.idx + k))::timestamp at time zone 'America/Sao_Paulo');
      prev := parts[1];
      k := k + 1;
    end loop;

    for k in 1..coalesce(array_length(r.deps, 1), 0) loop
      insert into public.task_dependencies (task_id, depends_on, project_id)
      values (tid, task_ids[r.deps[k]], p);
    end loop;

    if not r.ms then
      insert into public.task_assignees (task_id, project_id, user_id) values (tid, p, owner);
    end if;
  end loop;

  perform set_config('trilha.seeding', '0', true);
end;
$$;

revoke execute on function public.seed_sample_project(uuid) from public, anon;
grant execute on function public.seed_sample_project(uuid) to authenticated;

-- Administrador do sistema (entra em vigor quando este e-mail confirmar o cadastro).
-- Para trocar ou incluir outro admin, edite e rode novamente.
insert into public.app_admins (email) values ('jonatas.junior@gmail.com')
on conflict do nothing;

-- Convites aceitos ficam registrados (accepted_at) em vez de serem apagados.
alter table public.project_invites add column accepted_at timestamptz;

create or replace function public.accept_invite(invite_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare inv public.project_invites;
begin
  select i.* into inv from public.project_invites i
  join auth.users u on u.id = auth.uid()
  where i.id = invite_id and i.accepted_at is null
    and i.email = lower(u.email) and u.email_confirmed_at is not null;
  if inv.id is null then
    raise exception 'Convite não encontrado para este e-mail';
  end if;
  insert into public.project_members (project_id, user_id, role)
  values (inv.project_id, auth.uid(), inv.role)
  on conflict (project_id, user_id) do nothing;
  update public.project_invites set accepted_at = now() where id = inv.id;
  return inv.project_id;
end;
$$;

create or replace function public.my_invites()
returns table (id uuid, project_id uuid, project_name text, role public.member_role, invited_by_name text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.id, i.project_id, p.name, i.role, coalesce(nullif(pr.full_name, ''), pr.email), i.created_at
  from public.project_invites i
  join public.projects p on p.id = i.project_id
  join public.profiles pr on pr.id = i.invited_by
  join auth.users u on u.id = auth.uid()
  where i.accepted_at is null and i.email = lower(u.email) and u.email_confirmed_at is not null
  order by i.created_at desc;
$$;

-- Reconvidar quem já aceitou antes (e depois saiu) reaproveita o convite antigo
create or replace function public.reopen_invite()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.project_invites
     set accepted_at = null, role = new.role, invited_by = new.invited_by, created_at = now()
   where project_id = new.project_id and email = new.email and accepted_at is not null;
  if found then
    return null;
  end if;
  return new;
end;
$$;
create trigger project_invites_reopen before insert on public.project_invites
  for each row execute function public.reopen_invite();

-- Funções de gatilho não podem ser chamadas diretamente pela API
revoke execute on function
  public.handle_new_user(), public.handle_new_project(), public.log_status(), public.lock_task_project(),
  public.prepare_assignee(), public.prepare_dependency(), public.cleanup_member(), public.prepare_message(),
  public.reopen_invite()
from public, anon, authenticated;

-- =====================================================================
-- Prazo de existência dos projetos e autorização para salvar no Google Drive.
-- Só o administrador do sistema altera esses dois campos.
-- =====================================================================

alter table public.projects
  add column expires_at timestamptz,
  add column drive_export_allowed boolean not null default false;

-- Padrões aplicados aos projetos criados daqui em diante (uma única linha)
create table public.app_settings (
  id boolean primary key default true check (id),
  default_expires_at timestamptz,
  default_drive_export boolean not null default false
);
insert into public.app_settings (id) values (true);
alter table public.app_settings enable row level security;
create policy "configurações visíveis ao admin" on public.app_settings for select to authenticated
  using (public.is_admin());

-- Quem não é admin não define nem altera prazo e autorização
create or replace function public.guard_project_admin_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.app_settings;
begin
  if public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    select * into s from public.app_settings where id;
    new.expires_at := s.default_expires_at;
    new.drive_export_allowed := coalesce(s.default_drive_export, false);
  else
    new.expires_at := old.expires_at;
    new.drive_export_allowed := old.drive_export_allowed;
  end if;
  return new;
end;
$$;
create trigger projects_guard_admin_fields before insert or update on public.projects
  for each row execute function public.guard_project_admin_fields();

-- Prazo para alguns projetos (p_ids) ou para todos (p_ids nulo). p_date nulo remove o prazo.
create or replace function public.admin_set_expiry(p_ids uuid[], p_date timestamptz)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito ao administrador';
  end if;
  update public.projects set expires_at = p_date where p_ids is null or id = any (p_ids);
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.admin_set_drive_export(p_ids uuid[], p_allowed boolean)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito ao administrador';
  end if;
  update public.projects set drive_export_allowed = p_allowed where p_ids is null or id = any (p_ids);
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.admin_set_defaults(p_expires_at timestamptz, p_drive_export boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito ao administrador';
  end if;
  update public.app_settings set default_expires_at = p_expires_at, default_drive_export = p_drive_export where id;
end;
$$;

-- Visão do admin com prazo e autorização (nova versão, mantendo a anterior)
create or replace function public.admin_projects_v2()
returns table (
  id uuid, name text, owner_name text, owner_email text, created_at timestamptz,
  members integer, tasks integer, done integer, late integer,
  points_total integer, points_done integer, last_activity timestamptz, unread integer,
  expires_at timestamptz, drive_export_allowed boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito ao administrador';
  end if;
  return query
  select a.*, p.expires_at, p.drive_export_allowed
  from public.admin_projects() a
  join public.projects p on p.id = a.id;
end;
$$;

revoke execute on function public.guard_project_admin_fields() from public, anon, authenticated;
revoke execute on function
  public.admin_set_expiry(uuid[], timestamptz), public.admin_set_drive_export(uuid[], boolean),
  public.admin_set_defaults(timestamptz, boolean), public.admin_projects_v2()
from public, anon;
grant execute on function
  public.admin_set_expiry(uuid[], timestamptz), public.admin_set_drive_export(uuid[], boolean),
  public.admin_set_defaults(timestamptz, boolean), public.admin_projects_v2()
to authenticated;

-- =====================================================================
-- Limpeza diária: apaga os projetos cujo prazo de existência já passou.
-- Roda todo dia às 03:15 (horário de Brasília) pelo pg_cron do Supabase.
-- Tarefas, histórico, convites e mensagens do projeto saem junto (cascade).
-- =====================================================================

create extension if not exists pg_cron;

create or replace function public.purge_expired_projects()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.projects where expires_at is not null and expires_at < now();
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.purge_expired_projects() from public, anon, authenticated;

select cron.schedule('trilha-limpeza-projetos-expirados', '15 6 * * *', 'select public.purge_expired_projects()');

-- =====================================================================
-- Limite de integrantes por equipe, definido pelo administrador.
-- Vazio (null) = sem limite. Conta o criador, os integrantes e os
-- convites ainda não aceitos. Baixar o limite não remove ninguém:
-- só impede novos convites e entradas.
-- =====================================================================

alter table public.projects
  add column max_members integer check (max_members is null or max_members between 1 and 200);

alter table public.app_settings
  add column default_max_members integer check (default_max_members is null or default_max_members between 1 and 200);

-- O campo entra na mesma proteção do prazo e do Drive: só o admin altera
create or replace function public.guard_project_admin_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.app_settings;
begin
  if public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    select * into s from public.app_settings where id;
    new.expires_at := s.default_expires_at;
    new.drive_export_allowed := coalesce(s.default_drive_export, false);
    new.max_members := s.default_max_members;
  else
    new.expires_at := old.expires_at;
    new.drive_export_allowed := old.drive_export_allowed;
    new.max_members := old.max_members;
  end if;
  return new;
end;
$$;

-- Vagas ocupadas = integrantes + convites pendentes (sem contar um e-mail específico)
create or replace function public.team_seats_used(p uuid, except_email text default null)
returns integer language sql stable security definer set search_path = '' as $$
  select
    (select count(*) from public.project_members m where m.project_id = p)::int
  + (select count(*) from public.project_invites i
      where i.project_id = p and i.accepted_at is null
        and (except_email is null or i.email <> except_email))::int;
$$;

-- Novo convite (ou reconvite): precisa haver vaga.
-- O nome começa com "0" para rodar antes do gatilho que reaproveita convites antigos.
create or replace function public.check_team_limit_invite()
returns trigger language plpgsql security definer set search_path = '' as $$
declare lim integer;
begin
  select max_members into lim from public.projects where id = new.project_id;
  if lim is not null and public.team_seats_used(new.project_id, new.email) >= lim then
    raise exception 'A equipe já atingiu o limite de % integrantes (contando convites pendentes)', lim
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger project_invites_0_team_limit before insert on public.project_invites
  for each row execute function public.check_team_limit_invite();

-- Entrada na equipe (aceitar convite): o próprio convite já ocupa uma vaga,
-- então só barra se os integrantes já preenchem o limite.
create or replace function public.check_team_limit_member()
returns trigger language plpgsql security definer set search_path = '' as $$
declare lim integer;
begin
  select max_members into lim from public.projects where id = new.project_id;
  if lim is not null
     and (select count(*) from public.project_members m where m.project_id = new.project_id) >= lim then
    raise exception 'A equipe já atingiu o limite de % integrantes', lim using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger project_members_0_team_limit before insert on public.project_members
  for each row execute function public.check_team_limit_member();

-- Limite para alguns projetos (p_ids) ou para todos (p_ids nulo). p_max nulo remove o limite.
create or replace function public.admin_set_max_members(p_ids uuid[], p_max integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito ao administrador';
  end if;
  update public.projects set max_members = p_max where p_ids is null or id = any (p_ids);
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.admin_set_default_max_members(p_max integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito ao administrador';
  end if;
  update public.app_settings set default_max_members = p_max where id;
end;
$$;

-- Visão do admin com o limite e os convites pendentes
create or replace function public.admin_projects_v3()
returns table (
  id uuid, name text, owner_name text, owner_email text, created_at timestamptz,
  members integer, tasks integer, done integer, late integer,
  points_total integer, points_done integer, last_activity timestamptz, unread integer,
  expires_at timestamptz, drive_export_allowed boolean,
  max_members integer, pending_invites integer
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito ao administrador';
  end if;
  return query
  select v.*, p.max_members,
    (select count(*) from public.project_invites i where i.project_id = v.id and i.accepted_at is null)::int
  from public.admin_projects_v2() v
  join public.projects p on p.id = v.id;
end;
$$;

-- Funções internas (gatilhos e contagem) não ficam expostas na API
revoke execute on function
  public.guard_project_admin_fields(), public.check_team_limit_invite(), public.check_team_limit_member(),
  public.team_seats_used(uuid, text)
from public, anon, authenticated;
revoke execute on function
  public.admin_set_max_members(uuid[], integer),
  public.admin_set_default_max_members(integer), public.admin_projects_v3()
from public, anon;
grant execute on function
  public.admin_set_max_members(uuid[], integer),
  public.admin_set_default_max_members(integer), public.admin_projects_v3()
to authenticated;
-- =====================================================================
-- Controle de acesso ao sistema (gerido pelo administrador):
--  • domínios permitidos para novos cadastros (ex.: ficr.edu.br, que
--    também aceita subdomínios como aluno.ficr.edu.br);
--  • e-mails liberados avulsos, de qualquer domínio;
--  • administradores (sempre podem se cadastrar);
--  • bloqueio e exclusão de contas.
-- Lista de domínios vazia = cadastro aberto para qualquer e-mail.
-- Remover domínio, e-mail ou administrador só desativa o registro
-- (removed_at / revoked_at), mantendo o histórico.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Parte 1: regras de cadastro
-- ---------------------------------------------------------------------

create table public.allowed_domains (
  domain     text primary key check (domain = lower(domain) and domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  note       text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table public.allowed_emails (
  email      text primary key check (email = lower(email) and email like '%_@_%.__%'),
  note       text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

alter table public.allowed_domains enable row level security;
alter table public.allowed_emails  enable row level security;
create policy "domínios visíveis ao admin" on public.allowed_domains for select to authenticated using (public.is_admin());
create policy "e-mails liberados visíveis ao admin" on public.allowed_emails for select to authenticated using (public.is_admin());
-- escrita só pelas funções abaixo (sem políticas de insert/update)

insert into public.allowed_domains (domain, note) values ('ficr.edu.br', 'Faculdade Integrada do Recife');

-- Regra única usada no cadastro, na troca de e-mail e nos convites
create or replace function public.email_allowed(p_email text)
returns boolean language sql stable security definer set search_path = '' as $$
  with e as (select lower(trim(p_email)) as email, split_part(lower(trim(p_email)), '@', 2) as dom)
  select
    exists (select 1 from public.app_admins a, e where a.email = e.email)
    or exists (select 1 from public.allowed_emails x, e where x.email = e.email)
    or not exists (select 1 from public.allowed_domains)
    or exists (select 1 from public.allowed_domains d, e where e.dom = d.domain or e.dom like '%.' || d.domain);
$$;

-- Tela de cadastro: pode verificar antes de enviar (sem login)
create or replace function public.can_sign_up(p_email text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.email_allowed(p_email);
$$;

-- Tela de cadastro: domínios aceitos, para a mensagem de orientação
create or replace function public.signup_domains()
returns setof text language sql stable security definer set search_path = '' as $$
  select domain from public.allowed_domains order by domain;
$$;

-- Barra o cadastro (e a troca de e-mail) fora da regra
create or replace function public.guard_signup_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.email is not distinct from old.email then
    return new;
  end if;
  if new.email is not null and not public.email_allowed(new.email) then
    raise exception 'Cadastro não permitido para este e-mail. Use o e-mail institucional ou peça ao administrador para liberar o seu.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger guard_signup_email before insert or update of email on auth.users
  for each row execute function public.guard_signup_email();

-- Convite só para quem pode entrar (ou já tem conta)
create or replace function public.check_invite_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.email_allowed(new.email)
     and not exists (select 1 from auth.users u where lower(u.email) = new.email) then
    raise exception 'Este e-mail não pode se cadastrar no sistema (domínio não permitido). Use o e-mail institucional da pessoa ou peça ao administrador para liberá-lo.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger project_invites_1_email_allowed before insert on public.project_invites
  for each row execute function public.check_invite_email();

create or replace function public.require_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito ao administrador';
  end if;
end;
$$;

-- Normaliza "@FICR.edu.br " → "ficr.edu.br"
create or replace function public.clean_domain(p text)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(lower(trim(p)), '^@+', '');
$$;

revoke execute on function
  public.email_allowed(text), public.guard_signup_email(), public.check_invite_email(),
  public.require_admin(), public.clean_domain(text)
from public, anon, authenticated;
revoke execute on function public.can_sign_up(text), public.signup_domains() from public;
grant execute on function public.can_sign_up(text), public.signup_domains() to anon, authenticated;

-- ---------------------------------------------------------------------
-- Parte 2: remover = desativar (mantém histórico)
-- ---------------------------------------------------------------------

alter table public.allowed_domains add column removed_at timestamptz;
alter table public.allowed_emails  add column removed_at timestamptz;
alter table public.app_admins      add column revoked_at timestamptz;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    join public.app_admins a on a.email = lower(u.email) and a.revoked_at is null
    where u.id = auth.uid() and u.email_confirmed_at is not null
  );
$$;

create or replace function public.email_allowed(p_email text)
returns boolean language sql stable security definer set search_path = '' as $$
  with e as (select lower(trim(p_email)) as email, split_part(lower(trim(p_email)), '@', 2) as dom),
       doms as (select domain from public.allowed_domains where removed_at is null)
  select
    exists (select 1 from public.app_admins a, e where a.email = e.email and a.revoked_at is null)
    or exists (select 1 from public.allowed_emails x, e where x.email = e.email and x.removed_at is null)
    or not exists (select 1 from doms)
    or exists (select 1 from doms d, e where e.dom = d.domain or e.dom like '%.' || d.domain);
$$;

create or replace function public.signup_domains()
returns setof text language sql stable security definer set search_path = '' as $$
  select domain from public.allowed_domains where removed_at is null order by domain;
$$;

-- ---------------------------------------------------------------------
-- Parte 3: funções do administrador
-- ---------------------------------------------------------------------

create or replace function public.admin_add_domain(p_domain text, p_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare d text := public.clean_domain(p_domain);
begin
  perform public.require_admin();
  if exists (select 1 from public.allowed_domains where domain = d and removed_at is null) then
    raise exception 'Este domínio já está na lista';
  end if;
  insert into public.allowed_domains (domain, note, created_by)
  values (d, coalesce(trim(p_note), ''), auth.uid())
  on conflict (domain) do update
    set removed_at = null, note = excluded.note, created_by = excluded.created_by, created_at = now();
exception when check_violation then
  raise exception 'Domínio inválido. Use o formato ficr.edu.br';
end;
$$;

-- Editar: troca o domínio e/ou a observação
create or replace function public.admin_update_domain(p_old text, p_domain text, p_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare od text := public.clean_domain(p_old);
        nd text := public.clean_domain(p_domain);
begin
  perform public.require_admin();
  if not exists (select 1 from public.allowed_domains where domain = od and removed_at is null) then
    raise exception 'Domínio não encontrado';
  end if;
  if nd = od then
    update public.allowed_domains set note = coalesce(trim(p_note), '') where domain = od;
    return;
  end if;
  if exists (select 1 from public.allowed_domains where domain = nd and removed_at is null) then
    raise exception 'Este domínio já está na lista';
  end if;
  insert into public.allowed_domains (domain, note, created_by)
  values (nd, coalesce(trim(p_note), ''), auth.uid())
  on conflict (domain) do update
    set removed_at = null, note = excluded.note, created_by = excluded.created_by, created_at = now();
  update public.allowed_domains set removed_at = now() where domain = od;
exception when check_violation then
  raise exception 'Domínio inválido. Use o formato ficr.edu.br';
end;
$$;

create or replace function public.admin_remove_domain(p_domain text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  update public.allowed_domains set removed_at = now()
   where domain = public.clean_domain(p_domain) and removed_at is null;
end;
$$;

create or replace function public.admin_add_email(p_email text, p_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  insert into public.allowed_emails (email, note, created_by)
  values (lower(trim(p_email)), coalesce(trim(p_note), ''), auth.uid())
  on conflict (email) do update
    set removed_at = null, note = excluded.note, created_by = excluded.created_by, created_at = now();
exception when check_violation then
  raise exception 'E-mail inválido';
end;
$$;

create or replace function public.admin_remove_email(p_email text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  update public.allowed_emails set removed_at = now()
   where email = lower(trim(p_email)) and removed_at is null;
end;
$$;

create or replace function public.admin_add_admin(p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare e text := lower(trim(p_email));
begin
  perform public.require_admin();
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido';
  end if;
  insert into public.app_admins (email) values (e)
  on conflict (email) do update set revoked_at = null;
end;
$$;

create or replace function public.admin_remove_admin(p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare e text := lower(trim(p_email));
begin
  perform public.require_admin();
  if e = (select lower(u.email) from auth.users u where u.id = auth.uid()) then
    raise exception 'Você não pode tirar a sua própria permissão de administrador';
  end if;
  update public.app_admins set revoked_at = now() where email = e and revoked_at is null;
end;
$$;

-- Bloqueio: a pessoa não consegue mais entrar (a sessão aberta expira em até 1 hora)
create or replace function public.admin_set_blocked(p_user uuid, p_blocked boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare e text;
begin
  perform public.require_admin();
  if p_user = auth.uid() then
    raise exception 'Você não pode bloquear a sua própria conta';
  end if;
  select lower(email) into e from auth.users where id = p_user;
  if p_blocked and exists (select 1 from public.app_admins where email = e and revoked_at is null) then
    raise exception 'Tire a permissão de administrador antes de bloquear esta conta';
  end if;
  update auth.users set banned_until = case when p_blocked then 'infinity'::timestamptz else null end where id = p_user;
end;
$$;

-- Listas da área "Acesso ao sistema"
create or replace function public.admin_access_lists()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'domains', coalesce((
      select jsonb_agg(jsonb_build_object(
        'domain', d.domain, 'note', d.note, 'created_at', d.created_at,
        'users', (select count(*) from auth.users u
                   where split_part(lower(u.email), '@', 2) = d.domain
                      or split_part(lower(u.email), '@', 2) like '%.' || d.domain)
      ) order by d.domain) from public.allowed_domains d where d.removed_at is null), '[]'::jsonb),
    'emails', coalesce((
      select jsonb_agg(jsonb_build_object(
        'email', x.email, 'note', x.note, 'created_at', x.created_at,
        'registered', exists (select 1 from auth.users u where lower(u.email) = x.email)
      ) order by x.email) from public.allowed_emails x where x.removed_at is null), '[]'::jsonb),
    'admins', coalesce((
      select jsonb_agg(jsonb_build_object(
        'email', a.email,
        'registered', exists (select 1 from auth.users u where lower(u.email) = a.email),
        'confirmed', exists (select 1 from auth.users u where lower(u.email) = a.email and u.email_confirmed_at is not null),
        'me', a.email = (select lower(u.email) from auth.users u where u.id = auth.uid())
      ) order by a.email) from public.app_admins a where a.revoked_at is null), '[]'::jsonb)
  );
end;
$$;

-- Usuários com papel e situação
create or replace function public.admin_users_v2()
returns table (
  id uuid, email text, full_name text, created_at timestamptz, last_sign_in_at timestamptz,
  projects integer, open_tasks integer, unread integer,
  is_admin boolean, blocked boolean, confirmed boolean, owned_projects integer
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return query
  select v.*,
    exists (select 1 from public.app_admins a where a.email = lower(u.email) and a.revoked_at is null),
    coalesce(u.banned_until > now(), false),
    u.email_confirmed_at is not null,
    (select count(*)::int from public.projects p where p.owner_id = v.id)
  from public.admin_users() v
  join auth.users u on u.id = v.id;
end;
$$;

revoke execute on function
  public.admin_add_domain(text, text), public.admin_update_domain(text, text, text), public.admin_remove_domain(text),
  public.admin_add_email(text, text), public.admin_remove_email(text),
  public.admin_add_admin(text), public.admin_remove_admin(text),
  public.admin_set_blocked(uuid, boolean), public.admin_access_lists(), public.admin_users_v2()
from public, anon;
grant execute on function
  public.admin_add_domain(text, text), public.admin_update_domain(text, text, text), public.admin_remove_domain(text),
  public.admin_add_email(text, text), public.admin_remove_email(text),
  public.admin_add_admin(text), public.admin_remove_admin(text),
  public.admin_set_blocked(uuid, boolean), public.admin_access_lists(), public.admin_users_v2()
to authenticated;

-- ---------------------------------------------------------------------
-- Parte 4: exclusão definitiva de conta (apaga a conta, os projetos
-- que ela criou e as mensagens dela)
-- ---------------------------------------------------------------------

create or replace function public.admin_delete_user(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare e text;
begin
  perform public.require_admin();
  if p_user = auth.uid() then
    raise exception 'Você não pode excluir a sua própria conta por aqui';
  end if;
  select lower(email) into e from auth.users where id = p_user;
  if exists (select 1 from public.app_admins where email = e and revoked_at is null) then
    raise exception 'Tire a permissão de administrador antes de excluir esta conta';
  end if;
  delete from auth.users where id = p_user;
end;
$$;
revoke execute on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;
-- =====================================================================
-- Mural da equipe: conversa do grupo de cada projeto.
-- Veem e escrevem: todos os integrantes (criador, editores e leitores)
-- e o administrador. Remetente e horário são gravados pelo banco.
-- As conversas privadas admin ↔ integrante (messages) continuam iguais.
-- =====================================================================

create table public.team_messages (
  id         bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  sender_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  task_id    bigint references public.tasks(id) on delete set null,
  body       text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index on public.team_messages(project_id, created_at);

-- Até quando cada pessoa já leu o mural de cada projeto
create table public.team_reads (
  project_id   uuid not null references public.projects(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create or replace function public.prepare_team_message()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.sender_id := auth.uid();
  new.created_at := now();
  return new;
end;
$$;
create trigger team_messages_prepare before insert on public.team_messages
  for each row execute function public.prepare_team_message();

alter table public.team_messages enable row level security;
alter table public.team_reads    enable row level security;

create policy "mural visível à equipe e ao admin" on public.team_messages for select to authenticated
  using (public.is_member(project_id) or public.is_admin());
create policy "equipe e admin escrevem no mural" on public.team_messages for insert to authenticated
  with check (public.is_member(project_id) or public.is_admin());
create policy "cada um vê o que já leu" on public.team_reads for select to authenticated
  using (user_id = (select auth.uid()));

-- Auxiliar: uma pessoa específica é integrante do projeto?
create or replace function public.is_member_of(p uuid, u uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.project_members where project_id = p and user_id = u);
$$;

-- Mensagens do mural com nome de quem escreveu (inclui o admin, que não é integrante)
create or replace function public.team_thread(p_project uuid)
returns table (
  id bigint, project_id uuid, sender_id uuid, sender_name text, sender_is_admin boolean,
  task_id bigint, body text, created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_member(p_project) or public.is_admin()) then
    raise exception 'Você não participa deste projeto';
  end if;
  return query
  select m.id, m.project_id, m.sender_id,
         coalesce(nullif(pr.full_name, ''), split_part(pr.email, '@', 1)),
         exists (select 1 from public.app_admins a where a.email = lower(pr.email) and a.revoked_at is null)
           and not public.is_member_of(m.project_id, m.sender_id),
         m.task_id, m.body, m.created_at
  from public.team_messages m
  join public.profiles pr on pr.id = m.sender_id
  where m.project_id = p_project
  order by m.created_at;
end;
$$;

-- Marca o mural do projeto como lido por mim
create or replace function public.mark_team_read(p_project uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_member(p_project) or public.is_admin()) then
    raise exception 'Você não participa deste projeto';
  end if;
  insert into public.team_reads (project_id, user_id, last_read_at)
  values (p_project, auth.uid(), now())
  on conflict (project_id, user_id) do update set last_read_at = now();
end;
$$;

-- Murais com mensagens: dos meus projetos (ou de todos, para o admin)
create or replace function public.team_inbox()
returns table (
  project_id uuid, project_name text, unread integer,
  last_body text, last_at timestamptz, last_sender_name text, total integer
)
language sql stable security definer set search_path = '' as $$
  with me as (select auth.uid() as id, public.is_admin() as admin),
  walls as (
    select distinct m.project_id
    from public.team_messages m, me
    where public.is_member_of(m.project_id, me.id) or me.admin
  )
  select w.project_id, p.name,
    (select count(*)::int from public.team_messages x, me
      where x.project_id = w.project_id and x.sender_id <> me.id
        and x.created_at > coalesce((select r.last_read_at from public.team_reads r
                                      where r.project_id = w.project_id and r.user_id = me.id), '-infinity'::timestamptz)),
    last.body, last.created_at, coalesce(nullif(pr.full_name, ''), split_part(pr.email, '@', 1)),
    (select count(*)::int from public.team_messages x where x.project_id = w.project_id)
  from walls w
  join public.projects p on p.id = w.project_id
  cross join lateral (
    select body, created_at, sender_id from public.team_messages
    where project_id = w.project_id order by created_at desc limit 1
  ) last
  join public.profiles pr on pr.id = last.sender_id
  order by last.created_at desc;
$$;

revoke execute on function public.prepare_team_message() from public, anon, authenticated;
revoke execute on function public.is_member_of(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.team_thread(uuid), public.mark_team_read(uuid), public.team_inbox() from public, anon;
grant execute on function public.team_thread(uuid), public.mark_team_read(uuid), public.team_inbox() to authenticated;

alter publication supabase_realtime add table public.team_messages;


-- ===== 0010_recursos_jira.sql =====
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
