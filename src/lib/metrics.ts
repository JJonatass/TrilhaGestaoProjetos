// Tudo o que é "gerado automaticamente" sai daqui: cronograma do Gantt,
// caminho crítico, burndown, burnup, fluxo cumulativo, lead time e cycle time.

import type { Snapshot, Sprint, StatusChange, StatusId, Task } from '../types'
import { STATUSES } from '../types'
import { addDays, dayOfIso, diffDays, parseDay, rangeDays, today } from './dates'

// ---------------- Cronograma (Gantt) ----------------

export interface ScheduledTask {
  start: string
  end: string
  estimated: boolean // true quando a data foi calculada, não informada
}

/**
 * Define início e fim de cada tarefa.
 * - Com início e prazo: usa as datas informadas.
 * - Só com uma das datas: completa pela pontuação (1 ponto ≈ 1 dia útil de trabalho).
 * - Sem datas: começa no dia seguinte ao fim da última dependência (ou hoje).
 */
export function schedule(tasks: Task[]): Map<number, ScheduledTask> {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const out = new Map<number, ScheduledTask>()
  const visiting = new Set<number>()
  const now = today()

  const duration = (t: Task) => (t.milestone ? 0 : Math.max(1, Math.round(t.points || 1)) - 1)

  const visit = (t: Task): ScheduledTask => {
    const done = out.get(t.id)
    if (done) return done
    if (visiting.has(t.id)) return { start: now, end: now, estimated: true } // ciclo: interrompe
    visiting.add(t.id)

    let result: ScheduledTask
    if (t.start && t.due) {
      result = { start: t.start, end: t.due < t.start ? t.start : t.due, estimated: false }
    } else if (t.start) {
      result = { start: t.start, end: addDays(t.start, duration(t)), estimated: true }
    } else if (t.due) {
      result = { start: addDays(t.due, -duration(t)), end: t.due, estimated: true }
    } else {
      let start = t.status === 'done' ? dayOfIso(t.createdAt) : now
      for (const depId of t.dependsOn) {
        const dep = byId.get(depId)
        if (!dep) continue
        const s = visit(dep)
        const next = dep.milestone ? s.end : addDays(s.end, 1)
        if (next > start) start = next
      }
      result = { start, end: addDays(start, duration(t)), estimated: true }
    }
    visiting.delete(t.id)
    out.set(t.id, result)
    return result
  }

  tasks.forEach(visit)
  return out
}

/**
 * Caminho crítico: parte da tarefa que termina por último e volta pelas
 * dependências, sempre escolhendo a que termina mais tarde. É a cadeia
 * que, se atrasar, empurra a data final do projeto.
 */
export function criticalPath(tasks: Task[], sched: Map<number, ScheduledTask>): Set<number> {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const path = new Set<number>()
  if (!tasks.length) return path
  let cur = tasks.reduce((a, b) => ((sched.get(b.id)?.end ?? '') > (sched.get(a.id)?.end ?? '') ? b : a))
  while (cur && !path.has(cur.id)) {
    path.add(cur.id)
    const deps = cur.dependsOn.map((d) => byId.get(d)).filter((d): d is Task => !!d)
    if (!deps.length) break
    cur = deps.reduce((a, b) => ((sched.get(b.id)?.end ?? '') > (sched.get(a.id)?.end ?? '') ? b : a))
  }
  return path
}

export function projectRange(snap: Snapshot, sched: Map<number, ScheduledTask>): { start: string; end: string } {
  const days: string[] = [today()]
  for (const s of sched.values()) days.push(s.start, s.end)
  for (const sp of snap.sprints) days.push(sp.start, sp.end)
  for (const h of snap.history) days.push(dayOfIso(h.at))
  days.sort()
  return { start: days[0], end: days[days.length - 1] }
}

// ---------------- Histórico de status ----------------

function historyByTask(history: StatusChange[]): Map<number, StatusChange[]> {
  const m = new Map<number, StatusChange[]>()
  for (const h of history) {
    const list = m.get(h.taskId) ?? []
    list.push(h)
    m.set(h.taskId, list)
  }
  for (const list of m.values()) list.sort((a, b) => a.at.localeCompare(b.at))
  return m
}

/** Coluna em que a tarefa estava ao fim do dia informado (null se ainda não existia). */
function statusAtDay(changes: StatusChange[] | undefined, day: string): StatusId | null {
  if (!changes) return null
  let s: StatusId | null = null
  for (const c of changes) {
    if (dayOfIso(c.at) <= day) s = c.to
    else break
  }
  return s
}

// ---------------- Diagrama de fluxo cumulativo ----------------

export interface CfdPoint {
  day: string
  counts: Record<StatusId, number>
}

export function cumulativeFlow(snap: Snapshot, start: string, end: string): CfdPoint[] {
  const hist = historyByTask(snap.history)
  const last = end < today() ? end : today()
  return rangeDays(start, last).map((day) => {
    const counts = Object.fromEntries(STATUSES.map((s) => [s.id, 0])) as Record<StatusId, number>
    for (const t of snap.tasks) {
      const s = statusAtDay(hist.get(t.id), day)
      if (s) counts[s]++
    }
    return { day, counts }
  })
}

// ---------------- Burndown e burnup ----------------

export interface BurnPoint {
  day: string
  ideal: number
  remaining: number | null // null para dias futuros
  done: number | null
  scope: number
}

export function burn(snap: Snapshot, sprint: Sprint): BurnPoint[] {
  const hist = historyByTask(snap.history)
  // sprint encerrado: inclui o que sobrou e foi levado para outro sprint
  const carried = new Set(sprint.report?.carried ?? [])
  const tasks = snap.tasks.filter((t) => t.sprintId === sprint.id || carried.has(t.id))
  const total = tasks.reduce((s, t) => s + t.points, 0)
  const days = rangeDays(sprint.start, sprint.end)
  const span = Math.max(1, days.length - 1)
  const now = today()
  return days.map((day, i) => {
    let done: number | null = null
    // Escopo do dia: tarefas do sprint que já existiam (mostra quando entra trabalho novo)
    let scope = total
    if (day <= now) {
      done = 0
      scope = 0
      for (const t of tasks) {
        if (dayOfIso(t.createdAt) <= day) scope += t.points
        if (statusAtDay(hist.get(t.id), day) === 'done') done += t.points
      }
    }
    return {
      day,
      ideal: Math.round((total - (total * i) / span) * 10) / 10,
      remaining: done === null ? null : Math.max(0, scope - done),
      done,
      scope,
    }
  })
}

// ---------------- Tempos e vazão ----------------

export interface FlowTimes {
  leadTime: number | null // média em dias: criação → feito
  cycleTime: number | null // média em dias: começou a fazer → feito
  perTask: { task: Task; lead: number; cycle: number | null }[]
}

const hoursBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000

export function flowTimes(snap: Snapshot): FlowTimes {
  const hist = historyByTask(snap.history)
  const perTask: FlowTimes['perTask'] = []
  for (const t of snap.tasks) {
    if (t.status !== 'done' || t.milestone) continue
    const changes = hist.get(t.id) ?? []
    const doneAt = [...changes].reverse().find((c) => c.to === 'done')?.at
    if (!doneAt) continue
    const startedAt = changes.find((c) => c.to === 'doing')?.at
    perTask.push({
      task: t,
      lead: Math.max(0, hoursBetween(t.createdAt, doneAt) / 24),
      cycle: startedAt ? Math.max(0, hoursBetween(startedAt, doneAt) / 24) : null,
    })
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  return {
    leadTime: avg(perTask.map((p) => p.lead)),
    cycleTime: avg(perTask.map((p) => p.cycle).filter((c): c is number => c !== null)),
    perTask,
  }
}

/** Tarefas concluídas por semana (semanas terminando hoje, da mais antiga para a mais recente). */
export function throughput(snap: Snapshot, weeks = 6): { label: string; count: number }[] {
  const hist = historyByTask(snap.history)
  const now = today()
  const doneDays: string[] = []
  for (const t of snap.tasks) {
    if (t.status !== 'done' || t.milestone) continue
    const d = [...(hist.get(t.id) ?? [])].reverse().find((c) => c.to === 'done')
    if (d) doneDays.push(dayOfIso(d.at))
  }
  const out: { label: string; count: number }[] = []
  for (let w = weeks - 1; w >= 0; w--) {
    const end = addDays(now, -7 * w)
    const start = addDays(end, -6)
    out.push({
      label: w === 0 ? 'esta' : `-${w}`,
      count: doneDays.filter((d) => d >= start && d <= end).length,
    })
  }
  return out
}

// ---------------- Situação ----------------

export function isLate(t: Task, now = today()): boolean {
  return t.status !== 'done' && !!t.due && t.due < now
}

export function daysLate(t: Task, now = today()): number {
  return t.due ? diffDays(t.due, now) : 0
}

export type Health = 'verde' | 'amarelo' | 'vermelho'

export function projectHealth(snap: Snapshot): { health: Health; reasons: string[] } {
  const reasons: string[] = []
  const open = snap.tasks.filter((t) => t.status !== 'done')
  const late = open.filter((t) => isLate(t))
  const lateSerious = late.filter((t) => t.priority === 'alta' || t.priority === 'critica')
  const wipOver = STATUSES.filter((s) => {
    const lim = snap.meta.wip[s.id]
    return lim && snap.tasks.filter((t) => t.status === s.id).length > lim
  })

  if (late.length) reasons.push(`${late.length} tarefa${late.length > 1 ? 's' : ''} com prazo vencido`)
  if (wipOver.length) reasons.push(`limite de WIP excedido em ${wipOver.map((s) => s.label).join(', ')}`)

  const current = snap.sprints.find((s) => s.start <= today() && s.end >= today())
  if (current) {
    const pts = burn(snap, current)
    const todayPt = pts.find((p) => p.day === today())
    if (todayPt && todayPt.remaining !== null && todayPt.scope > 0) {
      const gap = (todayPt.remaining - todayPt.ideal) / todayPt.scope
      if (gap > 0.25) reasons.push(`${current.name} ${Math.round(gap * 100)}% acima da linha ideal`)
    }
  }

  let health: Health = 'verde'
  if (reasons.length) health = 'amarelo'
  if (lateSerious.length || (open.length && late.length / open.length > 0.2)) health = 'vermelho'
  if (!reasons.length) reasons.push('Prazos e fluxo dentro do esperado')
  return { health, reasons }
}

export function weekdayShort(day: string): string {
  return ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'][parseDay(day).getDay()]
}


// ---------------------------------------------------------------------------
// Velocidade: pontos planejados x entregues por sprint

export interface VelocityPoint {
  sprint: Sprint
  committed: number
  completed: number
  closed: boolean
}

/** Sprints encerrados (pelo relatório) e o sprint em andamento (pelo estado atual) */
export function velocity(snap: Snapshot): VelocityPoint[] {
  const now = today()
  return [...snap.sprints]
    .sort((a, b) => a.start.localeCompare(b.start))
    .filter((s) => s.closedAt || s.start <= now)
    .map((s) => {
      if (s.report) return { sprint: s, committed: s.report.committedPoints, completed: s.report.completedPoints, closed: true }
      const ts = snap.tasks.filter((t) => t.sprintId === s.id && !t.milestone)
      return {
        sprint: s,
        committed: ts.reduce((a, t) => a + t.points, 0),
        completed: ts.filter((t) => t.status === 'done').reduce((a, t) => a + t.points, 0),
        closed: !!s.closedAt,
      }
    })
}

/** Média de pontos entregues nos últimos n sprints encerrados */
export function averageVelocity(points: VelocityPoint[], n = 3): number | null {
  const closed = points.filter((p) => p.closed).slice(-n)
  if (!closed.length) return null
  return closed.reduce((a, p) => a + p.completed, 0) / closed.length
}
