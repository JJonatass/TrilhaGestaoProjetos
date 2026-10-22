// Filtros do quadro e do cronograma (busca, responsável, rótulo, épico, tipo...).

import { addDays, today } from './dates'
import type { FilterQuery, Sprint, Task } from '../types'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Sprint em andamento: aberto e com hoje entre o início e o fim (ou o primeiro aberto) */
export function currentSprint(sprints: Sprint[]): Sprint | null {
  const td = today()
  const open = sprints.filter((s) => !s.closedAt)
  return open.find((s) => s.start <= td && td <= s.end) ?? open.find((s) => s.start > td) ?? null
}

export function isEmptyQuery(q: FilterQuery): boolean {
  return (
    !q.text?.trim() &&
    !q.assignees?.length &&
    !q.labels?.length &&
    !q.epics?.length &&
    !q.kinds?.length &&
    !q.priorities?.length &&
    q.sprint === undefined &&
    q.due === undefined
  )
}

export function countCriteria(q: FilterQuery): number {
  return [
    q.text?.trim(),
    q.assignees?.length,
    q.labels?.length,
    q.epics?.length,
    q.kinds?.length,
    q.priorities?.length,
    q.sprint !== undefined,
    q.due !== undefined,
  ].filter(Boolean).length
}

export function applyFilter(tasks: Task[], q: FilterQuery, ctx: { me: string | null; sprints: Sprint[] }): Task[] {
  if (isEmptyQuery(q)) return tasks
  const term = norm(q.text?.trim() ?? '')
  const td = today()
  const week = addDays(td, 7)
  const cur = q.sprint === 'atual' ? currentSprint(ctx.sprints) : null
  return tasks.filter((t) => {
    if (term && !norm(`${t.title} ${t.description}`).includes(term) && `#${t.id}` !== term) return false
    if (q.assignees?.length) {
      const want = q.assignees.map((a) => (a === 'me' ? ctx.me : a))
      const hit = want.some((a) => (a === 'none' ? t.assignees.length === 0 : a !== null && t.assignees.includes(a)))
      if (!hit) return false
    }
    if (q.labels?.length && !q.labels.some((l) => t.labels.includes(l))) return false
    if (q.epics?.length && !q.epics.some((e) => (e === 0 ? t.epicId === null : t.epicId === e))) return false
    if (q.kinds?.length && !q.kinds.includes(t.kind)) return false
    if (q.priorities?.length && !q.priorities.includes(t.priority)) return false
    if (q.sprint !== undefined) {
      if (q.sprint === 'sem' && t.sprintId !== null) return false
      if (q.sprint === 'atual' && (!cur || t.sprintId !== cur.id)) return false
      if (typeof q.sprint === 'number' && t.sprintId !== q.sprint) return false
    }
    if (q.due === 'atrasadas' && !(t.due && t.due < td && t.status !== 'done')) return false
    if (q.due === 'semana' && !(t.due && t.due >= td && t.due <= week && t.status !== 'done')) return false
    if (q.due === 'sem-prazo' && t.due) return false
    return true
  })
}
