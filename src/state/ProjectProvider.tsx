'use client'

// Estado de um projeto aberto: carrega do banco, acompanha mudanças em tempo
// real (de outros integrantes) e expõe as ações permitidas ao papel do usuário.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { friendlyError, type Repo, type Session } from '../data/repo'
import { applyFilter } from '../lib/filters'
import type { ColumnDef, Epic, FilterQuery, Label, Role, Snapshot, Sprint, SprintReport, StatusId, Task, TaskDraft } from '../types'
import { useAuth } from './AuthProvider'

export interface ProjectApi {
  projectId: string
  snap: Snapshot | null
  error: string | null
  role: Role | null
  isOwner: boolean
  canEdit: boolean
  readOnly: boolean
  isAdminView: boolean
  me: string | null
  canAssign: (userId: string) => boolean
  toast: string | null
  setToast: (t: string | null) => void
  run: <T>(fn: () => Promise<T>, success?: string) => Promise<T | undefined>
  refresh: () => Promise<void>
  /** newChecklist: itens de checklist digitados antes de criar a tarefa */
  saveTask: (id: number | null, draft: TaskDraft, newChecklist?: string[]) => Promise<boolean>
  /** columnKey: coluna personalizada de destino (null nas colunas padrão) */
  moveTask: (id: number, status: StatusId, position: number, columnKey?: string | null) => void
  deleteTask: (id: number) => Promise<void>
  toggleAssignee: (taskId: number, userId: string, on: boolean) => Promise<void>
  updateProject: (patch: { name?: string; wip?: Snapshot['meta']['wip']; selfAssign?: boolean; columns?: ColumnDef[] | null }) => Promise<boolean>
  addSprint: (s: Omit<Sprint, 'id' | 'closedAt' | 'report'>) => Promise<void>
  updateSprint: (s: Sprint) => Promise<void>
  deleteSprint: (id: number) => Promise<void>
  closeSprint: (id: number, nextId: number | null) => Promise<SprintReport | undefined>
  reopenSprint: (id: number) => Promise<void>
  // checklist, épicos e rótulos
  addChecklistItem: (taskId: number, title: string) => Promise<void>
  updateChecklistItem: (id: number, patch: { title?: string; done?: boolean; position?: number }) => Promise<void>
  deleteChecklistItem: (id: number) => Promise<void>
  addEpic: (e: Omit<Epic, 'id'>) => Promise<void>
  updateEpic: (e: Epic) => Promise<void>
  deleteEpic: (id: number) => Promise<void>
  addLabel: (l: Omit<Label, 'id'>) => Promise<boolean>
  updateLabel: (l: Label) => Promise<void>
  deleteLabel: (id: number) => Promise<void>
  // filtros (valem para o quadro e o cronograma)
  /** comentários, atividade e filtros salvos (indisponíveis no modo arquivo) */
  serverFeatures: boolean
  repo: Repo | null
  filter: FilterQuery
  setFilter: (q: FilterQuery) => void
  visibleTasks: Task[]
  saveFilter: (name: string, shared: boolean) => Promise<void>
  deleteFilter: (id: number) => Promise<void>
  editing: { id: number | null; status?: StatusId; columnKey?: string | null } | null
  openTask: (id: number) => void
  newTask: (status?: StatusId, columnKey?: string | null) => void
  closeTask: () => void
}

const Ctx = createContext<ProjectApi | null>(null)

export function ProjectProvider({
  projectId, children, repoOverride, sessionOverride, roleOverride,
}: {
  projectId: string
  children: React.ReactNode
  /** Modo arquivo: usa outra fonte de dados no lugar do Supabase */
  repoOverride?: Repo
  sessionOverride?: Session
  roleOverride?: Role
}) {
  const auth = useAuth()
  const repo = repoOverride ?? auth.repo
  const session = sessionOverride ?? auth.session
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [editing, setEditing] = useState<ProjectApi['editing']>(null)
  const [filter, setFilterState] = useState<FilterQuery>({})
  // filtro escolhido fica guardado por projeto neste navegador
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`trilha.filtro.${projectId}`)
      setFilterState(raw ? (JSON.parse(raw) as FilterQuery) : {})
    } catch {
      setFilterState({})
    }
  }, [projectId])
  const setFilter = useCallback(
    (q: FilterQuery) => {
      setFilterState(q)
      try {
        localStorage.setItem(`trilha.filtro.${projectId}`, JSON.stringify(q))
      } catch {
        /* sem armazenamento */
      }
    },
    [projectId],
  )
  const timer = useRef<number | undefined>(undefined)

  const refresh = useCallback(async () => {
    if (!repo || !projectId) return
    try {
      setSnap(await repo.loadProject(projectId))
      setError(null)
    } catch (e) {
      setError(friendlyError(e))
    }
  }, [repo, projectId])

  useEffect(() => {
    setSnap(null)
    void refresh()
    if (!repo || !projectId) return
    const off = repo.subscribeProject(projectId, () => {
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void refresh(), 300)
    })
    return () => {
      off()
      window.clearTimeout(timer.current)
    }
  }, [repo, projectId, refresh])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4500)
    return () => clearTimeout(t)
  }, [toast])

  const me = session?.user.id ?? null
  const role = roleOverride ?? snap?.members.find((m) => m.id === me)?.role ?? null
  const isOwner = role === 'owner'
  const canEdit = role === 'owner' || role === 'editor'
  const isAdminView = !role && !!session?.isAdmin

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
      try {
        const r = await fn()
        if (success) setToast(success)
        return r
      } catch (e) {
        setToast(friendlyError(e))
        await refresh()
        return undefined
      }
    },
    [refresh],
  )

  // estável entre renderizações (usado em efeitos, ex.: abrir tarefa pelo link)
  const openTask = useCallback((id: number) => setEditing({ id }), [])
  const canAssign = (userId: string) => isOwner || (canEdit && !!snap?.meta.selfAssign && userId === me)

  const api: ProjectApi = {
    projectId,
    snap,
    error,
    role,
    isOwner,
    canEdit,
    readOnly: !canEdit,
    isAdminView,
    me,
    canAssign,
    toast,
    setToast,
    run,
    refresh,

    async saveTask(id, d, newChecklist = []) {
      if (!repo || !snap) return false
      const ok = await run(async () => {
        if (id === null) {
          const nid = await repo.createTask(projectId, d)
          for (const title of newChecklist.filter((x) => x.trim())) await repo.addChecklistItem(projectId, nid, title)
          return true
        }
        const cur = snap.tasks.find((t) => t.id === id)
        const { assignees, dependsOn, labels, ...fields } = d
        // a coluna só é enviada quando mudou (senão o banco recalcularia a etapa à toa)
        if (cur && fields.columnKey === cur.columnKey && fields.status === cur.status) delete (fields as Partial<TaskDraft>).columnKey
        await repo.updateTask(projectId, id, fields)
        if (cur && [...cur.dependsOn].sort().join() !== [...dependsOn].sort().join()) {
          await repo.setDependencies(projectId, id, dependsOn)
        }
        if (cur && [...cur.labels].sort().join() !== [...labels].sort().join()) {
          await repo.setLabels(projectId, id, labels)
        }
        if (cur) {
          for (const u of assignees.filter((x) => !cur.assignees.includes(x))) await repo.setAssignee(projectId, id, u, true)
          for (const u of cur.assignees.filter((x) => !assignees.includes(x))) await repo.setAssignee(projectId, id, u, false)
        }
        return true
      }, id === null ? 'Tarefa criada' : 'Tarefa salva')
      await refresh()
      return !!ok
    },

    moveTask(id, status, position, columnKey = null) {
      if (!repo || !snap) return
      // atualização otimista: o cartão muda na hora, o banco confirma depois
      setSnap({ ...snap, tasks: snap.tasks.map((t) => (t.id === id ? { ...t, status, position, columnKey } : t)) })
      void run(() => repo.moveTask(projectId, id, status, position, columnKey)).then(() => refresh())
    },

    async deleteTask(id) {
      if (!repo) return
      await run(() => repo.deleteTask(projectId, id), 'Tarefa excluída')
      await refresh()
    },

    async toggleAssignee(taskId, userId, on) {
      if (!repo) return
      await run(() => repo.setAssignee(projectId, taskId, userId, on))
      await refresh()
    },

    async updateProject(patch) {
      if (!repo) return false
      const ok = await run(() => repo.updateProject(projectId, patch).then(() => true))
      await refresh()
      return !!ok
    },
    async addSprint(s) {
      if (!repo) return
      await run(() => repo.addSprint(projectId, s))
      await refresh()
    },
    async updateSprint(s) {
      if (!repo) return
      await run(() => repo.updateSprint(projectId, s))
      await refresh()
    },
    async deleteSprint(id) {
      if (!repo) return
      await run(() => repo.deleteSprint(projectId, id))
      await refresh()
    },
    async closeSprint(id, nextId) {
      if (!repo) return undefined
      const rep = await run(() => repo.closeSprint(projectId, id, nextId), 'Sprint encerrado')
      await refresh()
      return rep
    },
    async reopenSprint(id) {
      if (!repo) return
      await run(() => repo.reopenSprint(projectId, id), 'Sprint reaberto')
      await refresh()
    },
    async addChecklistItem(taskId, title) {
      if (!repo || !title.trim()) return
      await run(() => repo.addChecklistItem(projectId, taskId, title))
      await refresh()
    },
    async updateChecklistItem(id, patch) {
      if (!repo || !snap) return
      // otimista: marcar o item responde na hora
      setSnap({ ...snap, tasks: snap.tasks.map((t) => ({ ...t, checklist: t.checklist.map((c) => (c.id === id ? { ...c, ...patch } : c)) })) })
      await run(() => repo.updateChecklistItem(projectId, id, patch))
      await refresh()
    },
    async deleteChecklistItem(id) {
      if (!repo) return
      await run(() => repo.deleteChecklistItem(projectId, id))
      await refresh()
    },
    async addEpic(e) {
      if (!repo) return
      await run(() => repo.addEpic(projectId, e), 'Épico criado')
      await refresh()
    },
    async updateEpic(e) {
      if (!repo) return
      await run(() => repo.updateEpic(projectId, e))
      await refresh()
    },
    async deleteEpic(id) {
      if (!repo) return
      await run(() => repo.deleteEpic(projectId, id), 'Épico excluído. As tarefas continuam no projeto, sem épico.')
      await refresh()
    },
    async addLabel(l) {
      if (!repo) return false
      const ok = await run(() => repo.addLabel(projectId, l).then(() => true))
      await refresh()
      return !!ok
    },
    async updateLabel(l) {
      if (!repo) return
      await run(() => repo.updateLabel(projectId, l))
      await refresh()
    },
    async deleteLabel(id) {
      if (!repo) return
      await run(() => repo.deleteLabel(projectId, id), 'Rótulo excluído')
      await refresh()
    },
    serverFeatures: repo?.supportsComments !== false,
    repo,
    filter,
    setFilter,
    visibleTasks: snap ? applyFilter(snap.tasks, filter, { me, sprints: snap.sprints }) : [],
    async saveFilter(name, shared) {
      if (!repo) return
      await run(() => repo.addFilter(projectId, name, filter, shared), 'Filtro salvo')
      await refresh()
    },
    async deleteFilter(id) {
      if (!repo) return
      await run(() => repo.deleteFilter(projectId, id), 'Filtro excluído')
      await refresh()
    },

    editing,
    openTask,
    newTask: (status = 'todo', columnKey = null) => setEditing({ id: null, status, columnKey }),
    closeTask: () => setEditing(null),
  }

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useProject() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useProject precisa estar dentro de <ProjectProvider>')
  return v
}
