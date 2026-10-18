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
