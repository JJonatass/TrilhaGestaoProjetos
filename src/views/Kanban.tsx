'use client'

import { useState } from 'react'
import { FilterBar } from '../components/FilterBar'
import { ChecklistProgress, EpicTag, KindIcon, LabelChips } from '../components/TaskBits'
import { AvatarStack, statusColor } from '../components/ui'
import { CATEGORY_LABEL, columnOf, hasCustomColumns, moveTarget, projectColumns } from '../lib/columns'
import { shortDate } from '../lib/dates'
import { isLate } from '../lib/metrics'
import { useProject } from '../state/ProjectProvider'
import type { ColumnDef, Snapshot, Task } from '../types'

export function Kanban() {
  const { snap, moveTask, openTask, newTask, readOnly, me, visibleTasks } = useProject()
  const [dragId, setDragId] = useState<number | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const [overCard, setOverCard] = useState<number | null>(null)

  if (!snap) return null
  const cols = projectColumns(snap.meta)
  const colOf = (t: Task) => columnOf(t, cols).id

  const move = (id: number, col: ColumnDef, beforeId: number | null) => {
    const colTasks = snap.tasks.filter((t) => colOf(t) === col.id && t.id !== id)
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
    if (cur && colOf(cur) === col.id && cur.position === position) return
    const target = moveTarget(col, snap.meta)
    moveTask(id, target.status, position, target.columnKey)
  }

  const step = (t: Task, dir: 1 | -1) => {
    const i = cols.findIndex((c) => c.id === colOf(t)) + dir
    if (i >= 0 && i < cols.length) move(t.id, cols[i], null)
  }

  const endDrag = () => {
    setDragId(null)
    setOverCol(null)
    setOverCard(null)
  }

  return (
    <div className="page">
      <FilterBar hint={readOnly ? 'Somente leitura: abra um cartão para ver os detalhes.' : 'Arraste os cartões entre colunas. Cada movimento entra no histórico.'} />

      <div className="board" style={{ ['--cols' as string]: cols.length }}>
        {cols.map((col) => {
          const cards = visibleTasks.filter((t) => colOf(t) === col.id)
          const total = snap.tasks.filter((t) => colOf(t) === col.id).length
          const limit = col.wip
          const pts = cards.reduce((s, t) => s + (t.milestone ? 0 : t.points), 0)
          return (
            <section
              key={col.id}
              className={`column ${overCol === col.id ? 'drop' : ''}`}
              aria-label={`Coluna ${col.label}`}
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
                if (dragId !== null) move(dragId, col, overCard)
                endDrag()
              }}
            >
              <header className="column-head">
                <span className="st" style={{ background: statusColor(col.category) }} title={`Etapa: ${CATEGORY_LABEL[col.category]}`} />
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
                <button type="button" className="add-card" onClick={() => newTask(col.category, hasCustomColumns(snap.meta) ? col.id : null)}>
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
  const epic = snap.epics.find((e) => e.id === t.epicId)
  const blockedBy = t.dependsOn.filter((d) => snap.tasks.find((x) => x.id === d)?.status !== 'done').length
  return (
    <article
      className={`card kind-${t.kind} ${dragging ? 'dragging' : ''} ${dropBefore ? 'drop-before' : ''} ${mine ? 'mine' : ''} ${draggable ? '' : 'static'}`}
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
        {t.milestone ? <span className="diamond" title="Marco" /> : <KindIcon kind={t.kind} />}
        <span className="mono task-key">#{t.id}</span>
        <span className="phase-name">{t.phase}</span>
        {sprint && <span className="sprint-name">{sprint.name}</span>}
      </div>
      <div className="title">{t.title}</div>
      {(epic || t.labels.length > 0) && (
        <div className="card-tags">
          <EpicTag epic={epic} />
          <LabelChips ids={t.labels} labels={snap.labels} />
        </div>
      )}
      <div className="card-foot">
        {!t.milestone && <AvatarStack ids={t.assignees} people={snap.members} />}
        {!t.milestone && <span className="pts">{t.points}</span>}
        {(t.priority === 'alta' || t.priority === 'critica') && (
          <span className={`prio ${t.priority}`}>{t.priority === 'critica' ? 'Crítica' : 'Alta'}</span>
        )}
        {blockedBy > 0 && t.status !== 'done' && <span title="Dependências não concluídas">⛓ {blockedBy}</span>}
        <ChecklistProgress items={t.checklist} />
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
