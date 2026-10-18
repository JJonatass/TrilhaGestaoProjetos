// Modo demonstração: tudo no navegador, com pessoas e projeto fictícios.
// Imita as regras do banco (papéis, responsáveis, mensagens) para que as
// telas possam ser usadas em aula sem criar contas.

import { addDays, today } from '../lib/dates'
import type {
  AdminProject, AdminUser, InboxThread, Member, Message, PendingInvite, Phase, Priority,
  Profile, ProjectMeta, Role, Snapshot, Sprint, StatusChange, StatusId, Task,
} from '../types'
import type { Repo, Session } from './repo'

interface Invite { id: string; projectId: string; email: string; role: Role; invitedBy: string; createdAt: string }
interface Db {
  users: (Profile & { createdAt: string; lastSignInAt: string | null })[]
  admins: string[]
  projects: ProjectMeta[]
  members: { projectId: string; userId: string; role: Role; joinedAt: string }[]
  invites: Invite[]
  tasks: (Omit<Task, 'assignees' | 'dependsOn'> & { projectId: string })[]
  assignees: { projectId: string; taskId: number; userId: string }[]
  deps: { projectId: string; taskId: number; dependsOn: number }[]
  sprints: (Sprint & { projectId: string })[]
  history: (StatusChange & { projectId: string })[]
  messages: Message[]
  seq: number
  sessionUserId: string | null
  defaults: { expiresAt: string | null; driveExport: boolean }
}

const KEY = 'trilha.demo.v2'
const U = { jonatas: 'u-jonatas', ana: 'u-ana', bruno: 'u-bruno', carla: 'u-carla', diego: 'u-diego', elisa: 'u-elisa' }

type SeedRow = [string, string, Phase, number, Priority, number | null, number, number[], number | null, boolean, [StatusId, number][], string[]]
const SAMPLE: SeedRow[] = [
  ['Matriz CSD e entrevistas com alunos', 'Levantar certezas, suposições e dúvidas sobre a procura por monitoria.', 'Ideação', 3, 'alta', 0, 3, [], 0, false, [['todo', 0], ['doing', 0], ['done', 3]], ['ana', 'carla']],
  ['Personas e mapa de empatia', 'Duas personas: aluno com dificuldade e monitor voluntário.', 'Ideação', 2, 'media', 2, 3, [0], 0, false, [['todo', 0], ['doing', 2], ['review', 4], ['done', 5]], ['carla']],
  ['Lean Canvas', 'Problema, segmentos, proposta de valor e métricas-chave.', 'Definição', 2, 'alta', 4, 2, [1], 0, false, [['todo', 0], ['doing', 4], ['done', 6]], ['bruno']],
  ['Problema validado', 'Marco: hipótese principal confirmada com 12 entrevistas.', 'Definição', 0, 'alta', 6, 0, [2], 0, true, [['todo', 0], ['done', 6]], []],
  ['User Story Mapping e backlog', 'Mapa do fluxo do aluno e corte do MVP.', 'Planejamento', 3, 'alta', 7, 3, [3], 0, false, [['todo', 1], ['doing', 7], ['done', 10]], ['ana']],
  ['Wireframes das telas', 'Agenda, reserva, perfil do monitor e notificações.', 'Design', 5, 'media', 9, 5, [4], 0, false, [['todo', 1], ['doing', 9], ['review', 13], ['done', 15]], ['carla']],
  ['Design system', 'Cores, tipografia, espaçamentos e componentes base.', 'Design', 3, 'media', 11, 4, [4], 0, false, [['todo', 1], ['doing', 12], ['done', 16]], ['carla', 'diego']],
  ['Protótipo navegável e teste de usabilidade', 'Teste com 5 alunos; ajustar fluxo de reserva.', 'Design', 5, 'alta', 15, 5, [5, 6], 1, false, [['todo', 14], ['doing', 16], ['review', 20], ['done', 22]], ['diego']],
  ['Repositório e integração contínua', 'Monorepo, lint, testes automáticos no GitHub Actions.', 'Desenvolvimento', 2, 'media', 10, 2, [4], 0, false, [['todo', 1], ['doing', 10], ['done', 12]], ['bruno']],
  ['Login com Google', 'Restringir ao domínio institucional.', 'Desenvolvimento', 5, 'alta', 14, 6, [8], 1, false, [['todo', 14], ['doing', 15], ['review', 22], ['done', 24]], ['bruno']],
  ['Agenda de monitorias', 'Listar horários livres e reservar vaga.', 'Desenvolvimento', 8, 'critica', 20, 9, [7, 9], 1, false, [['todo', 14], ['doing', 21]], ['diego', 'bruno']],
  ['Notificações de lembrete', 'Aviso 1 h antes da monitoria.', 'Desenvolvimento', 5, 'media', 22, 6, [9], 1, false, [['todo', 14], ['doing', 22], ['review', 26]], ['ana']],
  ['Painel do monitor', 'Ver reservas do dia e marcar presença.', 'Desenvolvimento', 5, 'media', 24, 5, [9], 1, false, [['todo', 14]], []],
  ['Termos de uso e LGPD', 'Texto revisado pela coordenação.', 'Planejamento', 2, 'alta', 18, 3, [], 1, false, [['todo', 14], ['doing', 19]], ['ana']],
  ['Testes E2E dos fluxos principais', 'Reserva, cancelamento e lembrete.', 'Testes', 5, 'alta', 30, 5, [10, 11], 2, false, [['todo', 20]], ['diego']],
  ['Correções do teste beta', 'Reservar capacidade para ajustes.', 'Testes', 3, 'media', 35, 4, [14], 2, false, [['backlog', 20]], ['carla']],
  ['Checklist de release e plano de rollback', '', 'Lançamento', 2, 'media', 38, 2, [14], 2, false, [['backlog', 20]], ['bruno']],
  ['Lançamento beta', 'Marco: turma piloto usando o app.', 'Lançamento', 0, 'critica', 40, 0, [15, 16], 2, true, [['backlog', 20]], []],
  ['Painel de métricas (OKRs e funil AARRR)', 'Sem datas definidas: o Gantt estima pela pontuação e dependências.', 'Operação', 3, 'baixa', null, 3, [17], 3, false, [['backlog', 22]], ['ana']],
  ['Plano de descontinuação da versão piloto', 'Comunicação, exportação de dados e arquivamento.', 'Fim do ciclo', 2, 'baixa', null, 2, [18], null, false, [['backlog', 25]], []],
]

const at = (day: string, minute = 0, hour = 9) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, hour, minute).toISOString()
}

function seedProject(db: Db, projectId: string, owner: string, peopleIds: Record<string, string>) {
  const t0 = addDays(today(), -27)
  const sprintIds = [0, 1, 2, 3].map((i) => {
    const id = ++db.seq
    db.sprints.push({ id, projectId, name: `Sprint ${i + 1}`, start: addDays(t0, i * 14), end: addDays(t0, i * 14 + 13) })
    return id
  })
  const ids: number[] = []
  SAMPLE.forEach(([title, description, phase, points, priority, start, dur, deps, sprint, milestone, hist, who], i) => {
    const id = ++db.seq
    ids.push(id)
    const last = hist[hist.length - 1][0]
    db.tasks.push({
      id, projectId, title, description, phase, points, priority, status: last,
      sprintId: sprint === null ? null : sprintIds[sprint],
      start: start === null ? null : addDays(t0, start),
      due: start === null ? null : addDays(t0, start + Math.max(0, dur - (milestone ? 0 : 1))),
      milestone, createdAt: at(addDays(t0, hist[0][1]), i), createdBy: owner, position: i,
    })
    let prev: StatusId | null = null
    hist.forEach(([to, day], k) => {
      db.history.push({ id: ++db.seq, projectId, taskId: id, from: prev, to, at: at(addDays(t0, day), i + k), changedBy: owner })
      prev = to
    })
    deps.forEach((d) => db.deps.push({ projectId, taskId: id, dependsOn: ids[d] }))
    const people = who.length ? who : []
    people.forEach((p) => peopleIds[p] && db.assignees.push({ projectId, taskId: id, userId: peopleIds[p] }))
  })
}

function initialDb(): Db {
  const now = new Date().toISOString()
  const db: Db = {
    users: [
      { id: U.jonatas, email: 'jonatas.junior@gmail.com', fullName: 'Jonatas (administrador)', createdAt: now, lastSignInAt: now },
      { id: U.ana, email: 'ana@exemplo.com', fullName: 'Ana Souza', createdAt: now, lastSignInAt: now },
      { id: U.bruno, email: 'bruno@exemplo.com', fullName: 'Bruno Lima', createdAt: now, lastSignInAt: now },
      { id: U.carla, email: 'carla@exemplo.com', fullName: 'Carla Mendes', createdAt: now, lastSignInAt: now },
      { id: U.diego, email: 'diego@exemplo.com', fullName: 'Diego Ramos', createdAt: now, lastSignInAt: null },
      { id: U.elisa, email: 'elisa@exemplo.com', fullName: 'Elisa Costa', createdAt: now, lastSignInAt: null },
    ],
    admins: ['jonatas.junior@gmail.com'],
    projects: [], members: [], invites: [], tasks: [], assignees: [], deps: [], sprints: [], history: [], messages: [],
    seq: 100, sessionUserId: null,
    defaults: { expiresAt: null, driveExport: false },
  }
  const p1 = 'p-monitorias'
  db.projects.push({ id: p1, name: 'App de Monitorias', ownerId: U.ana, wip: { doing: 3, review: 2 }, selfAssign: true, createdAt: at(addDays(today(), -28)), expiresAt: at(addDays(today(), 12), 59, 23), driveExportAllowed: true })
  const joined = at(addDays(today(), -27))
  db.members.push(
    { projectId: p1, userId: U.ana, role: 'owner', joinedAt: joined },
    { projectId: p1, userId: U.bruno, role: 'editor', joinedAt: joined },
    { projectId: p1, userId: U.carla, role: 'editor', joinedAt: joined },
    { projectId: p1, userId: U.diego, role: 'editor', joinedAt: joined },
    { projectId: p1, userId: U.elisa, role: 'viewer', joinedAt: joined },
  )
  seedProject(db, p1, U.ana, { ana: U.ana, bruno: U.bruno, carla: U.carla, diego: U.diego })

  const p2 = 'p-semana'
  db.projects.push({ id: p2, name: 'Site da Semana Acadêmica', ownerId: U.bruno, wip: { doing: 2 }, selfAssign: true, createdAt: at(addDays(today(), -6)), expiresAt: null, driveExportAllowed: false })
  db.members.push({ projectId: p2, userId: U.bruno, role: 'owner', joinedAt: at(addDays(today(), -6)) })
  const t = (title: string, status: StatusId, phase: Phase, d: number) => {
    const id = ++db.seq
    db.tasks.push({ id, projectId: p2, title, description: '', phase, points: 3, priority: 'media', status, sprintId: null, start: addDays(today(), d), due: addDays(today(), d + 3), milestone: false, createdAt: at(addDays(today(), -5)), createdBy: U.bruno, position: id })
    db.history.push({ id: ++db.seq, projectId: p2, taskId: id, from: null, to: status, at: at(addDays(today(), -5)), changedBy: U.bruno })
    db.assignees.push({ projectId: p2, taskId: id, userId: U.bruno })
  }
  t('Programação das palestras', 'doing', 'Planejamento', -2)
  t('Página de inscrição', 'todo', 'Desenvolvimento', 2)
  t('Identidade visual do evento', 'review', 'Design', -4)
  db.invites.push({ id: 'inv-1', projectId: p2, email: 'ana@exemplo.com', role: 'editor', invitedBy: U.bruno, createdAt: at(addDays(today(), -1)) })

  const agenda = db.tasks.find((x) => x.title === 'Agenda de monitorias')!
  const msg = (userId: string, senderId: string, body: string, ago: number, read: boolean, taskId: number | null = null) =>
    db.messages.push({
      id: ++db.seq, projectId: p1, userId, senderId, body, taskId,
      createdAt: new Date(Date.now() - ago * 60_000).toISOString(),
      readAt: read ? new Date(Date.now() - (ago - 5) * 60_000).toISOString() : null,
    })
  msg(U.diego, U.jonatas, 'Diego, a agenda está há uma semana em Fazendo. Precisa de ajuda para dividir em partes menores?', 600, true, agenda.id)
  msg(U.diego, U.diego, 'Preciso sim. A parte de horários livres está travando por causa do fuso.', 540, false)
  msg(U.ana, U.jonatas, 'Ana, ótimo trabalho no mapeamento. Lembre de registrar a validação do problema no relatório.', 120, false)
  return db
}

export function createDemoRepo(): Repo {
  let db: Db = load()
  const projectListeners = new Map<string, Set<() => void>>()
  const msgListeners = new Set<() => void>()
  const authListeners = new Set<(s: Session | null) => void>()

  function load(): Db {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) return JSON.parse(raw) as Db
    } catch {
      /* sem armazenamento */
    }
    return initialDb()
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(db))
    } catch {
      /* ignorado */
    }
  }
  const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 60))
  const changed = (projectId?: string) => {
    save()
    if (projectId) projectListeners.get(projectId)?.forEach((f) => f())
  }
  const me = () => db.users.find((u) => u.id === db.sessionUserId) ?? null
  const isAdmin = () => !!me() && db.admins.includes(me()!.email)
  const role = (p: string) => db.members.find((m) => m.projectId === p && m.userId === db.sessionUserId)?.role ?? null
  const canEdit = (p: string) => role(p) === 'owner' || role(p) === 'editor'
  const deny = () => { throw new Error('Você não tem permissão para fazer isso neste projeto.') }
  const session = (): Session | null => (me() ? { user: { id: me()!.id, email: me()!.email, fullName: me()!.fullName }, isAdmin: isAdmin() } : null)
  const emitAuth = () => authListeners.forEach((f) => f(session()))
  const projectOf = (taskId: number) => db.tasks.find((t) => t.id === taskId)?.projectId

  return {
    mode: 'demo',

    async getSession() { return delay(session()) },
    onAuthChange(cb) { authListeners.add(cb); return () => authListeners.delete(cb) },
    async signIn(email) {
      const u = db.users.find((x) => x.email === email.trim().toLowerCase())
      if (!u) throw new Error('No modo demonstração, use um dos perfis de exemplo.')
      db.sessionUserId = u.id
      u.lastSignInAt = new Date().toISOString()
      save(); emitAuth()
    },
    async signUp(email, _password, fullName) {
      const e = email.trim().toLowerCase()
      if (db.users.some((u) => u.email === e)) throw new Error('User already registered')
      const id = `u-${++db.seq}`
      db.users.push({ id, email: e, fullName, createdAt: new Date().toISOString(), lastSignInAt: new Date().toISOString() })
      db.sessionUserId = id
      save(); emitAuth()
      return { needsConfirmation: false }
    },
    async signOut() { db.sessionUserId = null; save(); emitAuth() },
    async resetPassword() { /* sem e-mail no modo demonstração */ },
    async updateProfile(fullName) { const u = me(); if (u) { u.fullName = fullName; save(); emitAuth() } },
    demoUsers() { return db.users.map(({ id, email, fullName }) => ({ id, email, fullName })) },
    async demoSwitch(userId) { db.sessionUserId = userId; save(); emitAuth() },

    async listProjects() {
      const uid = db.sessionUserId
      return delay(
        db.members.filter((m) => m.userId === uid).map((m) => {
          const p = db.projects.find((x) => x.id === m.projectId)!
          const tasks = db.tasks.filter((t) => t.projectId === p.id)
          const owner = db.users.find((u) => u.id === p.ownerId)
          return {
            id: p.id, name: p.name, role: m.role, ownerName: owner?.fullName ?? '',
            members: db.members.filter((x) => x.projectId === p.id).length,
            tasks: tasks.length, done: tasks.filter((t) => t.status === 'done').length, createdAt: p.createdAt,
            expiresAt: p.expiresAt,
          }
        }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      )
    },
    async createProject(name, withSample) {
      const id = `p-${++db.seq}`
      const uid = db.sessionUserId!
      db.projects.push({ id, name, ownerId: uid, wip: { doing: 3, review: 2 }, selfAssign: true, createdAt: new Date().toISOString(), expiresAt: db.defaults.expiresAt, driveExportAllowed: db.defaults.driveExport })
      db.members.push({ projectId: id, userId: uid, role: 'owner', joinedAt: new Date().toISOString() })
      if (withSample) seedProject(db, id, uid, { ana: uid, bruno: uid, carla: uid, diego: uid })
      changed()
      return id
    },
    async myInvites() {
      const u = me()
      return delay(
        db.invites.filter((i) => u && i.email === u.email).map((i): PendingInvite => ({
          id: i.id, projectId: i.projectId, projectName: db.projects.find((p) => p.id === i.projectId)?.name ?? '',
          role: i.role, invitedByName: db.users.find((x) => x.id === i.invitedBy)?.fullName ?? '', createdAt: i.createdAt,
        })),
      )
    },
    async acceptInvite(id) {
      const inv = db.invites.find((i) => i.id === id && i.email === me()?.email)
      if (!inv) throw new Error('Convite não encontrado para este e-mail')
      db.members.push({ projectId: inv.projectId, userId: db.sessionUserId!, role: inv.role, joinedAt: new Date().toISOString() })
      db.invites = db.invites.filter((i) => i.id !== id)
      changed(inv.projectId)
      return inv.projectId
    },
    async declineInvite(id) { db.invites = db.invites.filter((i) => i.id !== id); changed() },

    async loadProject(id) {
      const meta = db.projects.find((p) => p.id === id)
      if (!meta || (!role(id) && !isAdmin())) throw new Error('Projeto não encontrado ou sem acesso.')
      const snap: Snapshot = {
        meta: { ...meta },
        members: db.members.filter((m) => m.projectId === id).map((m): Member => {
          const u = db.users.find((x) => x.id === m.userId)!
          return { id: u.id, email: u.email, fullName: u.fullName, role: m.role, joinedAt: m.joinedAt }
        }),
        invites: role(id) === 'owner' || isAdmin() ? db.invites.filter((i) => i.projectId === id).map(({ id: iid, email, role: r, createdAt }) => ({ id: iid, email, role: r, createdAt })) : [],
        tasks: db.tasks.filter((t) => t.projectId === id).sort((a, b) => a.position - b.position || a.id - b.id).map((t) => {
          const { projectId: _p, ...rest } = t
          void _p
          return {
            ...rest,
            assignees: db.assignees.filter((a) => a.taskId === t.id).map((a) => a.userId),
            dependsOn: db.deps.filter((d) => d.taskId === t.id).map((d) => d.dependsOn),
          }
        }),
        sprints: db.sprints.filter((s) => s.projectId === id).map(({ id: sid, name, start, end }) => ({ id: sid, name, start, end })).sort((a, b) => a.start.localeCompare(b.start)),
        history: db.history.filter((h) => h.projectId === id).map(({ projectId: _p, ...h }) => { void _p; return h }).sort((a, b) => a.at.localeCompare(b.at)),
      }
      return delay(JSON.parse(JSON.stringify(snap)) as Snapshot)
    },
    subscribeProject(id, onChange) {
      const set = projectListeners.get(id) ?? new Set()
      set.add(onChange)
      projectListeners.set(id, set)
      return () => set.delete(onChange)
    },
    async updateProject(id, patch) {
      if (role(id) !== 'owner') deny()
      const p = db.projects.find((x) => x.id === id)!
      const { name, wip, selfAssign } = patch
      Object.assign(p, Object.fromEntries(Object.entries({ name, wip, selfAssign }).filter(([, v]) => v !== undefined)))
      changed(id)
    },
    async deleteProject(id) {
      if (role(id) !== 'owner') deny()
      db.projects = db.projects.filter((p) => p.id !== id)
      db.members = db.members.filter((m) => m.projectId !== id)
      db.tasks = db.tasks.filter((t) => t.projectId !== id)
      db.messages = db.messages.filter((m) => m.projectId !== id)
      changed(id)
    },

    async createTask(projectId, d) {
      if (!canEdit(projectId)) deny()
      const id = ++db.seq
      const createdAt = new Date().toISOString()
      db.tasks.push({
        id, projectId, title: d.title, description: d.description, priority: d.priority, points: d.points, status: d.status,
        phase: d.phase, sprintId: d.sprintId, start: d.start, due: d.due, milestone: d.milestone, createdAt,
        createdBy: db.sessionUserId, position: Date.now() / 1e6,
      })
      db.history.push({ id: ++db.seq, projectId, taskId: id, from: null, to: d.status, at: createdAt, changedBy: db.sessionUserId })
      d.dependsOn.forEach((x) => db.deps.push({ projectId, taskId: id, dependsOn: x }))
      for (const u of d.assignees) await this.setAssignee(projectId, id, u, true)
      changed(projectId)
      return id
    },
    async updateTask(projectId, id, patch) {
      if (!canEdit(projectId)) deny()
      const t = db.tasks.find((x) => x.id === id)!
      const { assignees: _a, dependsOn: _d, ...rest } = patch as Partial<Task>
      void _a; void _d
      if (rest.status && rest.status !== t.status) {
        db.history.push({ id: ++db.seq, projectId, taskId: id, from: t.status, to: rest.status, at: new Date().toISOString(), changedBy: db.sessionUserId })
      }
      Object.assign(t, rest)
      changed(projectId)
    },
    async moveTask(projectId, id, status, position) { return this.updateTask(projectId, id, { status, position }) },
    async deleteTask(projectId, id) {
      if (!canEdit(projectId)) deny()
      db.tasks = db.tasks.filter((t) => t.id !== id)
      db.assignees = db.assignees.filter((a) => a.taskId !== id)
      db.deps = db.deps.filter((d) => d.taskId !== id && d.dependsOn !== id)
      changed(projectId)
    },
    async setAssignee(projectId, taskId, userId, on) {
      const p = db.projects.find((x) => x.id === projectId)!
      const allowed = role(projectId) === 'owner' || (userId === db.sessionUserId && canEdit(projectId) && p.selfAssign)
      if (!allowed) deny()
      if (!db.members.some((m) => m.projectId === projectId && m.userId === userId)) throw new Error('O responsável precisa ser integrante do projeto')
      db.assignees = db.assignees.filter((a) => !(a.taskId === taskId && a.userId === userId))
      if (on) db.assignees.push({ projectId: projectOf(taskId) ?? projectId, taskId, userId })
      changed(projectId)
    },
    async setDependencies(projectId, taskId, deps) {
      if (!canEdit(projectId)) deny()
      db.deps = db.deps.filter((d) => d.taskId !== taskId)
      deps.forEach((x) => db.deps.push({ projectId, taskId, dependsOn: x }))
      changed(projectId)
    },
    async addSprint(projectId, s) { if (!canEdit(projectId)) deny(); db.sprints.push({ ...s, id: ++db.seq, projectId }); changed(projectId) },
    async updateSprint(projectId, s) { if (!canEdit(projectId)) deny(); Object.assign(db.sprints.find((x) => x.id === s.id)!, s); changed(projectId) },
    async deleteSprint(projectId, id) {
      if (!canEdit(projectId)) deny()
      db.sprints = db.sprints.filter((s) => s.id !== id)
      db.tasks.forEach((t) => { if (t.sprintId === id) t.sprintId = null })
      changed(projectId)
    },
    async invite(projectId, email, r) {
      if (role(projectId) !== 'owner') deny()
      const e = email.trim().toLowerCase()
      if (db.invites.some((i) => i.projectId === projectId && i.email === e)) throw new Error('duplicate key project_invites')
      db.invites.push({ id: `inv-${++db.seq}`, projectId, email: e, role: r, invitedBy: db.sessionUserId!, createdAt: new Date().toISOString() })
      changed(projectId)
    },
    async cancelInvite(projectId, inviteId) { db.invites = db.invites.filter((i) => i.id !== inviteId); changed(projectId) },
    async changeRole(projectId, userId, r) {
      if (role(projectId) !== 'owner') deny()
      const m = db.members.find((x) => x.projectId === projectId && x.userId === userId)!
      if (m.role === 'owner') deny()
      m.role = r
      changed(projectId)
    },
    async removeMember(projectId, userId) {
      const m = db.members.find((x) => x.projectId === projectId && x.userId === userId)
      if (!m || m.role === 'owner' || (role(projectId) !== 'owner' && userId !== db.sessionUserId)) deny()
      db.members = db.members.filter((x) => x !== m)
      db.assignees = db.assignees.filter((a) => !(a.projectId === projectId && a.userId === userId))
      changed(projectId)
    },

    async inbox() {
      const uid = db.sessionUserId
      const admin = isAdmin()
      const keys = new Map<string, Message[]>()
      for (const m of db.messages) {
        if (!admin && m.userId !== uid) continue
        const k = `${m.projectId}|${m.userId}`
        keys.set(k, [...(keys.get(k) ?? []), m])
      }
      const out: InboxThread[] = []
      for (const list of keys.values()) {
        list.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        const last = list[list.length - 1]
        const u = db.users.find((x) => x.id === last.userId)!
        const iAmMember = uid === last.userId
        out.push({
          projectId: last.projectId, projectName: db.projects.find((p) => p.id === last.projectId)?.name ?? '',
          userId: last.userId, userName: u.fullName || u.email, userEmail: u.email,
          lastBody: last.body, lastAt: last.createdAt, lastSender: last.senderId,
          unread: list.filter((m) => !m.readAt && (iAmMember ? m.senderId !== uid : m.senderId === m.userId)).length,
          unreadOther: list.filter((m) => !m.readAt && (iAmMember ? m.senderId === uid : m.senderId !== m.userId)).length,
        })
      }
      return delay(out.sort((a, b) => b.lastAt.localeCompare(a.lastAt)))
    },
    async thread(projectId, userId) {
      if (!isAdmin() && userId !== db.sessionUserId) return []
      return delay(db.messages.filter((m) => m.projectId === projectId && m.userId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((m) => ({ ...m })))
    },
    async sendMessage(projectId, userId, body, taskId) {
      const member = db.members.some((m) => m.projectId === projectId && m.userId === userId)
      if (!member || !(isAdmin() || userId === db.sessionUserId)) deny()
      db.messages.push({ id: ++db.seq, projectId, userId, senderId: db.sessionUserId!, taskId, body, createdAt: new Date().toISOString(), readAt: null })
      save(); msgListeners.forEach((f) => f())
    },
    async markRead(projectId, userId) {
      const uid = db.sessionUserId
      let n = 0
      for (const m of db.messages) {
        if (m.projectId !== projectId || m.userId !== userId || m.readAt) continue
        const mine = uid === userId ? m.senderId !== uid : isAdmin() && m.senderId === userId
        if (mine) { m.readAt = new Date().toISOString(); n++ }
      }
      if (n) { save(); msgListeners.forEach((f) => f()) }
    },
    subscribeMessages(onChange) { msgListeners.add(onChange); return () => msgListeners.delete(onChange) },

    async adminProjects() {
      if (!isAdmin()) throw new Error('Acesso restrito ao administrador')
      const td = today()
      return delay(db.projects.map((p): AdminProject => {
        const tasks = db.tasks.filter((t) => t.projectId === p.id)
        const owner = db.users.find((u) => u.id === p.ownerId)!
        const hist = db.history.filter((h) => h.projectId === p.id).map((h) => h.at).sort()
        return {
          id: p.id, name: p.name, ownerName: owner.fullName, ownerEmail: owner.email, createdAt: p.createdAt,
          members: db.members.filter((m) => m.projectId === p.id).length, tasks: tasks.length,
          done: tasks.filter((t) => t.status === 'done').length,
          late: tasks.filter((t) => t.status !== 'done' && t.due && t.due < td).length,
          pointsTotal: tasks.filter((t) => !t.milestone).reduce((s, t) => s + t.points, 0),
          pointsDone: tasks.filter((t) => !t.milestone && t.status === 'done').reduce((s, t) => s + t.points, 0),
          lastActivity: hist[hist.length - 1] ?? p.createdAt,
          unread: db.messages.filter((m) => m.projectId === p.id && m.senderId === m.userId && !m.readAt).length,
          expiresAt: p.expiresAt, driveExportAllowed: p.driveExportAllowed,
        }
      }).sort((a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? '')))
    },
    async adminSetExpiry(ids, date) {
      if (!isAdmin()) throw new Error('Acesso restrito ao administrador')
      const list = db.projects.filter((p) => !ids || ids.includes(p.id))
      list.forEach((p) => { p.expiresAt = date })
      list.forEach((p) => changed(p.id))
      return list.length
    },
    async adminSetDriveExport(ids, allowed) {
      if (!isAdmin()) throw new Error('Acesso restrito ao administrador')
      const list = db.projects.filter((p) => !ids || ids.includes(p.id))
      list.forEach((p) => { p.driveExportAllowed = allowed })
      list.forEach((p) => changed(p.id))
      return list.length
    },
    async adminGetDefaults() {
      if (!isAdmin()) throw new Error('Acesso restrito ao administrador')
      return { ...db.defaults }
    },
    async adminSetDefaults(d) {
      if (!isAdmin()) throw new Error('Acesso restrito ao administrador')
      db.defaults = { ...d }
      changed()
    },
    async adminUsers() {
      if (!isAdmin()) throw new Error('Acesso restrito ao administrador')
      return delay(db.users.map((u): AdminUser => ({
        id: u.id, email: u.email, fullName: u.fullName, createdAt: u.createdAt, lastSignInAt: u.lastSignInAt,
        projects: db.members.filter((m) => m.userId === u.id).length,
        openTasks: db.assignees.filter((a) => a.userId === u.id && db.tasks.find((t) => t.id === a.taskId)?.status !== 'done').length,
        unread: db.messages.filter((m) => m.userId === u.id && m.senderId === u.id && !m.readAt).length,
      })))
    },
  }
}
