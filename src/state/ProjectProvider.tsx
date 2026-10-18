'use client'

// Estado de um projeto aberto: carrega do banco, acompanha mudanças em tempo
// real (de outros integrantes) e expõe as ações permitidas ao papel do usuário.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { friendlyError, type Repo, type Session } from '../data/repo'
import type { Role, Snapshot, Sprint, StatusId, TaskDraft } from '../types'
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
  saveTask: (id: number | null, draft: TaskDraft) => Promise<boolean>
  moveTask: (id: number, status: StatusId, position: number) => void
  deleteTask: (id: number) => Promise<void>
  toggleAssignee: (taskId: number, userId: string, on: boolean) => Promise<void>
  updateProject: (patch: { name?: string; wip?: Snapshot['meta']['wip']; selfAssign?: boolean }) => Promise<void>
  addSprint: (s: Omit<Sprint, 'id'>) => Promise<void>
  updateSprint: (s: Sprint) => Promise<void>
  deleteSprint: (id: number) => Promise<void>
  editing: { id: number | null; status?: StatusId } | null
  openTask: (id: number) => void
  newTask: (status?: StatusId) => void
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

    async saveTask(id, d) {
      if (!repo || !snap) return false
      const ok = await run(async () => {
        if (id === null) {
          await repo.createTask(projectId, d)
          return true
        }
        const cur = snap.tasks.find((t) => t.id === id)
        const { assignees, dependsOn, ...fields } = d
        await repo.updateTask(projectId, id, fields)
        if (cur && [...cur.dependsOn].sort().join() !== [...dependsOn].sort().join()) {
          await repo.setDependencies(projectId, id, dependsOn)
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

    moveTask(id, status, position) {
      if (!repo || !snap) return
      // atualização otimista: o cartão muda na hora, o banco confirma depois
      setSnap({ ...snap, tasks: snap.tasks.map((t) => (t.id === id ? { ...t, status, position } : t)) })
      void run(() => repo.moveTask(projectId, id, status, position)).then(() => refresh())
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
      if (!repo) return
      await run(() => repo.updateProject(projectId, patch))
      await refresh()
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

    editing,
    openTask: (id) => setEditing({ id }),
    newTask: (status = 'todo') => setEditing({ id: null, status }),
    closeTask: () => setEditing(null),
  }

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useProject() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useProject precisa estar dentro de <ProjectProvider>')
  return v
}
