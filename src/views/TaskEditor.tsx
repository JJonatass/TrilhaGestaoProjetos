'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { DepPicker } from '../components/DepPicker'
import { TaskChecklist } from '../components/TaskChecklist'
import { TaskDiscussion } from '../components/TaskDiscussion'
import { KindIcon } from '../components/TaskBits'
import { columnOf, hasCustomColumns, projectColumns } from '../lib/columns'
import { ConfirmButton, Drawer, Field, HintsToggle, initials, personName } from '../components/ui'
import { useProject } from '../state/ProjectProvider'
import { KINDS, PHASES, PRIORITIES, ROLE_LABEL, type Phase, type Priority, type StatusId, type TaskDraft } from '../types'

// Dicas exibidas no botão "?" de cada campo
const H = {
  title: 'O que precisa ser feito, começando com um verbo. Curto e específico: "Criar tela de login" em vez de "Login".',
  description: 'Detalhes da entrega e critérios de aceitação: o que precisa estar funcionando para a tarefa ir para Feito. Links e observações também cabem aqui.',
  assignees: 'Quem executa a tarefa. Pode ter mais de uma pessoa. Clique no nome para incluir ou tirar; o cartão mostra as iniciais de todos.',
  status: 'Etapa atual da tarefa. Mudar aqui é o mesmo que arrastar o cartão no quadro, e a mudança entra no histórico usado pelo burndown e pelos tempos.',
  phase: 'Etapa do ciclo de vida do produto (da Ideação ao Fim do ciclo). Agrupa o cronograma e o progresso por fase no painel.',
  priority: 'Urgência em relação às outras tarefas. Alta e Crítica ficam destacadas no cartão e, se atrasarem, deixam o projeto "em risco" no painel.',
  points: 'Estimativa de esforço, não de horas exatas. Compare com tarefas já feitas e use 1, 2, 3, 5 ou 8. Sem datas, o cronograma considera 1 ponto ≈ 1 dia.',
  sprint: 'Ciclo curto de trabalho, em geral de 2 semanas. As tarefas do sprint formam o burndown. Os sprints são cadastrados na aba Equipe.',
  start: 'Quando o trabalho começa. Pode ficar vazio: o cronograma estima o início pelo fim das tarefas de que esta depende.',
  due: 'Data limite. Depois dela, se a tarefa não estiver em Feito, aparece em vermelho e conta como atrasada.',
  milestoneDate: 'Um marco não tem duração: a data é a do campo Início.',
  milestone: 'Entrega importante que marca uma etapa, como "Protótipo aprovado" ou "Lançamento beta". Não tem duração nem pontos e aparece como losango no cronograma.',
  kind: 'História: algo que entrega valor para o usuário ("Como aluno, quero reservar monitoria"). Tarefa: trabalho técnico ou de apoio. Bug: algo que deveria funcionar e não funciona.',
  epic: 'Agrupa tarefas de uma mesma grande entrega (ex.: "Autenticação"). O progresso do épico e a faixa no cronograma vêm das tarefas dele. Crie épicos na aba Equipe.',
  labels: 'Etiquetas livres para filtrar o quadro (ex.: front, back, ux, urgente). Crie e mude as cores na aba Equipe.',
  checklist: 'Passos menores dentro da tarefa. O cartão mostra quantos já foram feitos (ex.: 2/4).',
  dependsOn: 'Tarefas que precisam terminar antes desta começar. Geram as setas do cronograma e o caminho crítico. Use a busca para achar pelo nome; a lista vem agrupada por fase, começando pela fase desta tarefa. Itens marcados "criaria ciclo" já dependem desta e não podem ser escolhidos.',
}

const blank = (status: StatusId, columnKey: string | null): TaskDraft => ({
  title: '', description: '', assignees: [], priority: 'media', points: 2, status,
  phase: 'Desenvolvimento', sprintId: null, start: null, due: null, milestone: false, dependsOn: [],
  kind: 'tarefa', epicId: null, labels: [], columnKey,
})

export function TaskEditor() {
  const { snap, editing, closeTask, saveTask, deleteTask, toggleAssignee, canAssign, readOnly, isOwner, me, isAdminView, projectId } = useProject()
  const taskId = editing?.id ?? null
  const existing = taskId !== null ? snap?.tasks.find((t) => t.id === taskId) : undefined
  const [d, setD] = useState<TaskDraft>(() => {
    if (existing) {
      const { id: _i, createdAt: _c, createdBy: _b, position: _p, checklist: _k, ...rest } = existing
      void _i; void _c; void _b; void _p; void _k
      return { ...rest }
    }
    const draft = blank(editing?.status ?? 'todo', editing?.columnKey ?? null)
    // quem cria a tarefa já entra como responsável, se puder
    if (me && canAssign(me) && snap?.members.some((m) => m.id === me)) draft.assignees = [me]
    return draft
  })
  const [saving, setSaving] = useState(false)
  const [newChecklist, setNewChecklist] = useState<string[]>([])
  const set = <K extends keyof TaskDraft>(k: K, v: TaskDraft[K]) => setD((p) => ({ ...p, [k]: v }))

  const blocked = useMemo(() => {
    const out = new Set<number>()
    if (taskId === null || !snap) return out
    const stack = [taskId]
    while (stack.length) {
      const cur = stack.pop()!
      for (const t of snap.tasks) {
        if (t.dependsOn.includes(cur) && !out.has(t.id)) {
          out.add(t.id)
          stack.push(t.id)
        }
      }
    }
    return out
  }, [snap, taskId])

  if (!snap || !editing) return null

  const history = snap.history.filter((h) => h.taskId === taskId)
  const cols = projectColumns(snap.meta)
  const dateError = !!(d.start && d.due && !d.milestone && d.due < d.start)
  const assignees = existing ? existing.assignees : d.assignees

  const toggle = async (userId: string, on: boolean) => {
    if (existing) {
      await toggleAssignee(existing.id, userId, on)
    } else {
      set('assignees', on ? [...d.assignees, userId] : d.assignees.filter((x) => x !== userId))
    }
  }

  const save = async () => {
    if (!d.title.trim() || dateError) return
    setSaving(true)
    const clean: TaskDraft = {
      ...d,
      title: d.title.trim(),
      assignees: existing ? existing.assignees : d.assignees,
      due: d.milestone ? d.start : d.due,
    }
    const ok = await saveTask(existing ? existing.id : null, clean, newChecklist)
    setSaving(false)
    if (ok) closeTask()
  }

  const assignHint = isOwner
    ? 'Como criador do projeto, você pode atribuir qualquer integrante.'
    : snap.meta.selfAssign
      ? 'Você pode se incluir ou sair. Para atribuir outras pessoas, peça ao criador do projeto.'
      : 'Neste projeto, só o criador define os responsáveis.'

  return (
    <Drawer
      title={readOnly ? 'Detalhes da tarefa' : existing ? 'Editar tarefa' : 'Nova tarefa'}
      onClose={closeTask}
      footer={
        readOnly ? (
          <button type="button" className="btn" onClick={closeTask}>Fechar</button>
        ) : (
          <>
            <button type="button" className="btn primary" onClick={() => void save()} disabled={saving || !d.title.trim() || dateError}>
              {saving ? 'Salvando…' : existing ? 'Salvar alterações' : 'Criar tarefa'}
            </button>
            <button type="button" className="btn" onClick={closeTask}>Cancelar</button>
            <span className="spacer" />
            {existing && (
              <ConfirmButton
                label="Excluir"
                confirmLabel="Confirmar exclusão"
                onConfirm={() => void deleteTask(existing.id).then(closeTask)}
              />
            )}
          </>
        )
      }
    >
      {!readOnly && <HintsToggle />}

      <fieldset className="plain" disabled={readOnly}>
        <Field id="task-kind" label="Tipo" hint={H.kind}>
          <div id="task-kind" className="seg kind-seg" role="group" aria-label="Tipo de item">
            {KINDS.map((k) => (
              <button key={k.id} type="button" aria-pressed={d.kind === k.id} onClick={() => set('kind', k.id)}>
                <KindIcon kind={k.id} /> {k.label}
              </button>
            ))}
          </div>
        </Field>
        <Field id="task-title" label="Título" hint={H.title}>
          <input id="task-title" className="input" placeholder="Ex.: Criar tela de login com e-mail e senha" value={d.title} autoFocus={!readOnly} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field id="task-desc" label="Descrição" hint={H.description}>
          <textarea id="task-desc" className="input" placeholder={'O que precisa ser entregue e como saber que está pronto.\nEx.: - Valida e-mail e senha\n- Mostra erro em português'} value={d.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
      </fieldset>

      <Field id="task-people" label="Responsáveis" hint={H.assignees}>
        <div id="task-people" className="people-picker" role="group" aria-label="Responsáveis">
          {snap.members.map((m) => {
            const on = assignees.includes(m.id)
            const allowed = !readOnly && canAssign(m.id)
            return (
              <button
                key={m.id}
                type="button"
                className={`person-chip ${on ? 'on' : ''}`}
                aria-pressed={on}
                disabled={!allowed}
                title={allowed ? (on ? 'Remover como responsável' : 'Adicionar como responsável') : 'Sem permissão para alterar'}
                onClick={() => void toggle(m.id, !on)}
              >
                <span className="avatar">{initials(personName(m))}</span>
                <span>{m.id === me ? 'Você' : personName(m)}</span>
                {m.role === 'viewer' && <small>{ROLE_LABEL.viewer}</small>}
                {on && <span aria-hidden="true">✓</span>}
              </button>
            )
          })}
        </div>
        {!readOnly && <p className="hint" style={{ margin: 0 }}>{assignHint}</p>}
        {isAdminView && existing && assignees.length > 0 && (
          <div className="toolbar" style={{ margin: '4px 0 0' }}>
            {assignees.map((u) => (
              <Link key={u} className="btn small" href={`/projeto/mensagens/?id=${projectId}&u=${u}&t=${existing.id}`}>
                Comentar com {personName(snap.members.find((m) => m.id === u))}
              </Link>
            ))}
          </div>
        )}
      </Field>

      <fieldset className="plain" disabled={readOnly}>
        <div className="row3">
          <Field id="task-status" label="Coluna" hint={H.status}>
            <select
              id="task-status"
              className="input"
              value={columnOf(d, cols).id}
              onChange={(e) => {
                const c = cols.find((x) => x.id === e.target.value)!
                setD((p) => ({ ...p, status: c.category, columnKey: hasCustomColumns(snap.meta) ? c.id : null }))
              }}
            >
              {cols.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>
          <Field id="task-phase" label="Fase" hint={H.phase}>
            <select id="task-phase" className="input" value={d.phase} onChange={(e) => set('phase', e.target.value as Phase)}>
              {PHASES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field id="task-prio" label="Prioridade" hint={H.priority}>
            <select id="task-prio" className="input" value={d.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
              {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Field>
          <Field id="task-points" label="Pontos" hint={H.points}>
            <input id="task-points" className="input num" type="number" min={0} step={1} value={d.points}
              onChange={(e) => set('points', Math.max(0, Number(e.target.value) || 0))} />
          </Field>
          <Field id="task-sprint" label="Sprint" hint={H.sprint}>
            <select id="task-sprint" className="input" value={d.sprintId ?? ''} onChange={(e) => set('sprintId', e.target.value ? Number(e.target.value) : null)}>
              <option value="">Sem sprint</option>
              {snap.sprints.filter((s) => !s.closedAt || s.id === d.sprintId).map((s) => <option key={s.id} value={s.id}>{s.name}{s.closedAt ? ' (encerrado)' : ''}</option>)}
            </select>
          </Field>
          <Field id="task-epic" label="Épico" hint={H.epic}>
            <select id="task-epic" className="input" value={d.epicId ?? ''} onChange={(e) => set('epicId', e.target.value ? Number(e.target.value) : null)}>
              <option value="">Sem épico</option>
              {snap.epics.map((ep) => <option key={ep.id} value={ep.id}>{ep.name}</option>)}
            </select>
          </Field>
          <Field id="task-start" label="Início" hint={H.start}>
            <input id="task-start" className="input" type="date" value={d.start ?? ''} onChange={(e) => set('start', e.target.value || null)} />
          </Field>
        </div>
        <div className="row2">
          <Field id="task-due" label={d.milestone ? 'Data do marco' : 'Prazo'} hint={d.milestone ? H.milestoneDate : H.due}>
            <input id="task-due" className="input" type="date" value={(d.milestone ? d.start : d.due) ?? ''} disabled={d.milestone}
              onChange={(e) => set('due', e.target.value || null)} />
          </Field>
          <Field id="task-milestone" label="Marco" hint={H.milestone}>
            <label className="check" style={{ minHeight: 34 }}>
              <input id="task-milestone" type="checkbox" checked={d.milestone} onChange={(e) => set('milestone', e.target.checked)} />
              É uma entrega-chave
            </label>
          </Field>
        </div>
        {dateError && <p className="hint" style={{ color: 'var(--late)', margin: 0 }}>O prazo precisa ser igual ou posterior ao início.</p>}

        <Field id="task-labels" label="Rótulos" hint={H.labels}>
          <div id="task-labels" className="chips" role="group" aria-label="Rótulos">
            {snap.labels.length === 0 && <span className="hint">Nenhum rótulo no projeto. Crie na aba Equipe.</span>}
            {snap.labels.map((l) => {
              const on = d.labels.includes(l.id)
              return (
                <button
                  key={l.id}
                  type="button"
                  className={`chip label-pick ${on ? 'on' : ''}`}
                  aria-pressed={on}
                  style={{ ['--lbl' as string]: l.color }}
                  onClick={() => set('labels', on ? d.labels.filter((x) => x !== l.id) : [...d.labels, l.id])}
                >
                  <i className="dot" style={{ background: l.color }} /> {l.name}
                </button>
              )
            })}
          </div>
        </Field>

        <Field id="task-deps" label="Depende de" hint={H.dependsOn}>
          <DepPicker
            id="task-deps"
            tasks={snap.tasks}
            currentId={taskId}
            currentPhase={d.phase}
            value={d.dependsOn}
            blocked={blocked}
            onChange={(v) => set('dependsOn', v)}
          />
        </Field>
      </fieldset>

      {!d.milestone && (
        <Field id="checklist-new" label="Checklist" hint={H.checklist}>
          <TaskChecklist taskId={existing?.id ?? null} items={existing?.checklist ?? []} draft={newChecklist} onDraft={setNewChecklist} />
        </Field>
      )}

      {existing && <TaskDiscussion task={existing} history={history} />}
    </Drawer>
  )
}
