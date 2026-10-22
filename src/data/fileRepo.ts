// Modo arquivo: um único projeto em memória, vindo de um .trilha.json do Google Drive.
// Sem Supabase: as alterações ficam aqui até o aluno salvar de volta no Drive.

import { projectColumns, validateColumns } from '../lib/columns'
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
  let seq =
    Math.max(
      0,
      ...snap.tasks.map((t) => t.id),
      ...snap.tasks.flatMap((t) => t.checklist.map((c) => c.id)),
      ...snap.sprints.map((s) => s.id),
      ...snap.history.map((h) => h.id),
      ...snap.epics.map((e) => e.id),
      ...snap.labels.map((l) => l.id),
    ) + 1
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
  const applyColumn = (t: Task, key: string) => {
    const col = projectColumns(snap.meta).find((c) => c.id === key)
    if (!col) {
      t.columnKey = null
      return
    }
    t.columnKey = snap.meta.columns ? key : null
    t.status = col.category
  }
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
    teamInbox: async () => [],
    teamThread: async () => [],
    sendTeamMessage: unsupported,
    markTeamRead: async () => undefined,
    adminProjects: async () => [],
    adminUsers: async () => [],
    adminSetExpiry: unsupported,
    adminSetDriveExport: unsupported,
    adminSetMaxMembers: unsupported,
    supportsComments: false,
    listComments: async () => [],
    addComment: unsupported,
    deleteComment: unsupported,
    listActivity: async () => [],
    addFilter: unsupported,
    updateFilter: unsupported,
    deleteFilter: unsupported,
    notifications: async () => [],
    markNotificationsRead: async () => undefined,
    canSignUp: async () => ({ allowed: true, domains: [] }),
    adminAccess: unsupported,
    adminAddDomain: unsupported,
    adminUpdateDomain: unsupported,
    adminRemoveDomain: unsupported,
    adminAddEmail: unsupported,
    adminRemoveEmail: unsupported,
    adminAddAdmin: unsupported,
    adminRemoveAdmin: unsupported,
    adminSetBlocked: unsupported,
    adminDeleteUser: unsupported,
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
      if (patch.columns !== undefined) {
        const err = patch.columns ? validateColumns(patch.columns) : null
        if (err) throw new Error(err)
        snap.meta.columns = patch.columns
        const keys = (patch.columns ?? []).map((c) => c.id)
        snap.tasks.forEach((t) => { if (t.columnKey && !keys.includes(t.columnKey)) t.columnKey = null })
      }
      touch()
    },
    async createTask(_p, d) {
      const id = seq++
      const t: Task = {
        ...d, id, createdAt: new Date().toISOString(), createdBy: null, checklist: [],
        labels: [...(d.labels ?? [])], kind: d.kind ?? 'tarefa', epicId: d.epicId ?? null, columnKey: null,
        position: Math.max(0, ...snap.tasks.filter((x) => x.status === d.status).map((x) => x.position)) + 1,
      }
      snap.tasks.push(t)
      if (d.columnKey) applyColumn(t, d.columnKey)
      log(id, null, t.status)
      touch()
      return id
    },
    async updateTask(_p, id, patch) {
      const t = task(id)
      const { assignees: _a, dependsOn: _d, labels: _l, checklist: _c, ...rest } = patch as Partial<Task>
      void _a
      void _d
      void _l
      void _c
      const before = t.status
      if (rest.columnKey !== undefined) {
        const key = rest.columnKey
        delete rest.columnKey
        Object.assign(t, rest)
        if (key) applyColumn(t, key)
        else t.columnKey = null
      } else {
        if (rest.status && rest.status !== t.status) t.columnKey = null
        Object.assign(t, rest)
      }
      if (t.status !== before) log(id, before, t.status)
      touch()
    },
    async moveTask(p, id, status, position, columnKey = null) {
      return this.updateTask(p, id, columnKey ? { position, columnKey } : { status, position, columnKey: null })
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
    async setLabels(_p, taskId, labelIds) {
      task(taskId).labels = [...labelIds]
      touch()
    },
    async addChecklistItem(_p, taskId, title) {
      task(taskId).checklist.push({ id: seq++, title: title.trim(), done: false, position: Date.now() / 1e6, doneBy: null, doneAt: null })
      touch()
    },
    async updateChecklistItem(_p, id, patch) {
      const t = snap.tasks.find((x) => x.checklist.some((c) => c.id === id))
      const it = t?.checklist.find((c) => c.id === id)
      if (!it) throw new Error('Item não encontrado')
      if (patch.done !== undefined && patch.done !== it.done) it.doneAt = patch.done ? new Date().toISOString() : null
      Object.assign(it, patch)
      touch()
    },
    async deleteChecklistItem(_p, id) {
      snap.tasks.forEach((t) => { t.checklist = t.checklist.filter((c) => c.id !== id) })
      touch()
    },
    async addEpic(_p, e) {
      snap.epics.push({ ...e, name: e.name.trim(), id: seq++ })
      touch()
    },
    async updateEpic(_p, e) {
      Object.assign(snap.epics.find((x) => x.id === e.id)!, e)
      touch()
    },
    async deleteEpic(_p, id) {
      snap.epics = snap.epics.filter((x) => x.id !== id)
      snap.tasks.forEach((t) => { if (t.epicId === id) t.epicId = null })
      touch()
    },
    async addLabel(_p, l) {
      if (snap.labels.some((x) => x.name.trim().toLowerCase() === l.name.trim().toLowerCase())) throw new Error('Já existe um rótulo com esse nome.')
      snap.labels.push({ ...l, name: l.name.trim(), id: seq++ })
      touch()
    },
    async updateLabel(_p, l) {
      if (snap.labels.some((x) => x.id !== l.id && x.name.trim().toLowerCase() === l.name.trim().toLowerCase())) throw new Error('Já existe um rótulo com esse nome.')
      Object.assign(snap.labels.find((x) => x.id === l.id)!, { name: l.name.trim(), color: l.color })
      touch()
    },
    async deleteLabel(_p, id) {
      snap.labels = snap.labels.filter((x) => x.id !== id)
      snap.tasks.forEach((t) => { t.labels = t.labels.filter((x) => x !== id) })
      touch()
    },
    async closeSprint(_p, id, nextId) {
      const sp = snap.sprints.find((x) => x.id === id)
      if (!sp) throw new Error('Sprint não encontrado')
      if (sp.closedAt) throw new Error('Este sprint já foi encerrado')
      const ts = snap.tasks.filter((t) => t.sprintId === id)
      const report = {
        committedPoints: ts.filter((t) => !t.milestone).reduce((a, t) => a + t.points, 0),
        completedPoints: ts.filter((t) => !t.milestone && t.status === 'done').reduce((a, t) => a + t.points, 0),
        committedTasks: ts.length,
        completedTasks: ts.filter((t) => t.status === 'done').length,
        completed: ts.filter((t) => t.status === 'done').map((t) => t.id),
        carried: ts.filter((t) => t.status !== 'done').map((t) => t.id),
        bugsOpen: ts.filter((t) => t.kind === 'bug' && t.status !== 'done').length,
        nextSprint: nextId,
      }
      ts.filter((t) => t.status !== 'done').forEach((t) => { t.sprintId = nextId })
      sp.closedAt = new Date().toISOString()
      sp.report = report
      touch()
      return report
    },
    async reopenSprint(_p, id) {
      snap.sprints.find((x) => x.id === id)!.closedAt = null
      touch()
    },
    async addSprint(_p, s) {
      snap.sprints.push({ ...s, goal: s.goal ?? '', closedAt: null, report: null, id: seq++ })
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
