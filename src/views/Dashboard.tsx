'use client'

import { useMemo } from 'react'
import { Avatar, HintsToggle, personName, statusColor, useHint, useWidth } from '../components/ui'
import { HELP } from '../lib/help'
import { shortDate } from '../lib/dates'
import { daysLate, flowTimes, isLate, projectHealth, schedule, throughput } from '../lib/metrics'
import { PHASES, STATUSES, type Snapshot } from '../types'

export function Dashboard({ snap, onOpen }: { snap: Snapshot; onOpen: (id: number) => void }) {
  const health = useMemo(() => projectHealth(snap), [snap])
  const times = useMemo(() => flowTimes(snap), [snap])
  const thr = useMemo(() => throughput(snap), [snap])
  const sched = useMemo(() => schedule(snap.tasks), [snap.tasks])

  const work = snap.tasks.filter((t) => !t.milestone)
  const totalPts = work.reduce((s, t) => s + t.points, 0)
  const donePts = work.filter((t) => t.status === 'done').reduce((s, t) => s + t.points, 0)
  const late = snap.tasks.filter((t) => isLate(t)).sort((a, b) => daysLate(b) - daysLate(a))
  const pct = totalPts ? Math.round((donePts / totalPts) * 100) : 0
  const end = [...sched.values()].reduce((m, s) => (s.end > m ? s.end : m), '')
  const fmt = (v: number | null) => (v === null ? '—' : v.toFixed(1).replace('.', ','))
  const milestones = snap.tasks.filter((t) => t.milestone).sort((a, b) => (sched.get(a.id)!.start).localeCompare(sched.get(b.id)!.start))

  // Carga: os pontos de uma tarefa contam para cada um dos seus responsáveis
  const open = snap.tasks.filter((t) => t.status !== 'done' && !t.milestone)
  const people = [
    ...snap.members.map((m) => ({ key: m.id, name: personName(m) })),
    { key: '', name: 'Sem responsável' },
  ]
  const load = people
    .map(({ key, name }) => {
      const mine = open.filter((t) => (key ? t.assignees.includes(key) : t.assignees.length === 0))
      return { p: name, key, pts: mine.reduce((s, t) => s + t.points, 0), byStatus: STATUSES.map((s) => mine.filter((t) => t.status === s.id).reduce((a, t) => a + t.points, 0)) }
    })
    .filter((x) => x.pts > 0)
    .sort((a, b) => b.pts - a.pts)
  const maxLoad = Math.max(1, ...load.map((l) => l.pts))

  const lampLabel = { verde: 'No prazo', amarelo: 'Atenção', vermelho: 'Em risco' }[health.health]
  const h = {
    health: useHint('ajuda-situacao', 'situação do projeto'),
    done: useHint('ajuda-concluido', 'concluído'),
    late: useHint('ajuda-atrasadas', 'atrasadas'),
    lead: useHint('ajuda-lead', 'lead time'),
    cycle: useHint('ajuda-cycle', 'cycle time'),
    end: useHint('ajuda-termino', 'término previsto'),
    phases: useHint('ajuda-fases', 'progresso por fase'),
    thr: useHint('ajuda-vazao', 'vazão semanal'),
    overdue: useHint('ajuda-vencidos', 'prazos vencidos'),
    load: useHint('ajuda-carga', 'carga por pessoa'),
    ms: useHint('ajuda-marcos', 'marcos'),
  }

  return (
    <div className="page">
      <div className="page-tools"><HintsToggle /></div>
      <div className="health">
        <div className="lamp" aria-hidden="true">
          {(['vermelho', 'amarelo', 'verde'] as const).map((c) => (
            <i key={c} className={`${c} ${health.health === c ? 'on' : ''}`} />
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="title-row"><h2>Situação: {lampLabel}</h2>{h.health.button}</div>
          <ul>
            {health.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {h.health.box(HELP.health)}
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <span className="label">Concluído{h.done.button}</span>
          <span className="value">{pct}<small>%</small></span>
          <span className="sub mono">{donePts} de {totalPts} pts</span>
          {h.done.box(HELP.done)}
        </div>
        <div className="kpi">
          <span className="label">Atrasadas{h.late.button}</span>
          <span className="value" style={{ color: late.length ? 'var(--late)' : undefined }}>{late.length}</span>
          <span className="sub">prazo vencido, não concluídas</span>
          {h.late.box(HELP.late)}
        </div>
        <div className="kpi">
          <span className="label">Lead time{h.lead.button}</span>
          <span className="value">{fmt(times.leadTime)}<small>dias</small></span>
          <span className="sub">criação → feito</span>
          {h.lead.box(HELP.lead)}
        </div>
        <div className="kpi">
          <span className="label">Cycle time{h.cycle.button}</span>
          <span className="value">{fmt(times.cycleTime)}<small>dias</small></span>
          <span className="sub">fazendo → feito</span>
          {h.cycle.box(HELP.cycle)}
        </div>
        <div className="kpi">
          <span className="label">Término previsto{h.end.button}</span>
          <span className="value" style={{ fontSize: 22 }}>{end ? shortDate(end) : '—'}</span>
          <span className="sub">pelo cronograma atual</span>
          {h.end.box(HELP.end)}
        </div>
      </div>

      <div className="grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="title-row"><h2>Progresso por fase</h2>{h.phases.button}</div>
              <p>Pontos concluídos em cada etapa do ciclo de vida.</p>
            </div>
          </div>
          {h.phases.box(HELP.phases)}
          {PHASES.map((ph) => {
            const items = snap.tasks.filter((t) => t.phase === ph)
            if (!items.length) return null
            const tot = items.reduce((s, t) => s + (t.milestone ? 1 : t.points), 0)
            const segs = STATUSES.map((s) => ({
              s: s.id,
              v: items.filter((t) => t.status === s.id).reduce((a, t) => a + (t.milestone ? 1 : t.points), 0),
            })).reverse()
            const done = segs.find((x) => x.s === 'done')!.v
            return (
              <div className="phase-row" key={ph}>
                <span>{ph}</span>
                <div className="meter">
                  {segs.map((x) => (
                    <i key={x.s} style={{ width: `${(x.v / tot) * 100}%`, background: statusColor(x.s) }} />
                  ))}
                </div>
                <span className="num">{Math.round((done / tot) * 100)}%</span>
              </div>
            )
          })}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="title-row"><h2>Vazão semanal</h2>{h.thr.button}</div>
              <p>Tarefas concluídas por semana, até hoje.</p>
            </div>
          </div>
          {h.thr.box(HELP.throughput)}
          <ThroughputChart data={thr} />
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="title-row"><h2>Prazos vencidos</h2>{h.overdue.button}</div>
              <p>Ordenados pelo atraso.</p>
            </div>
          </div>
          {h.overdue.box(HELP.overdue)}
          {late.length === 0 ? (
            <p className="empty">Nenhuma tarefa atrasada.</p>
          ) : (
            <div className="list">
              {late.map((t) => (
                <button type="button" key={t.id} className="list-row" onClick={() => onOpen(t.id)}>
                  <span>
                    <span className="t">{t.title}</span>
                    <div className="sub">
                      {t.assignees.length ? t.assignees.map((id) => personName(snap.members.find((m) => m.id === id))).join(', ') : 'Sem responsável'} · {STATUSES.find((s) => s.id === t.status)?.label}
                    </div>
                  </span>
                  <span className="mono" style={{ color: 'var(--late)', fontSize: 12.5 }}>
                    {daysLate(t)} d
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="title-row"><h2>Carga por pessoa</h2>{h.load.button}</div>
              <p>Pontos em aberto, por coluna.</p>
            </div>
          </div>
          {h.load.box(HELP.load)}
          {load.length === 0 ? (
            <p className="empty">Nada em aberto.</p>
          ) : (
            load.map((l) => (
              <div key={l.key || 'none'} style={{ display: 'grid', gridTemplateColumns: '22px 90px 1fr 40px', gap: 10, alignItems: 'center', padding: '5px 0' }}>
                <Avatar name={l.key ? l.p : ''} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.p}</span>
                <div className="meter" style={{ height: 10 }}>
                  {l.byStatus.map((v, i) => (
                    <i key={i} style={{ width: `${(v / maxLoad) * 100}%`, background: statusColor(STATUSES[i].id) }} />
                  ))}
                </div>
                <span className="num" style={{ textAlign: 'right', fontSize: 12 }}>{l.pts}</span>
              </div>
            ))
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="title-row"><h2>Marcos</h2>{h.ms.button}</div>
              <p>Entregas-chave do projeto.</p>
            </div>
          </div>
          {h.ms.box(HELP.milestones)}
          {milestones.length === 0 ? (
            <p className="empty">Marque tarefas como marco para acompanhá-las aqui.</p>
          ) : (
            <div className="list">
              {milestones.map((t) => (
                <button type="button" key={t.id} className="list-row" onClick={() => onOpen(t.id)}>
                  <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span className="diamond" style={{ background: t.status === 'done' ? 'var(--st-done)' : isLate(t) ? 'var(--late)' : 'var(--ink)' }} />
                    <span className="t">{t.title}</span>
                  </span>
                  <span className="mono" style={{ fontSize: 12.5 }}>
                    {t.status === 'done' ? 'entregue' : shortDate(sched.get(t.id)!.start)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function ThroughputChart({ data }: { data: { label: string; count: number }[] }) {
  const [ref, W] = useWidth<HTMLDivElement>(260)
  const H = 190
  const pad = { l: 28, r: 8, t: 14, b: 26 }
  const max = Math.max(4, ...data.map((d) => d.count))
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  const bw = iw / data.length
  const avg = data.reduce((s, d) => s + d.count, 0) / data.length
  const y = (v: number) => pad.t + ih - (v / max) * ih
  return (
    <div className="chart" ref={ref}>
      <svg width={W} height={H} role="img" aria-label="Tarefas concluídas por semana">
        {[0, Math.round(max / 2), max].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--line)" />
            <text x={pad.l - 6} y={y(v) + 3.5} textAnchor="end">{v}</text>
          </g>
        ))}
        {data.map((d, i) => (
          <g key={d.label}>
            <rect
              x={pad.l + i * bw + bw * 0.18}
              y={y(d.count)}
              width={bw * 0.64}
              height={Math.max(0, y(0) - y(d.count))}
              rx={3}
              fill={i === data.length - 1 ? 'var(--accent)' : 'var(--st-todo)'}
              opacity={i === data.length - 1 ? 1 : 0.75}
            />
            {d.count > 0 && (
              <text x={pad.l + i * bw + bw / 2} y={y(d.count) - 4} textAnchor="middle" style={{ fill: 'var(--ink)' }}>
                {d.count}
              </text>
            )}
            <text x={pad.l + i * bw + bw / 2} y={H - 8} textAnchor="middle">
              {d.label === 'esta' ? 'esta sem.' : `${d.label} sem.`}
            </text>
          </g>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={y(avg)} y2={y(avg)} stroke="var(--ink)" strokeDasharray="4 4" opacity={0.6} />
      </svg>
      <div className="legend" style={{ marginTop: 6 }}>
        <span>
          <i style={{ background: 'transparent', borderTop: '2px dashed var(--ink)', height: 0, width: 14 }} />
          Média: {avg.toFixed(1).replace('.', ',')} por semana
        </span>
      </div>
    </div>
  )
}
