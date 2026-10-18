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
