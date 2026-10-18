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
