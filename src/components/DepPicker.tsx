'use client'

// Seletor do campo "Depende de": escolhidas aparecem como etiquetas no topo,
// com busca e lista agrupada por fase. Tarefas que já dependem da atual
// ficam bloqueadas, porque escolhê-las criaria um ciclo.

import { useMemo, useState } from 'react'
import { shortDate } from '../lib/dates'
import { PHASES, STATUSES, type Task } from '../types'

const statusLabel = (s: Task['status']) => STATUSES.find((x) => x.id === s)?.label ?? ''

// Comparação sem acentos e sem diferença de maiúsculas
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function DepPicker({
  id, tasks, currentId, currentPhase, value, blocked, onChange,
}: {
  id: string
  tasks: Task[]
  currentId: number | null
  currentPhase: string
  value: number[]
  blocked: Set<number>
  onChange: (v: number[]) => void
}) {
  const [q, setQ] = useState('')
  const [hideDone, setHideDone] = useState(false)
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  const selected = value.map((v) => byId.get(v)).filter((t): t is Task => !!t)

  const groups = useMemo(() => {
    const term = norm(q.trim())
    const list = tasks.filter(
      (t) => t.id !== currentId && (!term || norm(t.title).includes(term) || `#${t.id}` === term) && (!hideDone || t.status !== 'done' || value.includes(t.id)),
    )
    // fase da tarefa atual primeiro, depois a ordem do ciclo de vida
    const order = [currentPhase, ...PHASES.filter((p) => p !== currentPhase)]
    return order
      .map((phase) => ({ phase, items: list.filter((t) => t.phase === phase).sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9') || a.id - b.id) }))
      .filter((g) => g.items.length)
  }, [tasks, currentId, currentPhase, q, hideDone, value])

  const toggle = (tid: number, on: boolean) => onChange(on ? [...value, tid] : value.filter((x) => x !== tid))
  const total = groups.reduce((s, g) => s + g.items.length, 0)

  return (
    <div className="dep-picker">
      <div className="dep-chips" aria-live="polite">
        {selected.length === 0 ? (
          <span className="hint">Nenhuma: esta tarefa pode começar a qualquer momento.</span>
        ) : (
          selected.map((t) => (
            <span key={t.id} className={`dep-chip st-${t.status}`}>
              <i className="dot" aria-hidden />
              <span className="t">{t.title}</span>
              <button type="button" aria-label={`Tirar "${t.title}" das dependências`} onClick={() => toggle(t.id, false)}>×</button>
            </span>
          ))
        )}
      </div>

      <div className="dep-tools">
        <input
          id={id}
          className="input"
          type="search"
          placeholder="Buscar tarefa pelo nome…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar tarefa para depender"
        />
        <label className="check dep-hide">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
          Ocultar feitas
        </label>
      </div>

      <div className="dep-list" role="group" aria-label="Tarefas disponíveis">
        {total === 0 && <p className="hint" style={{ margin: 4 }}>{q ? 'Nenhuma tarefa com esse nome.' : 'Não há outras tarefas no projeto.'}</p>}
        {groups.map((g) => (
          <div key={g.phase} className="dep-group">
            <div className="dep-group-head">
              {g.phase}
              {g.phase === currentPhase && <span className="hint"> · mesma fase</span>}
            </div>
            {g.items.map((t) => {
              const isBlocked = blocked.has(t.id)
              return (
                <label
                  key={t.id}
                  className={`dep-item ${isBlocked ? 'blocked' : ''}`}
                  title={isBlocked ? 'Esta tarefa já depende da atual; escolher criaria um ciclo' : undefined}
                >
                  <input type="checkbox" disabled={isBlocked} checked={value.includes(t.id)} onChange={(e) => toggle(t.id, e.target.checked)} />
                  <span className="t">{t.milestone ? '[Marco] ' : ''}{t.title}</span>
                  <span className={`dep-meta st-${t.status}`}>
                    {isBlocked ? 'criaria ciclo' : `${statusLabel(t.status)}${t.due ? ` · ${shortDate(t.due)}` : ''}`}
                  </span>
                </label>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
