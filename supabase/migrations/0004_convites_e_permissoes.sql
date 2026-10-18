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
