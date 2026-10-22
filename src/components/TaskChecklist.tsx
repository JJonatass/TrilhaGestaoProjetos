'use client'

// Checklist (subtarefas) de uma tarefa. Na tarefa nova, os itens ficam em
// rascunho e são criados junto com ela.

import { useState } from 'react'
import { useProject } from '../state/ProjectProvider'
import type { ChecklistItem } from '../types'

export function TaskChecklist({
  taskId, items, draft, onDraft,
}: {
  taskId: number | null
  items: ChecklistItem[]
  /** só para tarefa nova */
  draft?: string[]
  onDraft?: (v: string[]) => void
}) {
  const { readOnly, addChecklistItem, updateChecklistItem, deleteChecklistItem, snap } = useProject()
  const [text, setText] = useState('')
  const isNew = taskId === null
  const list = isNew ? (draft ?? []).map((title, i) => ({ id: -1 - i, title, done: false })) : [...items].sort((a, b) => a.position - b.position || a.id - b.id)
  const done = list.filter((c) => c.done).length
  const pct = list.length ? Math.round((done / list.length) * 100) : 0

  const add = async () => {
    const t = text.trim()
    if (!t) return
    if (isNew) onDraft?.([...(draft ?? []), t])
    else await addChecklistItem(taskId, t)
    setText('')
  }

  const who = (id: string | null) => snap?.members.find((m) => m.id === id)?.fullName

  return (
    <div className="checklist">
      {list.length > 0 && (
        <div className="checklist-head">
          <div className="meter" aria-hidden><i style={{ width: `${pct}%`, background: 'var(--st-done)' }} /></div>
          <span className="hint mono">{done}/{list.length}</span>
        </div>
      )}
      <ul className="checklist-items">
        {list.map((c, i) => (
          <li key={c.id} className={c.done ? 'done' : ''}>
            <label className="check">
              <input
                type="checkbox"
                checked={c.done}
                disabled={readOnly || isNew}
                onChange={(e) => void updateChecklistItem(c.id, { done: e.target.checked })}
              />
              <span className="t">{c.title}</span>
            </label>
            {!isNew && 'doneBy' in c && c.done && who((c as ChecklistItem).doneBy) && (
              <span className="hint">{who((c as ChecklistItem).doneBy)}</span>
            )}
            {!readOnly && (
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remover "${c.title}"`}
                title="Remover item"
                onClick={() => (isNew ? onDraft?.((draft ?? []).filter((_, k) => k !== i)) : void deleteChecklistItem(c.id))}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && (
        <div className="checklist-add">
          <input
            id="checklist-new"
            className="input"
            placeholder="Adicionar item (Enter)"
            value={text}
            maxLength={300}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void add()
              }
            }}
          />
          <button type="button" className="btn small" onClick={() => void add()} disabled={!text.trim()}>Adicionar</button>
        </div>
      )}
      {readOnly && list.length === 0 && <p className="hint" style={{ margin: 0 }}>Sem checklist.</p>}
    </div>
  )
}
