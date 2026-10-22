'use client'

// Planejamento: sprints (objetivo, encerramento e relatório), épicos e rótulos.

import Link from 'next/link'
import { useState } from 'react'
import { EpicTag, KindIcon, SWATCHES } from '../../../components/TaskBits'
import { ConfirmButton, Field, useHint } from '../../../components/ui'
import { addDays, shortDate, today } from '../../../lib/dates'
import { currentSprint } from '../../../lib/filters'
import { useProject } from '../../../state/ProjectProvider'
import type { Epic, Label, Sprint, Task } from '../../../types'

const pts = (list: Task[]) => list.filter((t) => !t.milestone).reduce((s, t) => s + t.points, 0)

export default function PlanejamentoPage() {
  const p = useProject()
  if (!p.snap) return null
  return (
    <div className="page">
      <div className="grid plan-grid">
        <SprintsPanel />
        <EpicsPanel />
        <LabelsPanel />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sprints

function SprintsPanel() {
  const p = useProject()
  const snap = p.snap!
  const help = useHint('ajuda-sprints', 'sprints')
  const cur = currentSprint(snap.sprints)
  const last = snap.sprints[snap.sprints.length - 1]
  const ordered = [...snap.sprints].sort((a, b) => Number(!!a.closedAt) - Number(!!b.closedAt) || a.start.localeCompare(b.start))

  return (
    <section className="panel span-2">
      <div className="panel-head">
        <div className="title-row"><h2>Sprints</h2>{help.button}</div>
        <span className="spacer" />
        {p.canEdit && (
          <button
            type="button"
            className="btn small"
            onClick={() => {
              const start = last ? addDays(last.end, 1) : today()
              void p.addSprint({ name: `Sprint ${snap.sprints.length + 1}`, start, end: addDays(start, 13), goal: '' })
            }}
          >
            + Novo sprint de 2 semanas
          </button>
        )}
      </div>
      {help.box(
        <>
          <p><b>Objetivo do sprint:</b> uma frase sobre o que a equipe quer entregar no ciclo (ex.: "Reserva de monitoria funcionando"). Ajuda a decidir o que entra e o que fica para depois.</p>
          <p><b>Encerrar sprint:</b> no fim do ciclo, o Trilha guarda quantos pontos foram planejados e quantos foram entregues, e leva o que sobrou para o próximo sprint (ou para fora de sprint). Esses números formam o gráfico de <b>velocidade</b> na aba Métricas.</p>
        </>,
      )}
      {snap.sprints.length === 0 && <p className="hint">Nenhum sprint cadastrado.</p>}
      <div className="sprint-cards">
        {ordered.map((s) => (
          <SprintCard key={s.id} sprint={s} isCurrent={cur?.id === s.id} />
        ))}
      </div>
    </section>
  )
}

function SprintCard({ sprint: s, isCurrent }: { sprint: Sprint; isCurrent: boolean }) {
  const p = useProject()
  const snap = p.snap!
  const [closing, setClosing] = useState(false)
  const openOthers = snap.sprints.filter((x) => !x.closedAt && x.id !== s.id).sort((a, b) => a.start.localeCompare(b.start))
  const nextDefault = openOthers.find((x) => x.start > s.start)?.id ?? openOthers[0]?.id ?? null
  const [nextId, setNextId] = useState<number | null>(nextDefault)
  const tasks = snap.tasks.filter((t) => t.sprintId === s.id)
  const done = tasks.filter((t) => t.status === 'done')
  const total = pts(tasks)
  const donePts = pts(done)
  const pct = total ? Math.round((donePts / total) * 100) : 0
  const left = tasks.filter((t) => t.status !== 'done')
  const td = today()
  const state = s.closedAt ? 'Encerrado' : isCurrent ? 'Em andamento' : s.end < td ? 'Prazo terminou' : 'Planejado'
  const rep = s.report
  const nextName = (id: number | null) => (id === null ? 'fora de sprint' : snap.sprints.find((x) => x.id === id)?.name ?? 'outro sprint')

  return (
    <article className={`sprint-card ${s.closedAt ? 'closed' : ''} ${isCurrent ? 'current' : ''}`}>
      <header>
        {p.canEdit && !s.closedAt ? (
          <input
            id={`sp-name-${s.id}`}
            className="input sprint-title"
            aria-label="Nome do sprint"
            defaultValue={s.name}
            onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && void p.updateSprint({ ...s, name: e.target.value.trim() })}
          />
        ) : (
          <h3>{s.name}</h3>
        )}
        <span className={`pill ${s.closedAt ? '' : isCurrent ? 'ok' : s.end < td ? 'warn' : ''}`}>{state}</span>
      </header>

      {p.canEdit && !s.closedAt ? (
        <div className="sprint-dates">
          <label className="field"><span>Início</span>
            <input id={`sp-start-${s.id}`} className="input" type="date" defaultValue={s.start}
              onBlur={(e) => e.target.value && e.target.value !== s.start && void p.updateSprint({ ...s, start: e.target.value })} />
          </label>
          <label className="field"><span>Fim</span>
            <input id={`sp-end-${s.id}`} className="input" type="date" defaultValue={s.end}
              onBlur={(e) => e.target.value && e.target.value !== s.end && void p.updateSprint({ ...s, end: e.target.value })} />
          </label>
        </div>
      ) : (
        <p className="hint mono" style={{ margin: 0 }}>{shortDate(s.start)} → {shortDate(s.end)}</p>
      )}

      {p.canEdit && !s.closedAt ? (
        <label className="field">
          <span>Objetivo</span>
          <input id={`sp-goal-${s.id}`} className="input" maxLength={300} placeholder="O que a equipe quer entregar neste sprint" defaultValue={s.goal}
            onBlur={(e) => e.target.value !== s.goal && void p.updateSprint({ ...s, goal: e.target.value.trim() })} />
        </label>
      ) : (
        s.goal && <p className="sprint-goal">🎯 {s.goal}</p>
      )}

      {rep ? (
        <div className="sprint-report">
          <div className="meter"><i style={{ width: `${rep.committedPoints ? Math.round((rep.completedPoints / rep.committedPoints) * 100) : 0}%`, background: 'var(--st-done)' }} /></div>
          <p>
            Entregou <b>{rep.completedPoints} de {rep.committedPoints} pontos</b>
            {rep.committedPoints ? ` (${Math.round((rep.completedPoints / rep.committedPoints) * 100)}%)` : ''} · {rep.completedTasks} de {rep.committedTasks} tarefas.
            {rep.carried.length > 0 && <> {rep.carried.length} tarefa{rep.carried.length > 1 ? 's foram' : ' foi'} para {nextName(rep.nextSprint)}.</>}
            {rep.bugsOpen > 0 && <> {rep.bugsOpen} bug{rep.bugsOpen > 1 ? 's' : ''} ficou em aberto.</>}
          </p>
          <p className="hint" style={{ margin: 0 }}>Encerrado em {new Date(s.closedAt!).toLocaleDateString('pt-BR')}.</p>
        </div>
      ) : (
        <div className="sprint-progress">
          <div className="meter"><i style={{ width: `${pct}%`, background: 'var(--st-done)' }} /></div>
          <span className="hint mono">{donePts}/{total} pts · {done.length}/{tasks.length} tarefas</span>
        </div>
      )}

      {!s.closedAt && left.length > 0 && (
        <details className="sprint-left">
          <summary>{left.length} tarefa{left.length > 1 ? 's' : ''} em aberto</summary>
          <ul>
            {left.map((t) => (
              <li key={t.id}>
                <button type="button" className="link" onClick={() => p.openTask(t.id)}>
                  <KindIcon kind={t.kind} /> {t.title}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {p.canEdit && (
        <footer>
          {s.closedAt ? (
            <button type="button" className="btn small" onClick={() => void p.reopenSprint(s.id)}>Reabrir</button>
          ) : closing ? (
            <div className="close-box">
              <label className="field">
                <span>{left.length ? `Levar as ${left.length} tarefas em aberto para` : 'Nenhuma tarefa em aberto'}</span>
                {left.length > 0 && (
                  <select id={`sp-next-${s.id}`} className="input" value={nextId ?? ''} onChange={(e) => setNextId(e.target.value ? Number(e.target.value) : null)}>
                    {openOthers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    <option value="">Fora de sprint (backlog)</option>
                  </select>
                )}
              </label>
              <div className="row">
                <button type="button" className="btn small primary" onClick={() => void p.closeSprint(s.id, left.length ? nextId : null).then(() => setClosing(false))}>
                  Encerrar {s.name}
                </button>
                <button type="button" className="btn small" onClick={() => setClosing(false)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <>
              <button type="button" className="btn small" onClick={() => { setNextId(nextDefault); setClosing(true) }}>Encerrar sprint…</button>
              <span className="spacer" />
              <ConfirmButton className="small" label="Remover" confirmLabel="Confirmar" onConfirm={() => void p.deleteSprint(s.id)} />
            </>
          )}
        </footer>
      )}
    </article>
  )
}

// ---------------------------------------------------------------------------
// Épicos

function EpicsPanel() {
  const p = useProject()
  const snap = p.snap!
  const help = useHint('ajuda-epicos', 'épicos')
  const [name, setName] = useState('')
  const [color, setColor] = useState(SWATCHES[snap.epics.length % SWATCHES.length])
  const [editing, setEditing] = useState<Epic | null>(null)

  return (
    <section className="panel">
      <div className="panel-head">
        <div className="title-row"><h2>Épicos</h2>{help.button}</div>
      </div>
      {help.box(
        <p>Um épico agrupa tarefas de uma mesma grande entrega (ex.: "Autenticação", "Agenda"). O progresso vem dos pontos das tarefas dele, e no Cronograma cada épico vira uma faixa com o período das suas tarefas. Para pôr uma tarefa num épico, abra a tarefa e escolha o campo Épico.</p>,
      )}
      {snap.epics.length === 0 && <p className="hint">Nenhum épico ainda.</p>}
      <ul className="epic-list">
        {snap.epics.map((e) => {
          const ts = snap.tasks.filter((t) => t.epicId === e.id)
          const total = pts(ts)
          const done = pts(ts.filter((t) => t.status === 'done'))
          const pct = total ? Math.round((done / total) * 100) : 0
          const starts = ts.map((t) => t.start).filter(Boolean).sort() as string[]
          const dues = ts.map((t) => t.due ?? t.start).filter(Boolean).sort() as string[]
          if (editing?.id === e.id) {
            return (
              <li key={e.id} className="epic-item editing">
                <EpicForm
                  value={editing}
                  onChange={setEditing}
                  onSubmit={() => void p.updateEpic(editing).then(() => setEditing(null))}
                  onCancel={() => setEditing(null)}
                  submitLabel="Salvar"
                />
              </li>
            )
          }
          return (
            <li key={e.id} className="epic-item">
              <div className="epic-top">
                <EpicTag epic={e} />
                <span className="hint mono">{done}/{total} pts · {ts.length} tarefa{ts.length === 1 ? '' : 's'}</span>
                {p.canEdit && (
                  <span className="row-end">
                    <button type="button" className="btn small" onClick={() => setEditing(e)}>Editar</button>
                    <ConfirmButton className="small" label="Excluir" confirmLabel="Confirmar" onConfirm={() => void p.deleteEpic(e.id)} />
                  </span>
                )}
              </div>
              {e.description && <p className="hint" style={{ margin: '4px 0' }}>{e.description}</p>}
              <div className="meter"><i style={{ width: `${pct}%`, background: e.color }} /></div>
              <div className="epic-foot hint">
                {pct}% concluído{starts.length ? ` · ${shortDate(starts[0])} → ${shortDate(dues[dues.length - 1])}` : ''}
                {ts.length > 0 && (
                  <Link className="link" href={`/projeto/?id=${p.projectId}`} onClick={() => p.setFilter({ epics: [e.id] })}>ver no quadro</Link>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {p.canEdit && (
        <form
          className="inline-add"
          onSubmit={(ev) => {
            ev.preventDefault()
            if (!name.trim()) return
            void p.addEpic({ name: name.trim(), color, description: '', position: snap.epics.length }).then(() => {
              setName('')
              setColor(SWATCHES[(snap.epics.length + 1) % SWATCHES.length])
            })
          }}
        >
          <Swatches value={color} onChange={setColor} />
          <input id="epic-new" className="input" placeholder="Nome do novo épico" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn small primary" disabled={!name.trim()}>Criar épico</button>
        </form>
      )}
    </section>
  )
}

function EpicForm({ value, onChange, onSubmit, onCancel, submitLabel }: {
  value: Epic; onChange: (e: Epic) => void; onSubmit: () => void; onCancel: () => void; submitLabel: string
}) {
  return (
    <form className="epic-form" onSubmit={(e) => { e.preventDefault(); if (value.name.trim()) onSubmit() }}>
      <Field id={`epic-name-${value.id}`} label="Nome">
        <input id={`epic-name-${value.id}`} className="input" maxLength={120} value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
      </Field>
      <Field id={`epic-desc-${value.id}`} label="Descrição">
        <input id={`epic-desc-${value.id}`} className="input" value={value.description} onChange={(e) => onChange({ ...value, description: e.target.value })} />
      </Field>
      <Swatches value={value.color} onChange={(c) => onChange({ ...value, color: c })} />
      <div className="row">
        <button type="submit" className="btn small primary">{submitLabel}</button>
        <button type="button" className="btn small" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Rótulos

function LabelsPanel() {
  const p = useProject()
  const snap = p.snap!
  const [name, setName] = useState('')
  const [color, setColor] = useState(SWATCHES[(snap.labels.length + 3) % SWATCHES.length])
  const [editing, setEditing] = useState<Label | null>(null)

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Rótulos</h2>
          <p>Etiquetas livres para organizar e filtrar o quadro (ex.: front, back, ux, urgente).</p>
        </div>
      </div>
      {snap.labels.length === 0 && <p className="hint">Nenhum rótulo ainda.</p>}
      <ul className="label-list">
        {snap.labels.map((l) => {
          const n = snap.tasks.filter((t) => t.labels.includes(l.id)).length
          if (editing?.id === l.id) {
            return (
              <li key={l.id} className="editing">
                <form className="inline-add" onSubmit={(e) => { e.preventDefault(); if (editing.name.trim()) void p.updateLabel(editing).then(() => setEditing(null)) }}>
                  <Swatches value={editing.color} onChange={(c) => setEditing({ ...editing, color: c })} />
                  <input id={`label-name-${l.id}`} className="input" maxLength={40} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                  <button type="submit" className="btn small primary">Salvar</button>
                  <button type="button" className="btn small" onClick={() => setEditing(null)}>Cancelar</button>
                </form>
              </li>
            )
          }
          return (
            <li key={l.id}>
              <span className="label-chip big" style={{ ['--lbl' as string]: l.color }}>{l.name}</span>
              <span className="hint">{n} tarefa{n === 1 ? '' : 's'}</span>
              {p.canEdit && (
                <span className="row-end">
                  <button type="button" className="btn small" onClick={() => setEditing(l)}>Editar</button>
                  <ConfirmButton className="small" label="Excluir" confirmLabel={n ? `Tirar de ${n}` : 'Confirmar'} onConfirm={() => void p.deleteLabel(l.id)} />
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {p.canEdit && (
        <form
          className="inline-add"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            void p.addLabel({ name: name.trim(), color }).then((ok) => {
              if (ok) {
                setName('')
                setColor(SWATCHES[(snap.labels.length + 4) % SWATCHES.length])
              }
            })
          }}
        >
          <Swatches value={color} onChange={setColor} />
          <input id="label-new" className="input" placeholder="Novo rótulo" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn small primary" disabled={!name.trim()}>Criar rótulo</button>
        </form>
      )}
    </section>
  )
}

function Swatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <span className="swatches" role="radiogroup" aria-label="Cor">
      {SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={`Cor ${c}`}
          className={`swatch ${value === c ? 'on' : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
        />
      ))}
    </span>
  )
}
