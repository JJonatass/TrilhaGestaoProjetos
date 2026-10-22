// Colunas do quadro: as cinco padrão ou as personalizadas do projeto.
// Cada coluna pertence a uma etapa fixa (category); as métricas usam a etapa.

import { STATUSES, type ColumnDef, type ProjectMeta, type StatusId, type Task } from '../types'

const ORDER: StatusId[] = ['backlog', 'todo', 'doing', 'review', 'done']

export const CATEGORY_LABEL: Record<StatusId, string> = {
  backlog: 'Backlog',
  todo: 'A fazer',
  doing: 'Fazendo',
  review: 'Revisão',
  done: 'Feito',
}

/** Colunas efetivas do projeto (as padrão usam o WIP antigo do projeto) */
export function projectColumns(meta: Pick<ProjectMeta, 'columns' | 'wip'>): ColumnDef[] {
  if (meta.columns && meta.columns.length) return meta.columns
  return STATUSES.map((s) => ({ id: s.id, label: s.label, category: s.id, wip: meta.wip?.[s.id] ?? null }))
}

export const hasCustomColumns = (meta: Pick<ProjectMeta, 'columns'>) => !!meta.columns && meta.columns.length > 0

/** Coluna em que a tarefa aparece no quadro */
export function columnOf(task: Pick<Task, 'columnKey' | 'status'>, cols: ColumnDef[]): ColumnDef {
  if (task.columnKey) {
    const c = cols.find((x) => x.id === task.columnKey)
    if (c && c.category === task.status) return c
  }
  const same = cols.find((x) => x.category === task.status)
  if (same) return same
  // projeto sem coluna para essa etapa: usa a etapa mais próxima
  const i = ORDER.indexOf(task.status)
  return [...cols].sort((a, b) => Math.abs(ORDER.indexOf(a.category) - i) - Math.abs(ORDER.indexOf(b.category) - i))[0]
}

/** Valores a gravar ao soltar um cartão numa coluna */
export function moveTarget(col: ColumnDef, meta: Pick<ProjectMeta, 'columns'>): { status: StatusId; columnKey: string | null } {
  return { status: col.category, columnKey: hasCustomColumns(meta) ? col.id : null }
}

/** Identificador estável a partir do nome da coluna */
export function slugColumn(label: string, taken: string[]): string {
  const base =
    label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'coluna'
  let id = base
  let n = 2
  while (taken.includes(id)) id = `${base}-${n++}`
  return id
}

/** Mesmas regras do banco, para avisar antes de salvar */
export function validateColumns(cols: ColumnDef[]): string | null {
  if (cols.length < 2 || cols.length > 12) return 'O quadro precisa ter de 2 a 12 colunas.'
  if (cols.some((c) => !c.label.trim() || c.label.trim().length > 40)) return 'Cada coluna precisa de um nome com até 40 caracteres.'
  if (new Set(cols.map((c) => c.id)).size !== cols.length) return 'Há duas colunas com o mesmo identificador.'
  if (cols.some((c) => c.wip !== null && (c.wip < 1 || c.wip > 99))) return 'O limite de cartões (WIP) precisa ficar entre 1 e 99.'
  if (!cols.some((c) => c.category === 'done')) return 'O quadro precisa de pelo menos uma coluna da etapa Feito.'
  if (!cols.some((c) => c.category !== 'done')) return 'O quadro precisa de pelo menos uma coluna antes de Feito.'
  return null
}
