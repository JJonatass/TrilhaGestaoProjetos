'use client'

import { useState } from 'react'
import { AvatarStack, statusColor } from '../components/ui'
import { shortDate } from '../lib/dates'
import { isLate } from '../lib/metrics'
import { useProject } from '../state/ProjectProvider'
import { STATUSES, type Snapshot, type StatusId, type Task } from '../types'

export function Kanban() {
  const { snap, moveTask, openTask, newTask, readOnly, me } = useProject()
  const [query, setQuery] = useState('')
  const [person, setPerson] = useState('')
  const [sprint, setSprint] = useState('')
  const [dragId, setDragId] = useState<number | null>(null)
  const [overCol, setOverCol] = useState<StatusId | null>(null)
  const [overCard, setOverCard] = useState<number | null>(null)

  if (!snap) return null

  const visible = snap.tasks.filter((t) => {
    if (query && !`${t.title} ${t.description} ${t.phase}`.toLowerCase().includes(query.toLowerCase())) return false
    if (person === 'none' && t.assignees.length) return false
    if (person && person !== 'none' && !t.assignees.includes(person)) return false
    if (sprint === 'none' && t.sprintId !== null) return false
    if (sprint && sprint !== 'none' && t.sprintId !== Number(sprint)) return false
    return true
  })

  const move = (id: number, status: StatusId, beforeId: number | null) => {
    const colTasks = snap.tasks.filter((t) => t.status === status && t.id !== id)
    let position: number
    const idx = beforeId === null ? -1 : colTasks.findIndex((t) => t.id === beforeId)
    if (idx >= 0) {
      const before = colTasks[idx]
      const prev = colTasks[idx - 1]
      position = prev ? (prev.position + before.position) / 2 : before.position - 1
    } else {
      position = (colTasks[colTasks.length - 1]?.position ?? 0) + 1
    }
    const cur = snap.tasks.find((t) => t.id === id)
    if (cur && cur.status === status && cur.position === position) return
    moveTask(id, status, position)
  }

  const step = (t: Task, dir: 1 | -1) => {
    const i = STATUSES.findIndex((s) => s.id === t.status) + dir
    if (i >= 0 && i < STATUSES.length) move(t.id, STATUSES[i].id, null)
  }

  const endDrag = () => {
    setDragId(null)
    setOverCol(null)
    setOverCard(null)
  }

  return (
    <div className="page">
      <div className="toolbar">
        <input id="kanban-search" className="input search" placeholder="Buscar tarefa ou fase" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select id="kanban-person" className="input" value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="">Todos os responsáveis</option>
          {me && snap.members.some((m) => m.id === me) && <option value={me}>Minhas tarefas</option>}
          {snap.members.filter((m) => m.id !== me).map((m) => (
            <option key={m.id} value={m.id}>{m.fullName || m.email}</option>
          ))}
          <option value="none">Sem responsável</option>
        </select>
        <select id="kanban-sprint" className="input" value={sprint} onChange={(e) => setSprint(e.target.value)}>
          <option value="">Todos os sprints</option>
          {snap.sprints.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
          <option value="none">Sem sprint</option>
        </select>
        <span className="spacer" />
        <span className="hint">
          {readOnly ? 'Somente leitura: abra um cartão para ver os detalhes.' : 'Arraste os cartões entre colunas. Cada movimento entra no histórico.'}
        </span>
      </div>

      <div className="board">
        {STATUSES.map((col) => {
          const cards = visible.filter((t) => t.status === col.id)
          const total = snap.tasks.filter((t) => t.status === col.id).length
          const limit = snap.meta.wip[col.id]
          const pts = cards.reduce((s, t) => s + t.points, 0)
          return (
            <section
              key={col.id}
              className={`column ${overCol === col.id ? 'drop' : ''}`}
              onDragOver={(e) => {
                if (dragId === null) return
                e.preventDefault()
                setOverCol(col.id)
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragId !== null) move(dragId, col.id, overCard)
                endDrag()
              }}
            >
              <header className="column-head">
                <span className="st" style={{ background: statusColor(col.id) }} />
                <h3>{col.label}</h3>
                {limit ? (
                  <span className={`wip ${total > limit ? 'over' : ''}`} title="Limite de trabalho em andamento (WIP)">
                    {total}/{limit}
                  </span>
                ) : null}
                <span className="meta">{cards.length} · {pts} pts</span>
              </header>
              <div className="cards">
                {cards.map((t) => (
                  <Card
                    key={t.id}
                    task={t}
                    snap={snap}
                    mine={!!me && t.assignees.includes(me)}
                    draggable={!readOnly}
                    dragging={dragId === t.id}
                    dropBefore={overCard === t.id && dragId !== t.id}
                    onOpen={() => openTask(t.id)}
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={endDrag}
                    onDragOver={() => setOverCard(t.id)}
                    onStep={(d) => step(t, d)}
                  />
                ))}
              </div>
              {!readOnly && (
                <button type="button" className="add-card" onClick={() => newTask(col.id)}>
                  + Nova tarefa
                </button>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function Card({
  task: t, snap, mine, draggable, dragging, dropBefore, onOpen, onDragStart, onDragEnd, onDragOver, onStep,
}: {
  task: Task
  snap: Snapshot
  mine: boolean
  draggable: boolean
  dragging: boolean
  dropBefore: boolean
  onOpen: () => void
  onDragStart: () => void
  onDragEnd: () => void
  onDragOver: () => void
  onStep: (d: 1 | -1) => void
}) {
  const late = isLate(t)
  const sprint = snap.sprints.find((s) => s.id === t.sprintId)
  const blockedBy = t.dependsOn.filter((d) => snap.tasks.find((x) => x.id === d)?.status !== 'done').length
  return (
    <article
      className={`card ${dragging ? 'dragging' : ''} ${dropBefore ? 'drop-before' : ''} ${mine ? 'mine' : ''} ${draggable ? '' : 'static'}`}
      draggable={draggable}
      tabIndex={0}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', String(t.id))
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        if (!draggable) return
        e.preventDefault()
        onDragOver()
      }}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen()
        if (draggable && e.key === 'ArrowRight' && e.altKey) onStep(1)
        if (draggable && e.key === 'ArrowLeft' && e.altKey) onStep(-1)
      }}
    >
      <div className="phase">
        {t.milestone && <span className="diamond" title="Marco" />}
        {t.phase}
        {sprint && <span style={{ marginLeft: 'auto', fontWeight: 500 }}>{sprint.name}</span>}
      </div>
      <div className="title">{t.title}</div>
      <div className="card-foot">
        {!t.milestone && <AvatarStack ids={t.assignees} people={snap.members} />}
        {!t.milestone && <span className="pts">{t.points}</span>}
        {(t.priority === 'alta' || t.priority === 'critica') && (
          <span className={`prio ${t.priority}`}>{t.priority === 'critica' ? 'Crítica' : 'Alta'}</span>
        )}
        {blockedBy > 0 && t.status !== 'done' && <span title="Dependências não concluídas">⛓ {blockedBy}</span>}
        <span style={{ marginLeft: 'auto' }} className={`due mono ${late ? 'late' : ''}`} title={late ? 'Prazo vencido' : 'Prazo'}>
          {t.due ? shortDate(t.due) : ''}
        </span>
      </div>
      {draggable && (
        <div className="move-row" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="btn small" onClick={() => onStep(-1)} aria-label="Mover para a coluna anterior">←</button>
          <button type="button" className="btn small" onClick={() => onStep(1)} aria-label="Mover para a próxima coluna">→</button>
        </div>
      )}
    </article>
  )
}
