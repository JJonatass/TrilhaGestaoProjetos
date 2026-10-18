'use client'

import { useEffect, useRef, useState } from 'react'
import type { StatusId } from '../types'

export const statusColor = (s: StatusId) => `var(--st-${s})`

export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}

export function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar" title={name || 'Sem responsável'}>
      {name ? initials(name) : '–'}
    </span>
  )
}

/** Botão que pede um segundo clique antes de executar ações destrutivas. */
export function ConfirmButton({
  label, confirmLabel, onConfirm, className = '',
}: { label: string; confirmLabel: string; onConfirm: () => void; className?: string }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3500)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      type="button"
      className={`btn danger ${armed ? 'armed' : ''} ${className}`}
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}
    >
      {armed ? confirmLabel : label}
    </button>
  )
}

/** Largura disponível de um contêiner, para desenhar gráficos SVG responsivos. */
export function useWidth<T extends HTMLElement>(min = 320): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [w, setW] = useState(640)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(min, Math.floor(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [min])
  return [ref, w]
}

export function Drawer({ title, onClose, children, footer }: {
  title: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawer-head">
          <h2>{title}</h2>
          <button type="button" className="btn ghost" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </div>
  )
}

export interface PersonLike {
  id: string
  fullName: string
  email: string
}

export const personName = (p?: PersonLike | null) => (p ? p.fullName || p.email.split('@')[0] : 'Ex-integrante')

/** Até 3 avatares sobrepostos, com "+n" quando há mais responsáveis. */
export function AvatarStack({ ids, people, max = 3 }: { ids: string[]; people: PersonLike[]; max?: number }) {
  if (!ids.length) return <span className="avatar empty" title="Sem responsável">–</span>
  const shown = ids.slice(0, max)
  const names = ids.map((id) => personName(people.find((p) => p.id === id))).join(', ')
  return (
    <span className="avatar-stack" title={names}>
      {shown.map((id) => (
        <span key={id} className="avatar">{initials(personName(people.find((p) => p.id === id)))}</span>
      ))}
      {ids.length > max && <span className="avatar more">+{ids.length - max}</span>}
    </span>
  )
}

export function Badge({ n, title }: { n: number; title?: string }) {
  if (!n) return null
  return (
    <span className="badge" title={title ?? `${n} não lida${n > 1 ? 's' : ''}`} aria-label={title ?? `${n} não lidas`}>
      {n > 99 ? '99+' : n}
    </span>
  )
}

export function Toast({ text, onClose }: { text: string | null; onClose: () => void }) {
  if (!text) return null
  return (
    <div className="toast" role="status">
      <span>{text}</span>
      <button type="button" className="btn ghost small" onClick={onClose} aria-label="Fechar aviso">✕</button>
    </div>
  )
}

export function timeAgo(iso: string | null): string {
  if (!iso) return 'nunca'
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'agora'
  if (s < 3600) return `há ${Math.floor(s / 60)} min`
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`
  if (s < 86400 * 30) return `há ${Math.floor(s / 86400)} d`
  return new Date(iso).toLocaleDateString('pt-BR')
}

// ---------- Dicas nos campos ----------
// Preferência "mostrar todas as dicas", compartilhada entre os formulários.
let hintsAll = false
const hintListeners = new Set<() => void>()
try {
  hintsAll = typeof window !== 'undefined' && localStorage.getItem('trilha.dicas') === '1'
} catch {
  /* sem armazenamento */
}
export function setAllHints(v: boolean) {
  hintsAll = v
  try {
    localStorage.setItem('trilha.dicas', v ? '1' : '0')
  } catch {
    /* ignorado */
  }
  hintListeners.forEach((f) => f())
}
export function useAllHints(): boolean {
  const [v, setV] = useState(hintsAll)
  useEffect(() => {
    const f = () => setV(hintsAll)
    hintListeners.add(f)
    f()
    return () => {
      hintListeners.delete(f)
    }
  }, [])
  return v
}

export function HintsToggle() {
  const on = useAllHints()
  return (
    <label className="hints-toggle">
      <input id="hints-all" type="checkbox" checked={on} onChange={(e) => setAllHints(e.target.checked)} />
      Mostrar todas as dicas
    </label>
  )
}

/** Campo de formulário com rótulo e dica opcional (botão "?" que abre e fecha). */
export function Field({
  id, label, hint, children, className = '',
}: { id: string; label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  const all = useAllHints()
  const [open, setOpen] = useState(false)
  const show = !!hint && (all || open)
  return (
    <div className={`field ${className}`}>
      <div className="field-label">
        <label htmlFor={id}>{label}</label>
        {hint && (
          <button
            type="button"
            className="hint-btn"
            aria-expanded={show}
            aria-controls={`${id}-dica`}
            aria-label={`Dica sobre ${typeof label === 'string' ? label : 'este campo'}`}
            onClick={() => (all ? setAllHints(false) : setOpen(!open))}
          >
            ?
          </button>
        )}
      </div>
      {children}
      {show && (
        <p id={`${id}-dica`} className="field-hint" role="note">
          {hint}
        </p>
      )}
    </div>
  )
}

/**
 * Dica de painel ou indicador: devolve o botão "?" (para pôr ao lado do título)
 * e a caixa de explicação (para pôr logo abaixo). Respeita "mostrar todas as dicas".
 */
export function useHint(id: string, label: string) {
  const all = useAllHints()
  const [open, setOpen] = useState(false)
  const show = all || open
  const button = (
    <button
      type="button"
      className="hint-btn"
      aria-expanded={show}
      aria-controls={`${id}-dica`}
      aria-label={`Como ler: ${label}`}
      onClick={() => (all ? setAllHints(false) : setOpen(!open))}
    >
      ?
    </button>
  )
  const box = (content: React.ReactNode) =>
    show ? (
      <div id={`${id}-dica`} className="help-box" role="note">
        {content}
      </div>
    ) : null
  return { button, box }
}
