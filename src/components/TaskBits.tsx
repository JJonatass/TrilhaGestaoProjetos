'use client'

// Pequenas peças visuais de uma tarefa: tipo, épico, rótulos e checklist.

import type { ChecklistItem, Epic, Kind, Label } from '../types'
import { KINDS } from '../types'

const KIND_CLASS: Record<Kind, string> = { historia: 'k-historia', tarefa: 'k-tarefa', bug: 'k-bug' }

export function KindIcon({ kind, withLabel = false }: { kind: Kind; withLabel?: boolean }) {
  const k = KINDS.find((x) => x.id === kind) ?? KINDS[1]
  return (
    <span className={`kind ${KIND_CLASS[kind]}`} title={k.label} aria-label={k.label}>
      <span className="kind-icon" aria-hidden>
        {kind === 'bug' ? (
          <svg viewBox="0 0 12 12" width="9" height="9"><circle cx="6" cy="6" r="3.2" fill="currentColor" /></svg>
        ) : kind === 'historia' ? (
          <svg viewBox="0 0 12 12" width="9" height="9"><path d="M3 1.5h6v9L6 8.3 3 10.5z" fill="currentColor" /></svg>
        ) : (
          <svg viewBox="0 0 12 12" width="9" height="9"><path d="M2.2 6.2 5 9 9.8 3.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        )}
      </span>
      {withLabel && <span className="kind-label">{k.label}</span>}
    </span>
  )
}

export function EpicTag({ epic }: { epic: Epic | undefined }) {
  if (!epic) return null
  return (
    <span className="epic-tag" title={`Épico: ${epic.name}`} style={{ ['--epic' as string]: epic.color }}>
      {epic.name}
    </span>
  )
}

export function LabelChips({ ids, labels, max = 3 }: { ids: number[]; labels: Label[]; max?: number }) {
  const list = ids.map((id) => labels.find((l) => l.id === id)).filter((l): l is Label => !!l)
  if (!list.length) return null
  return (
    <span className="label-chips">
      {list.slice(0, max).map((l) => (
        <span key={l.id} className="label-chip" style={{ ['--lbl' as string]: l.color }}>{l.name}</span>
      ))}
      {list.length > max && <span className="label-chip more">+{list.length - max}</span>}
    </span>
  )
}

export function ChecklistProgress({ items }: { items: ChecklistItem[] }) {
  if (!items.length) return null
  const done = items.filter((c) => c.done).length
  const all = done === items.length
  return (
    <span className={`check-progress ${all ? 'all' : ''}`} title={`Checklist: ${done} de ${items.length} itens feitos`}>
      <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden>
        <rect x="1" y="1" width="10" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M3.4 6.2 5.2 8l3.4-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {done}/{items.length}
    </span>
  )
}

/** Paleta de cores para épicos e rótulos (legível no claro e no escuro) */
export const SWATCHES = ['#5577b0', '#2f8f5b', '#d18b1c', '#8a5fc0', '#c0392b', '#1f8a9e', '#b05587', '#6b7b2a']
