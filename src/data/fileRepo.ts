// Modo arquivo: um único projeto em memória, vindo de um .trilha.json do Google Drive.
// Sem Supabase: as alterações ficam aqui até o aluno salvar de volta no Drive.

import type { Repo } from './repo'
import type { Snapshot, StatusId, Task } from '../types'

export const FILE_USER_ID = 'arquivo-local'

export interface FileRepo extends Repo {
  current(): Snapshot
  dirty(): boolean
  markSaved(): void
}

export function createFileRepo(initial: Snapshot, onDirty: (dirty: boolean) => void): FileRepo {
  let snap: Snapshot = structuredClone(initial)
  let isDirty = false
  let seq = Math.max(0, ...snap.tasks.map((t) => t.id), ...snap.sprints.map((s) => s.id), ...snap.history.map((h) => h.id)) + 1
  const listeners = new Set<() => void>()

  const touch = () => {
    if (!isDirty) {
      isDirty = true
      onDirty(true)
    }
    listeners.forEach((f) => f())
  }
  const task = (id: number) => {
    const t = snap.tasks.find((x) => x.id === id)
    if (!t) throw new Error('Tarefa não encontrada')
    return t
  }
  const log = (taskId: number, from: StatusId | null, to: StatusId) =>
    snap.history.push({ id: seq++, taskId, from, to, at: new Date().toISOString(), changedBy: null })
  const unsupported = () => {
    throw new Error('Indisponível no modo arquivo')
  }

  return {
    mode: 'demo',
    current: () => snap,
    dirty: () => isDirty,
    markSaved() {
      isDirty = false
      onDirty(false)
    },

    // conta e servidor: não se aplicam ao arquivo
    getSession: async () => null,
    onAuthChange: () => () => undefined,
    signIn: unsupported,
    signUp: unsupported,
    signOut: async () => undefined,
    resetPassword: unsupported,
    updateProfile: unsupported,
    listProjects: async () => [],
    createProject: unsupported,
    myInvites: async () => [],
    acceptInvite: unsupported,
    declineInvite: unsupported,
    deleteProject: unsupported,
    invite: unsupported,
    cancelInvite: unsupported,
    changeRole: unsupported,
    removeMember: unsupported,
    inbox: async () => [],
    thread: async () => [],
    sendMessage: unsupported,
    markRead: async () => undefined,
    subscribeMessages: () => () => undefined,
    adminProjects: async () => [],
    adminUsers: async () => [],
    adminSetExpiry: unsupported,
    adminSetDriveExport: unsupported,
    adminGetDefaults: unsupported,
    adminSetDefaults: unsupported,

    // projeto
    async loadProject() {
      return structuredClone(snap)
    },
    subscribeProject(_id, onChange) {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    async updateProject(_id, patch) {
      if (patch.name !== undefined) snap.meta.name = patch.name
      if (patch.wip !== undefined) snap.meta.wip = patch.wip
      if (patch.selfAssign !== undefined) snap.meta.selfAssign = patch.selfAssign
      touch()
    },
    async createTask(_p, d) {
      const id = seq++
      const t: Task = {
        ...d, id, createdAt: new Date().toISOString(), createdBy: null,
        position: Math.max(0, ...snap.tasks.filter((x) => x.status === d.status).map((x) => x.position)) + 1,
      }
      snap.tasks.push(t)
      log(id, null, d.status)
      touch()
      return id
    },
    async updateTask(_p, id, patch) {
      const t = task(id)
      const { assignees: _a, dependsOn: _d, ...rest } = patch as Partial<Task>
      void _a
      void _d
      if (rest.status && rest.status !== t.status) log(id, t.status, rest.status)
      Object.assign(t, rest)
      touch()
    },
    async moveTask(p, id, status, position) {
      return this.updateTask(p, id, { status, position })
    },
    async deleteTask(_p, id) {
      snap.tasks = snap.tasks.filter((t) => t.id !== id)
      snap.tasks.forEach((t) => (t.dependsOn = t.dependsOn.filter((x) => x !== id)))
      snap.history = snap.history.filter((h) => h.taskId !== id)
      touch()
    },
    async setAssignee(_p, taskId, userId, on) {
      const t = task(taskId)
      t.assignees = on ? [...new Set([...t.assignees, userId])] : t.assignees.filter((x) => x !== userId)
      touch()
    },
    async setDependencies(_p, taskId, deps) {
      task(taskId).dependsOn = [...deps]
      touch()
    },
    async addSprint(_p, s) {
      snap.sprints.push({ ...s, id: seq++ })
      snap.sprints.sort((a, b) => a.start.localeCompare(b.start))
      touch()
    },
    async updateSprint(_p, s) {
      Object.assign(snap.sprints.find((x) => x.id === s.id)!, s)
      touch()
    },
    async deleteSprint(_p, id) {
      snap.sprints = snap.sprints.filter((s) => s.id !== id)
      snap.tasks.forEach((t) => {
        if (t.sprintId === id) t.sprintId = null
      })
      touch()
    },
  }
}
