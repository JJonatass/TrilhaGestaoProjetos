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
