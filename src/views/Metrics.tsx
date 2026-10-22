'use client'

import { useMemo, useState } from 'react'
import { HintsToggle, statusColor, useHint, useWidth } from '../components/ui'
import { HELP } from '../lib/help'
import { shortDate, today } from '../lib/dates'
import { averageVelocity, burn, cumulativeFlow, flowTimes, projectRange, schedule, velocity, type BurnPoint, type CfdPoint, type VelocityPoint } from '../lib/metrics'
import { STATUSES, type Snapshot, type StatusId } from '../types'

const PAD = { l: 38, r: 14, t: 12, b: 26 }

function niceMax(v: number) {
  if (v <= 5) return 5
  const pow = 10 ** Math.floor(Math.log10(v))
  const n = v / pow
  return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow
}

export function Metrics({ snap, onOpen }: { snap: Snapshot; onOpen: (id: number) => void }) {
  const now = today()
  const current = snap.sprints.find((s) => s.start <= now && s.end >= now) ?? snap.sprints[snap.sprints.length - 1]
  const [sprintId, setSprintId] = useState<number | null>(current?.id ?? null)
  const [mode, setMode] = useState<'down' | 'up'>('down')
  const sprint = snap.sprints.find((s) => s.id === sprintId) ?? current

  const burnPts = useMemo(() => (sprint ? burn(snap, sprint) : []), [snap, sprint])
  const range = useMemo(() => projectRange(snap, schedule(snap.tasks)), [snap])
  const cfd = useMemo(() => cumulativeFlow(snap, range.start, range.end), [snap, range])
  const times = useMemo(() => flowTimes(snap), [snap])
  const vel = useMemo(() => velocity(snap), [snap])
  const avg = averageVelocity(vel)
  const backlogPts = snap.tasks.filter((t) => t.status !== 'done' && !t.milestone).reduce((a, t) => a + t.points, 0)
  const hVel = useHint('ajuda-velocidade', 'velocidade')

  const todayPt = burnPts.find((p) => p.day === now) ?? [...burnPts].reverse().find((p) => p.remaining !== null)
  const hBurn = useHint('ajuda-burn', 'burndown e burnup')
  const hCfd = useHint('ajuda-cfd', 'fluxo cumulativo')
  const hFlow = useHint('ajuda-tempos', 'lead time e cycle time')

  return (
    <div className="page">
      <div className="page-tools"><HintsToggle /></div>
      <div className="grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="title-row"><h2>{mode === 'down' ? 'Burndown' : 'Burnup'}</h2>{hBurn.button}</div>
              <p>
                {mode === 'down'
                  ? 'Pontos que faltam no sprint, dia a dia, contra a linha ideal.'
                  : 'Pontos concluídos contra o escopo total. Mostra quando o escopo cresce.'}
              </p>
            </div>
            <span className="spacer" />
            <select id="metrics-sprint" className="input" style={{ width: 'auto' }} value={sprint?.id ?? ''} onChange={(e) => setSprintId(Number(e.target.value))}>
              {snap.sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.closedAt ? ' (encerrado)' : ''}
                </option>
              ))}
            </select>
            <div className="seg" role="group" aria-label="Tipo de gráfico">
              <button type="button" aria-pressed={mode === 'down'} onClick={() => setMode('down')}>Burndown</button>
              <button type="button" aria-pressed={mode === 'up'} onClick={() => setMode('up')}>Burnup</button>
            </div>
          </div>
          {hBurn.box(mode === 'down' ? HELP.burndown : HELP.burnup)}
          {!sprint ? (
            <p className="empty">Cadastre um sprint nas configurações para gerar este gráfico.</p>
          ) : Math.max(0, ...burnPts.map((p) => p.scope)) === 0 ? (
            <p className="empty">Nenhuma tarefa com pontos neste sprint.</p>
          ) : (
            <>
              <BurnChart points={burnPts} mode={mode} />
              <div className="legend" style={{ marginTop: 8 }}>
                {mode === 'down' ? (
                  <>
                    <span><i style={{ background: 'var(--accent)' }} />Restante</span>
                    <span><i style={{ background: 'var(--faint)' }} />Ideal</span>
                  </>
                ) : (
                  <>
                    <span><i style={{ background: 'var(--accent)' }} />Concluído</span>
                    <span><i style={{ background: 'var(--ink)' }} />Escopo</span>
                  </>
                )}
                {todayPt && todayPt.remaining !== null && (
                  <span style={{ marginLeft: 'auto' }} className="mono">
                    {shortDate(todayPt.day)}: {todayPt.done} de {todayPt.scope} pts feitos
                  </span>
                )}
              </div>
            </>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="title-row"><h2>Velocidade</h2>{hVel.button}</div>
              <p>Pontos planejados e entregues em cada sprint.</p>
            </div>
          </div>
          {hVel.box(
            <>
              <p><b>Velocidade</b> é quantos pontos a equipe entrega por sprint. Ela vem do relatório guardado quando o sprint é encerrado (aba Planejamento). O sprint em andamento aparece com os números de hoje.</p>
              <p>Use a média dos últimos sprints para planejar o próximo: colocar muito mais pontos do que a média costuma terminar com tarefas sobrando. A previsão divide os pontos que faltam no projeto pela média.</p>
            </>,
          )}
          {vel.length === 0 ? (
            <p className="empty">A velocidade aparece quando o primeiro sprint começar.</p>
          ) : (
            <>
              <VelocityChart points={vel} />
              <div className="legend" style={{ marginTop: 8 }}>
                <span><i style={{ background: 'var(--surface-3)' }} />Planejado</span>
                <span><i style={{ background: 'var(--st-done)' }} />Entregue</span>
                <span><i style={{ background: 'var(--st-done)', opacity: 0.45 }} />Sprint em andamento</span>
              </div>
              <div className="kpis" style={{ marginTop: 12 }}>
                <div className="kpi">
                  <span className="label">Velocidade média</span>
                  <span className="value">{avg === null ? '—' : `${Math.round(avg * 10) / 10}`}</span>
                  <span className="sub">{avg === null ? 'encerre um sprint para calcular' : 'pts por sprint (últimos 3 encerrados)'}</span>
                </div>
                <div className="kpi">
                  <span className="label">Falta no projeto</span>
                  <span className="value">{backlogPts}</span>
                  <span className="sub">
                    {avg ? `≈ ${Math.max(1, Math.ceil(backlogPts / avg))} sprint${Math.ceil(backlogPts / avg) > 1 ? 's' : ''} nesse ritmo` : 'pontos em aberto'}
                  </span>
                </div>
              </div>
            </>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="title-row"><h2>Fluxo cumulativo</h2>{hCfd.button}</div>
              <p>Tarefas em cada coluna ao fim de cada dia. Faixas que engrossam indicam gargalo.</p>
            </div>
          </div>
          {hCfd.box(HELP.cfd)}
          <CfdChart points={cfd} />
          <div className="legend" style={{ marginTop: 8 }}>
            {[...STATUSES].reverse().map((s) => (
              <span key={s.id}>
                <i style={{ background: statusColor(s.id) }} />
                {s.label}
              </span>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="title-row"><h2>Lead time e cycle time</h2>{hFlow.button}</div>
              <p>Lead time: da criação até Feito. Cycle time: de Fazendo até Feito.</p>
            </div>
          </div>
          {hFlow.box(HELP.flow)}
          {times.perTask.length === 0 ? (
            <p className="empty">Os tempos aparecem quando as primeiras tarefas chegarem em Feito.</p>
          ) : (
            <FlowTable times={times} onOpen={onOpen} />
          )}
        </section>
      </div>
    </div>
  )
}

function BurnChart({ points, mode }: { points: BurnPoint[]; mode: 'down' | 'up' }) {
  const [ref, W] = useWidth<HTMLDivElement>(300)
  const H = 240
  const scope = Math.max(...points.map((p) => p.scope))
  const maxY = niceMax(scope)
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b
  const xs = (i: number) => PAD.l + (points.length === 1 ? 0 : (i * iw) / (points.length - 1))
  const ys = (v: number) => PAD.t + ih - (v / maxY) * ih
  const known = points.map((p, i) => ({ p, i })).filter(({ p }) => p.remaining !== null)
  const series = mode === 'down' ? known.map(({ p, i }) => [xs(i), ys(p.remaining!)]) : known.map(({ p, i }) => [xs(i), ys(p.done!)])
  const line = series.map(([x, y], k) => `${k ? 'L' : 'M'}${x},${y}`).join(' ')
  const area = series.length ? `${line} L${series[series.length - 1][0]},${ys(0)} L${series[0][0]},${ys(0)} Z` : ''
  const idx = points.findIndex((p) => p.day === today())
  const step = Math.ceil(points.length / Math.max(2, Math.floor(iw / 60)))
  const last = series[series.length - 1]

  return (
    <div className="chart" ref={ref}>
      <svg width={W} height={H} role="img" aria-label={mode === 'down' ? 'Gráfico de burndown' : 'Gráfico de burnup'}>
        {[0, maxY / 2, maxY].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={ys(v)} y2={ys(v)} stroke="var(--line)" />
            <text x={PAD.l - 6} y={ys(v) + 3.5} textAnchor="end">{v}</text>
          </g>
        ))}
        {points.map((p, i) =>
          (i % step === 0 && points.length - 1 - i >= step * 0.7) || i === points.length - 1 ? (
            <text key={p.day} x={xs(i)} y={H - 8} textAnchor="middle">{shortDate(p.day)}</text>
          ) : null,
        )}
        {idx >= 0 && <line x1={xs(idx)} x2={xs(idx)} y1={PAD.t} y2={PAD.t + ih} stroke="var(--accent)" strokeDasharray="2 3" />}
        {mode === 'down' ? (
          <path d={points.map((p, i) => `${i ? 'L' : 'M'}${xs(i)},${ys(p.ideal)}`).join(' ')} fill="none" stroke="var(--faint)" strokeWidth={1.5} strokeDasharray="5 4" />
        ) : (
          <path d={points.map((p, i) => `${i ? 'L' : 'M'}${xs(i)},${ys(p.scope)}`).join(' ')} fill="none" stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="5 4" />
        )}
        <path d={area} fill="var(--accent)" opacity={0.12} />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2.2} strokeLinejoin="round" />
        {last && <circle cx={last[0]} cy={last[1]} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />}
      </svg>
    </div>
  )
}

const CFD_ORDER: StatusId[] = ['done', 'review', 'doing', 'todo', 'backlog']

function CfdChart({ points }: { points: CfdPoint[] }) {
  const [ref, W] = useWidth<HTMLDivElement>(300)
  const H = 240
  if (!points.length) return <p className="empty">Sem histórico ainda.</p>
  const total = Math.max(...points.map((p) => CFD_ORDER.reduce((s, k) => s + p.counts[k], 0)), 1)
  const maxY = niceMax(total)
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b
  const xs = (i: number) => PAD.l + (points.length === 1 ? 0 : (i * iw) / (points.length - 1))
  const ys = (v: number) => PAD.t + ih - (v / maxY) * ih
  const step = Math.ceil(points.length / Math.max(2, Math.floor(iw / 64)))

  const layers = CFD_ORDER.map((k, li) => {
    const lower = points.map((p) => CFD_ORDER.slice(0, li).reduce((s, kk) => s + p.counts[kk], 0))
    const upper = points.map((p, i) => lower[i] + p.counts[k])
    const top = upper.map((v, i) => `${i ? 'L' : 'M'}${xs(i)},${ys(v)}`).join(' ')
    const bottom = lower.map((v, i) => `L${xs(i)},${ys(v)}`).reverse().join(' ')
    return { k, d: `${top} ${bottom} Z` }
  })

  return (
    <div className="chart" ref={ref}>
      <svg width={W} height={H} role="img" aria-label="Diagrama de fluxo cumulativo">
        {layers.map((l) => (
          <path key={l.k} d={l.d} fill={statusColor(l.k)} opacity={0.85} stroke="var(--surface)" strokeWidth={0.6} />
        ))}
        {[0, maxY / 2, maxY].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={ys(v)} y2={ys(v)} stroke="var(--line)" opacity={0.6} />
            <text x={PAD.l - 6} y={ys(v) + 3.5} textAnchor="end">{v}</text>
          </g>
        ))}
        {points.map((p, i) =>
          (i % step === 0 && points.length - 1 - i >= step * 0.7) || i === points.length - 1 ? (
            <text key={p.day} x={xs(i)} y={H - 8} textAnchor="middle">{shortDate(p.day)}</text>
          ) : null,
        )}
      </svg>
    </div>
  )
}

function FlowTable({ times, onOpen }: { times: ReturnType<typeof flowTimes>; onOpen: (id: number) => void }) {
  const fmt = (v: number | null) => (v === null ? '—' : v < 1 ? `${Math.round(v * 24)} h` : `${v.toFixed(1).replace('.', ',')} d`)
  const max = Math.max(...times.perTask.map((p) => p.lead), 1)
  const rows = [...times.perTask].sort((a, b) => b.lead - a.lead)
  return (
    <>
      <div className="kpis" style={{ marginBottom: 12 }}>
        <div className="kpi">
          <span className="label">Lead time médio</span>
          <span className="value">{fmt(times.leadTime)}</span>
        </div>
        <div className="kpi">
          <span className="label">Cycle time médio</span>
          <span className="value">{fmt(times.cycleTime)}</span>
        </div>
      </div>
      <div className="list">
        {rows.map(({ task, lead, cycle }) => (
          <button type="button" key={task.id} className="list-row" onClick={() => onOpen(task.id)}>
            <span className="t">{task.title}</span>
            <span className="mono" style={{ fontSize: 12 }}>
              {fmt(lead)} · {fmt(cycle)}
            </span>
            <div className="meter" style={{ gridColumn: '1 / -1' }}>
              <i style={{ width: `${((lead - (cycle ?? 0)) / max) * 100}%`, background: 'var(--surface-3)' }} title="Espera antes de começar" />
              <i style={{ width: `${((cycle ?? 0) / max) * 100}%`, background: 'var(--accent)' }} title="Em execução" />
            </div>
          </button>
        ))}
      </div>
      <div className="legend" style={{ marginTop: 8 }}>
        <span><i style={{ background: 'var(--surface-3)' }} />Espera até começar</span>
        <span><i style={{ background: 'var(--accent)' }} />Em execução (cycle time)</span>
      </div>
    </>
  )
}


function VelocityChart({ points }: { points: VelocityPoint[] }) {
  const [ref, W] = useWidth<HTMLDivElement>(300)
  const H = 220
  const maxY = niceMax(Math.max(1, ...points.map((p) => Math.max(p.committed, p.completed))))
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b
  const ys = (v: number) => PAD.t + ih - (v / maxY) * ih
  const slot = iw / points.length
  const bw = Math.max(6, Math.min(26, slot / 2 - 6))
  return (
    <div className="chart" ref={ref}>
      <svg width={W} height={H} role="img" aria-label="Gráfico de velocidade por sprint">
        {[0, maxY / 2, maxY].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={ys(v)} y2={ys(v)} stroke="var(--line)" />
            <text x={PAD.l - 6} y={ys(v) + 3.5} textAnchor="end">{v}</text>
          </g>
        ))}
        {points.map((p, i) => {
          const cx = PAD.l + slot * i + slot / 2
          return (
            <g key={p.sprint.id}>
              <title>{`${p.sprint.name}: ${p.completed} de ${p.committed} pts${p.closed ? '' : ' (em andamento)'}`}</title>
              <rect x={cx - bw - 1} y={ys(p.committed)} width={bw} height={Math.max(0, ys(0) - ys(p.committed))} rx={3} fill="var(--surface-3)" />
              <rect x={cx + 1} y={ys(p.completed)} width={bw} height={Math.max(0, ys(0) - ys(p.completed))} rx={3} fill="var(--st-done)" opacity={p.closed ? 1 : 0.45} />
              <text x={cx + 1 + bw / 2} y={ys(p.completed) - 4} textAnchor="middle" style={{ fill: 'var(--ink)', fontWeight: 600 }}>{p.completed}</text>
              <text x={cx} y={H - 8} textAnchor="middle">{p.sprint.name.length > 12 ? `${p.sprint.name.slice(0, 11)}…` : p.sprint.name}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
