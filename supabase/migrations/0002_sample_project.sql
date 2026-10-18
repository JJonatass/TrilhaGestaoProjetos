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
