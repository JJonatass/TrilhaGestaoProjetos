'use client'

// Colunas do quadro: nome, etapa (que alimenta as métricas), limite de WIP e ordem.
// Só o criador do projeto altera.

import { useEffect, useState } from 'react'
import { CATEGORY_LABEL, hasCustomColumns, projectColumns, slugColumn, validateColumns } from '../lib/columns'
import { useProject } from '../state/ProjectProvider'
import { STATUSES, type ColumnDef, type StatusId } from '../types'
import { statusColor } from './ui'

export function ColumnsEditor() {
  const p = useProject()
  const snap = p.snap!
  const current = projectColumns(snap.meta)
  const [cols, setCols] = useState<ColumnDef[]>(current)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const key = JSON.stringify(current)
  useEffect(() => setCols(JSON.parse(key) as ColumnDef[]), [key])

  const dirty = JSON.stringify(cols) !== key
  const count = (id: string) => snap.tasks.filter((t) => (t.columnKey ? t.columnKey === id : current.find((c) => c.category === t.status)?.id === id)).length
  const edit = (i: number, patch: Partial<ColumnDef>) => setCols(cols.map((c, k) => (k === i ? { ...c, ...patch } : c)))
  const moveCol = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= cols.length) return
    const next = [...cols]
    ;[next[i], next[j]] = [next[j], next[i]]
    setCols(next)
  }

  const save = async () => {
    const clean = cols.map((c) => ({ ...c, label: c.label.trim() }))
    const err = validateColumns(clean)
    setError(err)
    if (err) return
    setSaving(true)
    await p.updateProject({ columns: clean })
    setSaving(false)
  }

  if (!p.isOwner) {
    return (
      <ol className="col-readonly">
        {current.map((c) => (
          <li key={c.id}>
            <span className="st" style={{ background: statusColor(c.category) }} />
            <strong>{c.label}</strong>
            <span className="hint">etapa {CATEGORY_LABEL[c.category]}{c.wip ? ` · WIP ${c.wip}` : ''}</span>
          </li>
        ))}
      </ol>
    )
  }

  return (
    <div className="cols-editor">
      <div className="cols-table" role="table" aria-label="Colunas do quadro">
        <div className="cols-row head" role="row">
          <span role="columnheader">Ordem</span>
          <span role="columnheader">Nome da coluna</span>
          <span role="columnheader">Etapa</span>
          <span role="columnheader">WIP</span>
          <span role="columnheader" />
        </div>
        {cols.map((c, i) => (
          <div key={c.id} className="cols-row" role="row">
            <span className="order">
              <button type="button" className="icon-btn" aria-label={`Subir ${c.label}`} disabled={i === 0} onClick={() => moveCol(i, -1)}>↑</button>
              <button type="button" className="icon-btn" aria-label={`Descer ${c.label}`} disabled={i === cols.length - 1} onClick={() => moveCol(i, 1)}>↓</button>
            </span>
            <input id={`col-label-${c.id}`} className="input" aria-label="Nome da coluna" value={c.label} maxLength={40} onChange={(e) => edit(i, { label: e.target.value })} />
            <span className="cat">
              <span className="st" style={{ background: statusColor(c.category) }} />
              <select id={`col-cat-${c.id}`} className="input" aria-label="Etapa" value={c.category} onChange={(e) => edit(i, { category: e.target.value as StatusId })}>
                {STATUSES.map((s) => <option key={s.id} value={s.id}>{CATEGORY_LABEL[s.id]}</option>)}
              </select>
            </span>
            <input
              id={`col-wip-${c.id}`}
              className="input num"
              type="number"
              min={1}
              max={99}
              aria-label="Limite de WIP"
              placeholder="WIP"
              value={c.wip ?? ''}
              onChange={(e) => edit(i, { wip: e.target.value ? Math.max(1, Math.min(99, Number(e.target.value) || 1)) : null })}
            />
            <span className="row-end">
              <span className="hint">{count(c.id)} {count(c.id) === 1 ? "cartão" : "cartões"}</span>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remover ${c.label}`}
                title="Remover coluna (os cartões vão para a primeira coluna da mesma etapa)"
                disabled={cols.length <= 2}
                onClick={() => setCols(cols.filter((_, k) => k !== i))}
              >
                ×
              </button>
            </span>
          </div>
        ))}
      </div>

      {error && <p className="form-error">{error}</p>}
      <div className="toolbar" style={{ margin: '10px 0 0' }}>
        <button
          type="button"
          className="btn small"
          disabled={cols.length >= 12}
          onClick={() => {
            const label = 'Nova coluna'
            const review = cols.findIndex((c) => c.category === 'done')
            const next = [...cols]
            next.splice(review < 0 ? cols.length : review, 0, { id: slugColumn(label, cols.map((c) => c.id)), label, category: 'doing', wip: null })
            setCols(next)
          }}
        >
          + Adicionar coluna
        </button>
        {hasCustomColumns(snap.meta) && (
          <button type="button" className="btn small" onClick={() => void p.updateProject({ columns: null })}>Voltar às colunas padrão</button>
        )}
        <span className="spacer" />
        {dirty && <button type="button" className="btn small" onClick={() => { setCols(current); setError(null) }}>Descartar</button>}
        <button type="button" className="btn small primary" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? 'Salvando…' : 'Salvar colunas'}
        </button>
      </div>
    </div>
  )
}
