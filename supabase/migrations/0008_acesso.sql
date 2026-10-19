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
