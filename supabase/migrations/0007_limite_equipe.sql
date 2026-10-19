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
