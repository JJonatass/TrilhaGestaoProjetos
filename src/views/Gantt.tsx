'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { statusColor, useHint } from '../components/ui'
import { HELP } from '../lib/help'
import { addDays, diffDays, parseDay, rangeDays, shortDate, today, weekday } from '../lib/dates'
import { criticalPath, isLate, projectRange, schedule } from '../lib/metrics'
import { PHASES, STATUSES, type Snapshot, type Task } from '../types'

type Zoom = 'dia' | 'semana' | 'mes'
const DAY_W: Record<Zoom, number> = { dia: 30, semana: 14, mes: 6 }
const ROW_H = 34
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

type Row = { kind: 'group'; label: string } | { kind: 'task'; task: Task }

export function Gantt({ snap, onOpen }: { snap: Snapshot; onOpen: (id: number) => void }) {
  const [zoom, setZoom] = useState<Zoom>('dia')
  const [grouped, setGrouped] = useState(true)
  const [showCritical, setShowCritical] = useState(true)
  const [labelW, setLabelW] = useState(250)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fit = () => setLabelW(window.innerWidth < 640 ? 150 : 250)
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  const sched = useMemo(() => schedule(snap.tasks), [snap.tasks])
  const critical = useMemo(() => criticalPath(snap.tasks, sched), [snap.tasks, sched])
  const range = useMemo(() => {
    const r = projectRange(snap, sched)
    return { start: addDays(r.start, -2), end: addDays(r.end, 4) }
  }, [snap, sched])

  const dayW = DAY_W[zoom]
  const hG = useHint('ajuda-gantt', 'cronograma')
  const days = rangeDays(range.start, range.end)
  const width = days.length * dayW
  const now = today()
  const x = (d: string) => diffDays(range.start, d) * dayW

  const rows: Row[] = useMemo(() => {
    const byStart = (a: Task, b: Task) => (sched.get(a.id)!.start).localeCompare(sched.get(b.id)!.start) || a.id - b.id
    if (!grouped) return [...snap.tasks].sort(byStart).map((task) => ({ kind: 'task' as const, task }))
    const out: Row[] = []
    for (const phase of PHASES) {
      const items = snap.tasks.filter((t) => t.phase === phase).sort(byStart)
      if (!items.length) continue
      out.push({ kind: 'group', label: phase })
      items.forEach((task) => out.push({ kind: 'task', task }))
    }
    return out
  }, [snap.tasks, grouped, sched])

  const rowIndex = new Map<number, number>()
  rows.forEach((r, i) => r.kind === 'task' && rowIndex.set(r.task.id, i))
  const bodyH = rows.length * ROW_H

  const scrollToToday = () => {
    const el = wrapRef.current
    if (el) el.scrollTo({ left: Math.max(0, x(now) - (el.clientWidth - labelW) / 3), behavior: 'smooth' })
  }
  useEffect(() => {
    scrollToToday()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, labelW])

  // Cabeçalho: marcas de tempo conforme o zoom.
  const ticks: { day: string; label: string; strong?: boolean }[] = []
  days.forEach((d) => {
    const date = parseDay(d)
    if (zoom === 'dia') ticks.push({ day: d, label: String(date.getDate()), strong: date.getDate() === 1 })
    else if (zoom === 'semana' && weekday(d) === 1) ticks.push({ day: d, label: shortDate(d) })
    else if (zoom === 'mes' && date.getDate() === 1) ticks.push({ day: d, label: `${MONTHS[date.getMonth()]} ${date.getFullYear()}` })
  })

  // Setas de dependência: saem do fim da tarefa anterior e chegam no início da seguinte.
  const arrows: { d: string; crit: boolean }[] = []
  for (const t of snap.tasks) {
    const ti = rowIndex.get(t.id)
    const ts = sched.get(t.id)
    if (ti === undefined || !ts) continue
    for (const depId of t.dependsOn) {
      const di = rowIndex.get(depId)
      const ds = sched.get(depId)
      const dep = snap.tasks.find((k) => k.id === depId)
      if (di === undefined || !ds || !dep) continue
      const x1 = dep.milestone ? x(ds.end) + dayW / 2 + 7 : x(ds.end) + dayW
      const y1 = di * ROW_H + ROW_H / 2
      const x2 = t.milestone ? x(ts.start) + dayW / 2 - 8 : x(ts.start)
      const y2 = ti * ROW_H + ROW_H / 2
      let d: string
      if (x2 - x1 >= 14) {
        d = `M${x1},${y1} H${x1 + 6} V${y2} H${x2 - 2}`
      } else {
        const ym = y2 > y1 ? y2 - ROW_H / 2 : y2 + ROW_H / 2
        d = `M${x1},${y1} H${x1 + 6} V${ym} H${x2 - 10} V${y2} H${x2 - 2}`
      }
      arrows.push({ d, crit: showCritical && critical.has(t.id) && critical.has(depId) })
    }
  }

  const end = snap.tasks.length ? [...sched.values()].reduce((m, s) => (s.end > m ? s.end : m), '0000') : null

  return (
    <div className="page">
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Zoom">
          {(['dia', 'semana', 'mes'] as Zoom[]).map((z) => (
            <button key={z} type="button" aria-pressed={zoom === z} onClick={() => setZoom(z)}>
              {z === 'dia' ? 'Dias' : z === 'semana' ? 'Semanas' : 'Meses'}
            </button>
          ))}
        </div>
        <label className="check">
          <input id="gantt-group" type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
          Agrupar por fase
        </label>
        <label className="check">
          <input id="gantt-critical" type="checkbox" checked={showCritical} onChange={(e) => setShowCritical(e.target.checked)} />
          Caminho crítico
        </label>
        <button type="button" className="btn small" onClick={scrollToToday}>
          Ir para hoje
        </button>
        <span className="title-row hint">Como ler {hG.button}</span>
        <span className="spacer" />
        {end && (
          <span className="hint">
            Término previsto: <b className="mono" style={{ color: 'var(--ink)' }}>{shortDate(end)}</b>
          </span>
        )}
      </div>

      {hG.box(HELP.gantt)}
      {snap.tasks.length === 0 ? (
        <p className="empty">Crie tarefas no quadro e o cronograma aparece aqui automaticamente.</p>
      ) : (
        <div className="gantt-wrap" ref={wrapRef} style={{ ['--label-w' as string]: `${labelW}px` }}>
          <div className="gantt" style={{ width: labelW + width }}>
            <div className="g-head">
              <div className="g-row">
                <div className="g-label">Sprints</div>
                <div className="g-track" style={{ width }}>
                  {snap.sprints.map((s) => (
                    <div key={s.id} className="g-cell sprint" style={{ left: x(s.start), width: (diffDays(s.start, s.end) + 1) * dayW }} title={`${s.name}: ${shortDate(s.start)} a ${shortDate(s.end)}`}>
                      {s.name}
                    </div>
                  ))}
                </div>
              </div>
              <div className="g-row">
                <div className="g-label">Tarefa</div>
                <div className="g-track" style={{ width }}>
                  {ticks.map((t) => (
                    <div
                      key={t.day}
                      className={`g-cell ${t.day === now ? 'today' : ''}`}
                      style={{ left: x(t.day), width: zoom === 'dia' ? dayW : undefined, fontWeight: t.strong ? 700 : undefined }}
                    >
                      {t.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ position: 'relative' }}>
              {/* Camada de fundo: fins de semana, linha de hoje e setas */}
              <svg className="g-overlay" style={{ left: labelW, zIndex: 0 }} width={width} height={bodyH} aria-hidden="true">
                <defs>
                  <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M0,0 L8,4 L0,8 z" fill="var(--faint)" />
                  </marker>
                  <marker id="arrow-crit" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M0,0 L8,4 L0,8 z" fill="var(--late)" />
                  </marker>
                </defs>
                {zoom !== 'mes' &&
                  days.map((d) =>
                    weekday(d) === 0 || weekday(d) === 6 ? (
                      <rect key={d} x={x(d)} y={0} width={dayW} height={bodyH} fill="var(--surface-2)" opacity={0.7} />
                    ) : null,
                  )}
                {arrows.map((a, i) => (
                  <path
                    key={i}
                    d={a.d}
                    fill="none"
                    stroke={a.crit ? 'var(--late)' : 'var(--faint)'}
                    strokeWidth={a.crit ? 1.6 : 1.2}
                    markerEnd={`url(#${a.crit ? 'arrow-crit' : 'arrow'})`}
                  />
                ))}
                <line x1={x(now) + dayW / 2} x2={x(now) + dayW / 2} y1={0} y2={bodyH} stroke="var(--accent)" strokeWidth={2} />
              </svg>

              {rows.map((r, i) =>
                r.kind === 'group' ? (
                  <div key={`g-${r.label}`} className="g-row group" style={{ position: 'relative', zIndex: 1 }}>
                    <div className="g-label group">{r.label}</div>
                    <div className="g-track" style={{ width, background: 'transparent' }} />
                  </div>
                ) : (
                  <GanttRow
                    key={r.task.id}
                    task={r.task}
                    index={i}
                    width={width}
                    dayW={dayW}
                    x={x}
                    sched={sched.get(r.task.id)!}
                    critical={showCritical && critical.has(r.task.id)}
                    onOpen={onOpen}
                  />
                ),
              )}
            </div>
          </div>
        </div>
      )}

      <div className="legend" style={{ marginTop: 12 }}>
        {STATUSES.map((s) => (
          <span key={s.id}>
            <i style={{ background: statusColor(s.id) }} />
            {s.label}
          </span>
        ))}
        <span>
          <i style={{ background: 'var(--ink)', transform: 'rotate(45deg) scale(.85)' }} />
          Marco
        </span>
        <span>
          <i style={{ outline: '1px dashed var(--ink)', background: 'transparent' }} />
          Data estimada
        </span>
        <span>
          <i style={{ boxShadow: '0 0 0 2px var(--late)', background: 'transparent' }} />
          Caminho crítico
        </span>
        <span>
          <i style={{ background: 'var(--accent)', width: 3 }} />
          Hoje
        </span>
      </div>
    </div>
  )
}

function GanttRow({
  task: t, width, dayW, x, sched, critical, onOpen,
}: {
  task: Task
  index: number
  width: number
  dayW: number
  x: (d: string) => number
  sched: { start: string; end: string; estimated: boolean }
  critical: boolean
  onOpen: (id: number) => void
}) {
  const late = isLate(t)
  const left = x(sched.start)
  const w = (diffDays(sched.start, sched.end) + 1) * dayW
  const tip = `${t.title}\n${shortDate(sched.start)} → ${shortDate(sched.end)}${sched.estimated ? ' (estimado)' : ''}`
  return (
    <div className="g-row" style={{ position: 'relative', zIndex: 1 }}>
      <div className="g-label" onClick={() => onOpen(t.id)} title={t.title}>
        <span className="dot" style={{ background: statusColor(t.status) }} />
        <span className="t" style={{ color: late ? 'var(--late)' : undefined }}>{t.title}</span>
      </div>
      <div className="g-track" style={{ width }}>
        {t.milestone ? (
          <div
            className={`g-milestone ${critical ? 'critical' : ''} ${t.status === 'done' ? 'done' : ''}`}
            style={{ left: left + dayW / 2 - 7 }}
            title={tip}
            onClick={() => onOpen(t.id)}
          />
        ) : (
          <div
            className={`bar ${sched.estimated ? 'estimated' : ''} ${critical ? 'critical' : ''} ${late ? 'late' : ''}`}
            style={{ left, width: Math.max(6, w - 2), background: statusColor(t.status) }}
            title={tip}
            onClick={() => onOpen(t.id)}
          >
            {w > 70 ? t.title : ''}
          </div>
        )}
      </div>
    </div>
  )
}
