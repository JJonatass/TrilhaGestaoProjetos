// Modo demonstração: tudo no navegador, com pessoas e projeto fictícios.
// Imita as regras do banco (papéis, responsáveis, mensagens) para que as
// telas possam ser usadas em aula sem criar contas.

import { projectColumns, validateColumns } from '../lib/columns'
import { addDays, today } from '../lib/dates'
import type {
  Activity, AdminProject, AdminUser, AppNotification, ColumnDef, Epic, InboxThread, Kind, Label, Member, Message, PendingInvite,
  Phase, Priority, Profile, ProjectMeta, Role, SavedFilter, Snapshot, Sprint, SprintReport, StatusChange, StatusId, Task,
  TaskComment, TeamMessage, TeamWall,
} from '../types'
import type { Repo, Session } from './repo'

interface Invite { id: string; projectId: string; email: string; role: Role; invitedBy: string; createdAt: string }
interface Db {
  users: (Profile & { createdAt: string; lastSignInAt: string | null; blocked?: boolean })[]
  admins: string[]
  domains?: { domain: string; note: string; createdAt: string }[]
  allowedEmails?: { email: string; note: string; createdAt: string }[]
  projects: ProjectMeta[]
  members: { projectId: string; userId: string; role: Role; joinedAt: string }[]
  invites: Invite[]
  tasks: (Omit<Task, 'assignees' | 'dependsOn'> & { projectId: string })[]
  assignees: { projectId: string; taskId: number; userId: string }[]
  deps: { projectId: string; taskId: number; dependsOn: number }[]
  sprints: (Sprint & { projectId: string })[]
  history: (StatusChange & { projectId: string })[]
  messages: Message[]
  teamMessages?: { id: number; projectId: string; senderId: string; taskId: number | null; body: string; createdAt: string }[]
  teamReads?: Record<string, string> // `${projeto}|${usuário}` → lido até
  epics: (Epic & { projectId: string })[]
  labels: (Label & { projectId: string })[]
  comments: (Omit<TaskComment, 'authorName'> & { projectId: string })[]
  activity: (Activity & { projectId: string })[]
  notifications: { id: number; userId: string; projectId: string; taskId: number; commentId: number; actorId: string; kind: 'mention' | 'comment'; createdAt: string; readAt: string | null }[]
  filters: (SavedFilter & { projectId: string })[]
  seq: number
  sessionUserId: string | null
  defaults: { expiresAt: string | null; driveExport: boolean; maxMembers?: number | null }
}

const KEY = 'trilha.demo.v3'
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

const SPRINT_GOALS = ['Problema validado com os alunos', 'Protótipo testado e base técnica pronta', 'Agenda e lembretes funcionando', 'Beta com a turma piloto']
// tipo de cada item do exemplo (o resto é tarefa)
const SAMPLE_KIND: Partial<Record<number, Kind>> = { 9: 'historia', 10: 'historia', 11: 'historia', 12: 'historia' }
const SAMPLE_EPICS: [string, string, string][] = [
  ['Descoberta e definição', '#d18b1c', 'Entender o problema da monitoria e validar a proposta.'],
  ['Experiência do aluno', '#5577b0', 'Telas, agenda, lembretes e painel do monitor.'],
  ['Plataforma e qualidade', '#2f8f5b', 'Infraestrutura, login, testes e lançamento.'],
]
const SAMPLE_EPIC_OF: Partial<Record<number, number>> = {
  0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 13: 0,
  5: 1, 6: 1, 7: 1, 10: 1, 11: 1, 12: 1,
  8: 2, 9: 2, 14: 2, 15: 2, 16: 2, 17: 2, 18: 2, 19: 2,
}
const SAMPLE_LABELS: [string, string][] = [['front', '#5577b0'], ['back', '#2f8f5b'], ['ux', '#8a5fc0'], ['infra', '#d18b1c'], ['urgente', '#c0392b']]
const SAMPLE_TASK_LABELS: Partial<Record<number, string[]>> = {
  5: ['ux'], 6: ['ux', 'front'], 7: ['ux'], 8: ['infra'], 9: ['back', 'infra'], 10: ['front', 'back', 'urgente'], 11: ['back'], 12: ['front'], 14: ['infra'],
}
const SAMPLE_CHECKLIST: Partial<Record<number, [string, boolean][]>> = {
  10: [['Listar horários livres', true], ['Reservar vaga', true], ['Cancelar reserva', false], ['Tratar fuso horário', false]],
  11: [['Configurar e-mail de reserva', true], ['Enviar aviso 1 h antes', false]],
  14: [['Fluxo de reserva', false], ['Fluxo de cancelamento', false], ['Lembrete', false]],
}

const at = (day: string, minute = 0, hour = 9) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, hour, minute).toISOString()
}

function seedProject(db: Db, projectId: string, owner: string, peopleIds: Record<string, string>) {
  const t0 = addDays(today(), -27)
  const sprintIds = [0, 1, 2, 3].map((i) => {
    const id = ++db.seq
    db.sprints.push({ id, projectId, name: `Sprint ${i + 1}`, start: addDays(t0, i * 14), end: addDays(t0, i * 14 + 13), goal: SPRINT_GOALS[i] ?? '', closedAt: null, report: null })
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
      kind: SAMPLE_KIND[i] ?? 'tarefa', epicId: null, labels: [], columnKey: null, checklist: [],
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

  // épicos, rótulos e checklist de exemplo
  const epicIds = SAMPLE_EPICS.map(([name, color, description], k) => {
    const eid = ++db.seq
    db.epics.push({ id: eid, projectId, name, color, description, position: k })
    return eid
  })
  const labelIds: Record<string, number> = {}
  SAMPLE_LABELS.forEach(([name, color]) => {
    const lid = ++db.seq
    labelIds[name] = lid
    db.labels.push({ id: lid, projectId, name, color })
  })
  ids.forEach((tid, i) => {
    const t = db.tasks.find((x) => x.id === tid)!
    const e = SAMPLE_EPIC_OF[i]
    t.epicId = e === undefined ? null : epicIds[e]
    t.labels = (SAMPLE_TASK_LABELS[i] ?? []).map((n) => labelIds[n])
    t.checklist = (SAMPLE_CHECKLIST[i] ?? []).map(([title, done], k) => ({
      id: ++db.seq, title, done, position: k, doneBy: done ? owner : null, doneAt: done ? at(addDays(t0, 20 + k)) : null,
    }))
  })

  // o primeiro sprint já foi encerrado, com relatório
  const s1 = db.sprints.find((x) => x.id === sprintIds[0])!
  const inS1 = db.tasks.filter((t) => t.sprintId === s1.id)
  s1.closedAt = at(s1.end, 0, 18)
  s1.report = {
    committedPoints: inS1.filter((t) => !t.milestone).reduce((a, t) => a + t.points, 0),
    completedPoints: inS1.filter((t) => !t.milestone && t.status === 'done').reduce((a, t) => a + t.points, 0),
    committedTasks: inS1.length,
    completedTasks: inS1.filter((t) => t.status === 'done').length,
    completed: inS1.filter((t) => t.status === 'done').map((t) => t.id),
    carried: inS1.filter((t) => t.status !== 'done').map((t) => t.id),
    bugsOpen: 0,
    nextSprint: sprintIds[1],
  }
  return { ids, sprintIds, epicIds, labelIds }
}

const DEMO_COLUMNS: ColumnDef[] = [
  { id: 'backlog', label: 'Backlog', category: 'backlog', wip: null },
  { id: 'todo', label: 'A fazer', category: 'todo', wip: null },
  { id: 'doing', label: 'Desenvolvendo', category: 'doing', wip: 3 },
  { id: 'revisao-codigo', label: 'Revisão de código', category: 'review', wip: 2 },
  { id: 'teste', label: 'Teste', category: 'review', wip: null },
  { id: 'done', label: 'Feito', category: 'done', wip: null },
]

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
    epics: [], labels: [], comments: [], activity: [], notifications: [], filters: [],
    seq: 100, sessionUserId: null,
    defaults: { expiresAt: null, driveExport: false, maxMembers: null },
  }
  const p1 = 'p-monitorias'
  db.projects.push({ id: p1, name: 'App de Monitorias', ownerId: U.ana, wip: { doing: 3, review: 2 }, selfAssign: true, createdAt: at(addDays(today(), -28)), expiresAt: at(addDays(today(), 12), 59, 23), driveExportAllowed: true, maxMembers: 6, columns: DEMO_COLUMNS })
  const joined = at(addDays(today(), -27))
  db.members.push(
    { projectId: p1, userId: U.ana, role: 'owner', joinedAt: joined },
    { projectId: p1, userId: U.bruno, role: 'editor', joinedAt: joined },
    { projectId: p1, userId: U.carla, role: 'editor', joinedAt: joined },
    { projectId: p1, userId: U.diego, role: 'editor', joinedAt: joined },
    { projectId: p1, userId: U.elisa, role: 'viewer', joinedAt: joined },
  )
  const seeded = seedProject(db, p1, U.ana, { ana: U.ana, bruno: U.bruno, carla: U.carla, diego: U.diego })

  // um bug aberto no sprint atual
  {
    const id = ++db.seq
    const created = at(addDays(today(), -3))
    db.tasks.push({
      id, projectId: p1, title: 'Horário da monitoria aparece em UTC', description: 'Na agenda, 14h aparece como 17h. Acontece só no celular.',
      phase: 'Desenvolvimento', points: 2, priority: 'alta', status: 'doing', sprintId: seeded.sprintIds[1],
      start: addDays(today(), -3), due: addDays(today(), 1), milestone: false, createdAt: created, createdBy: U.carla, position: 99,
      kind: 'bug', epicId: seeded.epicIds[1], labels: [seeded.labelIds.front, seeded.labelIds.urgente], columnKey: null,
      checklist: [{ id: ++db.seq, title: 'Reproduzir no Android', done: true, position: 0, doneBy: U.carla, doneAt: created }, { id: ++db.seq, title: 'Corrigir conversão de fuso', done: false, position: 1, doneBy: null, doneAt: null }],
    })
    db.history.push({ id: ++db.seq, projectId: p1, taskId: id, from: null, to: 'todo', at: created, changedBy: U.carla })
    db.history.push({ id: ++db.seq, projectId: p1, taskId: id, from: 'todo', to: 'doing', at: at(addDays(today(), -2)), changedBy: U.diego })
    db.assignees.push({ projectId: p1, taskId: id, userId: U.diego })
    db.deps.push({ projectId: p1, taskId: seeded.ids[10], dependsOn: id })
  }
  // "Notificações de lembrete" está na coluna Teste (etapa Revisão)
  db.tasks.find((t) => t.id === seeded.ids[11])!.columnKey = 'teste'

  // comentários com menção e aviso não lido
  {
    const agendaId = seeded.ids[10]
    const c1 = ++db.seq
    db.comments.push({ id: c1, projectId: p1, taskId: agendaId, authorId: U.ana, body: '@Diego Ramos o problema do fuso virou um bug separado. Dá para fechar a reserva primeiro?', mentions: [U.diego], createdAt: new Date(Date.now() - 5 * 3600_000).toISOString() })
    db.notifications.push({ id: ++db.seq, userId: U.diego, projectId: p1, taskId: agendaId, commentId: c1, actorId: U.ana, kind: 'mention', createdAt: new Date(Date.now() - 5 * 3600_000).toISOString(), readAt: null })
    db.notifications.push({ id: ++db.seq, userId: U.bruno, projectId: p1, taskId: agendaId, commentId: c1, actorId: U.ana, kind: 'comment', createdAt: new Date(Date.now() - 5 * 3600_000).toISOString(), readAt: null })
    db.comments.push({ id: ++db.seq, projectId: p1, taskId: agendaId, authorId: U.diego, body: 'Dá sim. Fecho a reserva hoje e pego o bug amanhã.', mentions: [], createdAt: new Date(Date.now() - 4 * 3600_000).toISOString() })
  }

  // filtros salvos
  db.filters.push({ id: ++db.seq, projectId: p1, name: 'Bugs abertos', ownerId: U.ana, shared: true, query: { kinds: ['bug'] } })
  db.filters.push({ id: ++db.seq, projectId: p1, name: 'Minhas tarefas', ownerId: U.ana, shared: false, query: { assignees: ['me'] } })

  const p2 = 'p-semana'
  db.projects.push({ id: p2, name: 'Site da Semana Acadêmica', ownerId: U.bruno, wip: { doing: 2 }, selfAssign: true, createdAt: at(addDays(today(), -6)), expiresAt: null, driveExportAllowed: false, maxMembers: null, columns: null })
  db.members.push({ projectId: p2, userId: U.bruno, role: 'owner', joinedAt: at(addDays(today(), -6)) })
  const t = (title: string, status: StatusId, phase: Phase, d: number) => {
    const id = ++db.seq
    db.tasks.push({ id, projectId: p2, title, description: '', phase, points: 3, priority: 'media', status, sprintId: null, start: addDays(today(), d), due: addDays(today(), d + 3), milestone: false, createdAt: at(addDays(today(), -5)), createdBy: U.bruno, position: id, kind: 'tarefa', epicId: null, labels: [], columnKey: null, checklist: [] })
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
      if (raw) return withAccess(JSON.parse(raw) as Db)
    } catch {
      /* sem armazenamento */
    }
    return withAccess(initialDb())
  }
  // regras de acesso do modo demonstração (dados antigos do navegador ganham o padrão)
  function withAccess(d: Db): Db {
    const now = new Date().toISOString()
    d.domains ??= [
      { domain: 'ficr.edu.br', note: 'Faculdade Integrada do Recife', createdAt: now },
      { domain: 'exemplo.com', note: 'Perfis de demonstração', createdAt: now },
    ]
    d.allowedEmails ??= []
    if (!d.teamMessages) {
      const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()
      d.teamMessages = [
        { id: 9001, projectId: 'p-monitorias', senderId: 'u-ana', taskId: null, body: 'Pessoal, reunião rápida amanhã às 19h para fechar o sprint. Tragam o que travou.', createdAt: ago(20) },
        { id: 9002, projectId: 'p-monitorias', senderId: 'u-diego', taskId: null, body: 'Fechado. A agenda de monitorias ainda depende do login, vou falar com o Bruno.', createdAt: ago(18) },
        { id: 9003, projectId: 'p-monitorias', senderId: 'u-bruno', taskId: null, body: 'Login com Google está em revisão, deve sair hoje.', createdAt: ago(17) },
        { id: 9004, projectId: 'p-monitorias', senderId: 'u-jonatas', taskId: null, body: 'Bom ritmo, equipe. Lembrem de atualizar as datas no cronograma depois da reunião.', createdAt: ago(3) },
      ]
    }
    d.teamReads ??= {}
    return d
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
  const needAdmin = () => { if (!isAdmin()) throw new Error('Acesso restrito ao administrador') }
  const domOf = (e: string) => e.split('@')[1] ?? ''
  const inDomain = (e: string, d: string) => domOf(e) === d || domOf(e).endsWith('.' + d)
  const emailAllowed = (raw: string) => {
    const e = raw.trim().toLowerCase()
    return db.admins.includes(e) || db.allowedEmails!.some((x) => x.email === e) || db.domains!.length === 0 || db.domains!.some((d) => inDomain(e, d.domain))
  }
  const cleanDomain = (d: string) => {
    const v = d.trim().toLowerCase().replace(/^@+/, '')
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(v)) throw new Error('Domínio inválido. Use o formato ficr.edu.br')
    return v
  }
  const role = (p: string) => db.members.find((m) => m.projectId === p && m.userId === db.sessionUserId)?.role ?? null
  const canEdit = (p: string) => role(p) === 'owner' || role(p) === 'editor'
  const deny = () => { throw new Error('Você não tem permissão para fazer isso neste projeto.') }
  const session = (): Session | null => (me() ? { user: { id: me()!.id, email: me()!.email, fullName: me()!.fullName }, isAdmin: isAdmin() } : null)
  const emitAuth = () => authListeners.forEach((f) => f(session()))
  const projectOf = (taskId: number) => db.tasks.find((t) => t.id === taskId)?.projectId
  // coluna personalizada: a etapa segue a coluna
  const applyColumn = (projectId: string, id: number, key: string) => {
    const t = db.tasks.find((x) => x.id === id)!
    const p = db.projects.find((x) => x.id === projectId)!
    const col = projectColumns(p).find((c) => c.id === key)
    if (!col) { t.columnKey = null; return }
    t.columnKey = p.columns ? key : null
    t.status = col.category
  }
  const logAct = (projectId: string, taskId: number, action: string, detail: Record<string, unknown>) =>
    db.activity.push({ id: ++db.seq, projectId, taskId, actorId: db.sessionUserId, action, detail, at: new Date().toISOString() })

  return {
    mode: 'demo',

    async getSession() { return delay(session()) },
    onAuthChange(cb) { authListeners.add(cb); return () => authListeners.delete(cb) },
    async signIn(email) {
      const u = db.users.find((x) => x.email === email.trim().toLowerCase())
      if (!u) throw new Error('No modo demonstração, use um dos perfis de exemplo.')
      if (u.blocked) throw new Error('User is banned')
      db.sessionUserId = u.id
      u.lastSignInAt = new Date().toISOString()
      save(); emitAuth()
    },
    async signUp(email, _password, fullName) {
      const e = email.trim().toLowerCase()
      if (db.users.some((u) => u.email === e)) throw new Error('User already registered')
      if (!emailAllowed(e)) throw new Error('Cadastro não permitido para este e-mail')
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
    async demoSwitch(userId) {
      if (db.users.find((u) => u.id === userId)?.blocked) throw new Error('User is banned')
      db.sessionUserId = userId; save(); emitAuth()
    },

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
      db.projects.push({ id, name, ownerId: uid, wip: { doing: 3, review: 2 }, selfAssign: true, createdAt: new Date().toISOString(), expiresAt: db.defaults.expiresAt, driveExportAllowed: db.defaults.driveExport, maxMembers: db.defaults.maxMembers ?? null, columns: null })
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
      const lim = db.projects.find((p) => p.id === inv.projectId)?.maxMembers ?? null
      if (lim !== null && db.members.filter((m) => m.projectId === inv.projectId).length >= lim) {
        throw new Error(`A equipe já atingiu o limite de ${lim} integrantes`)
      }
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
        meta: { ...meta, maxMembers: meta.maxMembers ?? null },
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
        sprints: db.sprints.filter((s) => s.projectId === id).map(({ projectId: _p, ...sp }): Sprint => { void _p; return sp }).sort((a, b) => a.start.localeCompare(b.start)),
        history: db.history.filter((h) => h.projectId === id).map(({ projectId: _p, ...h }) => { void _p; return h }).sort((a, b) => a.at.localeCompare(b.at)),
        epics: db.epics.filter((e) => e.projectId === id).map(({ projectId: _p, ...e }) => { void _p; return e }).sort((a, b) => a.position - b.position || a.id - b.id),
        labels: db.labels.filter((l) => l.projectId === id).map(({ projectId: _p, ...l }) => { void _p; return l }).sort((a, b) => a.name.localeCompare(b.name)),
        savedFilters: db.filters.filter((f) => f.projectId === id && (f.ownerId === db.sessionUserId || f.shared)).map(({ projectId: _p, ...f }) => { void _p; return f }),
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
      const { name, wip, selfAssign, columns } = patch
      if (columns) {
        const err = validateColumns(columns)
        if (err) throw new Error(err)
      }
      Object.assign(p, Object.fromEntries(Object.entries({ name, wip, selfAssign, columns }).filter(([, v]) => v !== undefined)))
      if (columns !== undefined) {
        // coluna removida: cartões voltam para a primeira coluna da etapa
        const keys = (columns ?? []).map((c) => c.id)
        db.tasks.forEach((t) => { if (t.projectId === id && t.columnKey && !keys.includes(t.columnKey)) t.columnKey = null })
      }
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
        kind: d.kind ?? 'tarefa', epicId: d.epicId ?? null, labels: [...(d.labels ?? [])], columnKey: null, checklist: [],
      })
      if (d.columnKey) applyColumn(projectId, id, d.columnKey)
      const st = db.tasks.find((x) => x.id === id)!.status
      db.history.push({ id: ++db.seq, projectId, taskId: id, from: null, to: st, at: createdAt, changedBy: db.sessionUserId })
      logAct(projectId, id, 'criou', { kind: d.kind ?? 'tarefa' })
      d.dependsOn.forEach((x) => db.deps.push({ projectId, taskId: id, dependsOn: x }))
      for (const u of d.assignees) await this.setAssignee(projectId, id, u, true)
      changed(projectId)
      return id
    },
    async updateTask(projectId, id, patch) {
      if (!canEdit(projectId)) deny()
      const t = db.tasks.find((x) => x.id === id)!
      const { assignees: _a, dependsOn: _d, labels: _l, checklist: _c, ...rest } = patch as Partial<Task>
      void _a; void _d; void _l; void _c
      const before = { ...t }
      if (rest.columnKey !== undefined) {
        const key = rest.columnKey
        delete rest.columnKey
        Object.assign(t, rest)
        if (key) applyColumn(projectId, id, key)
        else t.columnKey = null
      } else {
        if (rest.status && rest.status !== t.status) t.columnKey = null
        Object.assign(t, rest)
      }
      if (t.status !== before.status) {
        db.history.push({ id: ++db.seq, projectId, taskId: id, from: before.status, to: t.status, at: new Date().toISOString(), changedBy: db.sessionUserId })
      }
      const name = (list: { id: number; name: string }[], x: number | null) => list.find((y) => y.id === x)?.name ?? null
      const fields: [keyof typeof t, string][] = [['title', 'title'], ['kind', 'kind'], ['priority', 'priority'], ['points', 'points'], ['start', 'start'], ['due', 'due'], ['phase', 'phase']]
      for (const [k, campo] of fields) if (t[k] !== before[k]) logAct(projectId, id, 'campo', { campo, de: before[k], para: t[k] })
      if (t.description !== before.description) logAct(projectId, id, 'campo', { campo: 'description' })
      if (t.sprintId !== before.sprintId) logAct(projectId, id, 'campo', { campo: 'sprint', de: name(db.sprints, before.sprintId), para: name(db.sprints, t.sprintId) })
      if (t.epicId !== before.epicId) logAct(projectId, id, 'campo', { campo: 'epic', de: name(db.epics, before.epicId), para: name(db.epics, t.epicId) })
      if (t.status !== before.status || t.columnKey !== before.columnKey) logAct(projectId, id, 'coluna', { de: before.columnKey ?? before.status, para: t.columnKey ?? t.status })
      changed(projectId)
    },
    async moveTask(projectId, id, status, position, columnKey = null) {
      return this.updateTask(projectId, id, columnKey ? { position, columnKey } : { status, position, columnKey: null })
    },
    async deleteTask(projectId, id) {
      if (!canEdit(projectId)) deny()
      db.tasks = db.tasks.filter((t) => t.id !== id)
      db.comments = db.comments.filter((c) => c.taskId !== id)
      db.activity = db.activity.filter((a) => a.taskId !== id)
      db.notifications = db.notifications.filter((n) => n.taskId !== id)
      db.assignees = db.assignees.filter((a) => a.taskId !== id)
      db.deps = db.deps.filter((d) => d.taskId !== id && d.dependsOn !== id)
      changed(projectId)
    },
    async setAssignee(projectId, taskId, userId, on) {
      const p = db.projects.find((x) => x.id === projectId)!
      const allowed = role(projectId) === 'owner' || (userId === db.sessionUserId && canEdit(projectId) && p.selfAssign)
      if (!allowed) deny()
      if (!db.members.some((m) => m.projectId === projectId && m.userId === userId)) throw new Error('O responsável precisa ser integrante do projeto')
      const had = db.assignees.some((a) => a.taskId === taskId && a.userId === userId)
      db.assignees = db.assignees.filter((a) => !(a.taskId === taskId && a.userId === userId))
      if (on) db.assignees.push({ projectId: projectOf(taskId) ?? projectId, taskId, userId })
      if (had !== on) logAct(projectId, taskId, on ? 'responsavel_entrou' : 'responsavel_saiu', { nome: db.users.find((u) => u.id === userId)?.fullName ?? '' })
      changed(projectId)
    },
    async setDependencies(projectId, taskId, deps) {
      if (!canEdit(projectId)) deny()
      db.deps = db.deps.filter((d) => d.taskId !== taskId)
      deps.forEach((x) => db.deps.push({ projectId, taskId, dependsOn: x }))
      changed(projectId)
    },
    async addSprint(projectId, s) { if (!canEdit(projectId)) deny(); db.sprints.push({ ...s, goal: s.goal ?? '', closedAt: null, report: null, id: ++db.seq, projectId }); changed(projectId) },
    async updateSprint(projectId, s) {
      if (!canEdit(projectId)) deny()
      const cur = db.sprints.find((x) => x.id === s.id)!
      Object.assign(cur, { name: s.name, start: s.start, end: s.end, goal: s.goal ?? '' })
      changed(projectId)
    },
    async closeSprint(projectId, id, nextId) {
      if (!canEdit(projectId)) deny()
      const sp = db.sprints.find((x) => x.id === id && x.projectId === projectId)
      if (!sp) throw new Error('Sprint não encontrado ou sem permissão')
      if (sp.closedAt) throw new Error('Este sprint já foi encerrado')
      if (nextId !== null && !db.sprints.some((x) => x.id === nextId && x.projectId === projectId && !x.closedAt && x.id !== id)) {
        throw new Error('Escolha um sprint aberto do mesmo projeto')
      }
      const ts = db.tasks.filter((t) => t.sprintId === id)
      const report: SprintReport = {
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
      changed(projectId)
      return report
    },
    async reopenSprint(projectId, id) {
      if (!canEdit(projectId)) deny()
      db.sprints.find((x) => x.id === id)!.closedAt = null
      changed(projectId)
    },

    async setLabels(projectId, taskId, labelIds) {
      if (!canEdit(projectId)) deny()
      const t = db.tasks.find((x) => x.id === taskId)!
      const nm = (lid: number) => db.labels.find((l) => l.id === lid)?.name ?? ''
      labelIds.filter((x) => !t.labels.includes(x)).forEach((x) => logAct(projectId, taskId, 'rotulo_entrou', { nome: nm(x) }))
      t.labels.filter((x) => !labelIds.includes(x)).forEach((x) => logAct(projectId, taskId, 'rotulo_saiu', { nome: nm(x) }))
      t.labels = [...labelIds]
      changed(projectId)
    },
    async addChecklistItem(projectId, taskId, title) {
      if (!canEdit(projectId)) deny()
      const t = db.tasks.find((x) => x.id === taskId)!
      t.checklist.push({ id: ++db.seq, title: title.trim(), done: false, position: Date.now() / 1e6, doneBy: null, doneAt: null })
      logAct(projectId, taskId, 'checklist_novo', { item: title.trim() })
      changed(projectId)
    },
    async updateChecklistItem(projectId, id, patch) {
      if (!canEdit(projectId)) deny()
      const t = db.tasks.find((x) => x.checklist.some((c) => c.id === id))!
      const it = t.checklist.find((c) => c.id === id)!
      if (patch.done !== undefined && patch.done !== it.done) {
        it.doneBy = patch.done ? db.sessionUserId : null
        it.doneAt = patch.done ? new Date().toISOString() : null
        logAct(projectId, t.id, patch.done ? 'checklist_feito' : 'checklist_reaberto', { item: it.title })
      }
      Object.assign(it, patch)
      changed(projectId)
    },
    async deleteChecklistItem(projectId, id) {
      if (!canEdit(projectId)) deny()
      const t = db.tasks.find((x) => x.checklist.some((c) => c.id === id))
      if (t) t.checklist = t.checklist.filter((c) => c.id !== id)
      changed(projectId)
    },

    async addEpic(projectId, e) { if (!canEdit(projectId)) deny(); db.epics.push({ ...e, name: e.name.trim(), id: ++db.seq, projectId }); changed(projectId) },
    async updateEpic(projectId, e) { if (!canEdit(projectId)) deny(); Object.assign(db.epics.find((x) => x.id === e.id)!, e); changed(projectId) },
    async deleteEpic(projectId, id) {
      if (!canEdit(projectId)) deny()
      db.epics = db.epics.filter((x) => x.id !== id)
      db.tasks.forEach((t) => { if (t.epicId === id) t.epicId = null })
      changed(projectId)
    },
    async addLabel(projectId, l) {
      if (!canEdit(projectId)) deny()
      if (db.labels.some((x) => x.projectId === projectId && x.name.trim().toLowerCase() === l.name.trim().toLowerCase())) throw new Error('Já existe um rótulo com esse nome.')
      db.labels.push({ ...l, name: l.name.trim(), id: ++db.seq, projectId })
      changed(projectId)
    },
    async updateLabel(projectId, l) {
      if (!canEdit(projectId)) deny()
      if (db.labels.some((x) => x.projectId === projectId && x.id !== l.id && x.name.trim().toLowerCase() === l.name.trim().toLowerCase())) throw new Error('Já existe um rótulo com esse nome.')
      Object.assign(db.labels.find((x) => x.id === l.id)!, { name: l.name.trim(), color: l.color })
      changed(projectId)
    },
    async deleteLabel(projectId, id) {
      if (!canEdit(projectId)) deny()
      db.labels = db.labels.filter((x) => x.id !== id)
      db.tasks.forEach((t) => { t.labels = t.labels.filter((x) => x !== id) })
      changed(projectId)
    },

    supportsComments: true,
    async listComments(projectId, taskId) {
      if (!role(projectId) && !isAdmin()) deny()
      return delay(db.comments.filter((c) => c.taskId === taskId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(({ projectId: _p, ...c }): TaskComment => {
        void _p
        return { ...c, authorName: db.users.find((u) => u.id === c.authorId)?.fullName ?? 'Professor' }
      }))
    },
    async addComment(projectId, taskId, body, mentions) {
      if (!role(projectId) && !isAdmin()) deny()
      const uid = db.sessionUserId!
      const valid = [...new Set(mentions)].filter((m) => m !== uid && (db.members.some((x) => x.projectId === projectId && x.userId === m) || db.admins.includes(db.users.find((u) => u.id === m)?.email ?? '')))
      const id = ++db.seq
      const createdAt = new Date().toISOString()
      db.comments.push({ id, projectId, taskId, authorId: uid, body: body.trim(), mentions: valid, createdAt })
      valid.forEach((m) => db.notifications.push({ id: ++db.seq, userId: m, projectId, taskId, commentId: id, actorId: uid, kind: 'mention', createdAt, readAt: null }))
      db.assignees.filter((a) => a.taskId === taskId && a.userId !== uid && !valid.includes(a.userId))
        .forEach((a) => db.notifications.push({ id: ++db.seq, userId: a.userId, projectId, taskId, commentId: id, actorId: uid, kind: 'comment', createdAt, readAt: null }))
      save(); msgListeners.forEach((f) => f()); changed(projectId)
    },
    async deleteComment(projectId, id) {
      const c = db.comments.find((x) => x.id === id)
      if (!c || c.authorId !== db.sessionUserId) deny()
      db.comments = db.comments.filter((x) => x.id !== id)
      db.notifications = db.notifications.filter((n) => n.commentId !== id)
      changed(projectId)
    },
    async listActivity(projectId, taskId) {
      if (!role(projectId) && !isAdmin()) deny()
      return delay(db.activity.filter((a) => a.taskId === taskId).map(({ projectId: _p, ...a }) => { void _p; return a }).sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id))
    },

    async addFilter(projectId, name, query, shared) {
      if (!role(projectId) && !isAdmin()) deny()
      db.filters.push({ id: ++db.seq, projectId, name: name.trim(), ownerId: db.sessionUserId!, shared, query })
      changed(projectId)
    },
    async updateFilter(projectId, id, patch) {
      const f = db.filters.find((x) => x.id === id)
      if (!f || f.ownerId !== db.sessionUserId) deny()
      Object.assign(f!, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)))
      changed(projectId)
    },
    async deleteFilter(projectId, id) {
      const f = db.filters.find((x) => x.id === id)
      if (!f || f.ownerId !== db.sessionUserId) deny()
      db.filters = db.filters.filter((x) => x.id !== id)
      changed(projectId)
    },

    async notifications() {
      const uid = db.sessionUserId
      return delay(db.notifications.filter((n) => n.userId === uid && (role(n.projectId) || isAdmin())).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((n): AppNotification => ({
        id: n.id, projectId: n.projectId, projectName: db.projects.find((p) => p.id === n.projectId)?.name ?? '',
        taskId: n.taskId, taskTitle: db.tasks.find((t) => t.id === n.taskId)?.title ?? '', commentId: n.commentId,
        excerpt: (db.comments.find((c) => c.id === n.commentId)?.body ?? '').slice(0, 160),
        actorName: db.users.find((u) => u.id === n.actorId)?.fullName ?? 'Professor', kind: n.kind, createdAt: n.createdAt, readAt: n.readAt,
      })))
    },
    async markNotificationsRead(ids, taskId) {
      const uid = db.sessionUserId
      let n = 0
      db.notifications.forEach((x) => {
        if (x.userId === uid && !x.readAt && (!ids || ids.includes(x.id)) && (taskId === undefined || x.taskId === taskId)) { x.readAt = new Date().toISOString(); n++ }
      })
      if (n) { save(); msgListeners.forEach((f) => f()) }
    },
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
      if (!emailAllowed(e) && !db.users.some((u) => u.email === e)) {
        throw new Error('Este e-mail não pode se cadastrar no sistema (domínio não permitido). Use o e-mail institucional da pessoa ou peça ao administrador para liberá-lo.')
      }
      const lim = db.projects.find((p) => p.id === projectId)?.maxMembers ?? null
      const used = db.members.filter((m) => m.projectId === projectId).length + db.invites.filter((i) => i.projectId === projectId).length
      if (lim !== null && used >= lim) throw new Error(`A equipe já atingiu o limite de ${lim} integrantes (contando convites pendentes)`)
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

    async teamInbox() {
      const uid = db.sessionUserId!
      const admin = isAdmin()
      const ids = [...new Set(db.teamMessages!.map((m) => m.projectId))].filter((p) => admin || role(p))
      const nameOf = (id: string) => { const u = db.users.find((x) => x.id === id); return u?.fullName || u?.email.split('@')[0] || '' }
      return delay(ids.map((p): TeamWall => {
        const list = db.teamMessages!.filter((m) => m.projectId === p).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        const last = list[list.length - 1]
        const readAt = db.teamReads![`${p}|${uid}`] ?? ''
        return {
          projectId: p, projectName: db.projects.find((x) => x.id === p)?.name ?? '',
          unread: list.filter((m) => m.senderId !== uid && m.createdAt > readAt).length,
          lastBody: last.body, lastAt: last.createdAt, lastSenderName: nameOf(last.senderId), total: list.length,
        }
      }).sort((a, b) => b.lastAt.localeCompare(a.lastAt)))
    },
    async teamThread(projectId) {
      if (!role(projectId) && !isAdmin()) throw new Error('Você não participa deste projeto')
      return delay(db.teamMessages!.filter((m) => m.projectId === projectId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((m): TeamMessage => {
        const u = db.users.find((x) => x.id === m.senderId)
        const member = db.members.some((x) => x.projectId === projectId && x.userId === m.senderId)
        return { ...m, senderName: u?.fullName || u?.email.split('@')[0] || '', senderIsAdmin: !!u && db.admins.includes(u.email) && !member }
      }))
    },
    async sendTeamMessage(projectId, body, taskId) {
      if (!role(projectId) && !isAdmin()) throw new Error('Você não participa deste projeto')
      db.teamMessages!.push({ id: ++db.seq, projectId, senderId: db.sessionUserId!, taskId, body, createdAt: new Date().toISOString() })
      db.teamReads![`${projectId}|${db.sessionUserId}`] = new Date().toISOString()
      save(); msgListeners.forEach((f) => f())
    },
    async markTeamRead(projectId) {
      db.teamReads![`${projectId}|${db.sessionUserId}`] = new Date().toISOString()
      save(); msgListeners.forEach((f) => f())
    },

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
          maxMembers: p.maxMembers ?? null,
          pendingInvites: db.invites.filter((i) => i.projectId === p.id).length,
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
    async adminSetMaxMembers(ids, max) {
      if (!isAdmin()) throw new Error('Acesso restrito ao administrador')
      if (max !== null && (max < 1 || max > 200)) throw new Error('max_members_check')
      const list = db.projects.filter((p) => !ids || ids.includes(p.id))
      list.forEach((p) => { p.maxMembers = max })
      list.forEach((p) => changed(p.id))
      return list.length
    },
    async adminGetDefaults() {
      if (!isAdmin()) throw new Error('Acesso restrito ao administrador')
      return { ...db.defaults, maxMembers: db.defaults.maxMembers ?? null }
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
        isAdmin: db.admins.includes(u.email), blocked: !!u.blocked, confirmed: true,
        ownedProjects: db.projects.filter((p) => p.ownerId === u.id).length,
      })))
    },

    async canSignUp(email) {
      return delay({ allowed: emailAllowed(email), domains: db.domains!.map((d) => d.domain).sort() })
    },
    async adminAccess() {
      needAdmin()
      const myEmail = me()!.email
      return delay({
        domains: [...db.domains!].sort((a, b) => a.domain.localeCompare(b.domain)).map((d) => ({ ...d, users: db.users.filter((u) => inDomain(u.email, d.domain)).length })),
        emails: [...db.allowedEmails!].sort((a, b) => a.email.localeCompare(b.email)).map((x) => ({ ...x, registered: db.users.some((u) => u.email === x.email) })),
        admins: [...db.admins].sort().map((e) => ({ email: e, registered: db.users.some((u) => u.email === e), confirmed: db.users.some((u) => u.email === e), me: e === myEmail })),
      })
    },
    async adminAddDomain(domain, note) {
      needAdmin()
      const d = cleanDomain(domain)
      if (db.domains!.some((x) => x.domain === d)) throw new Error('Este domínio já está na lista')
      db.domains!.push({ domain: d, note: note.trim(), createdAt: new Date().toISOString() })
      changed()
    },
    async adminUpdateDomain(oldDomain, domain, note) {
      needAdmin()
      const d = cleanDomain(domain)
      const cur = db.domains!.find((x) => x.domain === oldDomain)
      if (!cur) throw new Error('Domínio não encontrado')
      if (d !== oldDomain && db.domains!.some((x) => x.domain === d)) throw new Error('Este domínio já está na lista')
      cur.domain = d
      cur.note = note.trim()
      changed()
    },
    async adminRemoveDomain(domain) { needAdmin(); db.domains = db.domains!.filter((x) => x.domain !== domain); changed() },
    async adminAddEmail(email, note) {
      needAdmin()
      const e = email.trim().toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('E-mail inválido')
      const cur = db.allowedEmails!.find((x) => x.email === e)
      if (cur) cur.note = note.trim()
      else db.allowedEmails!.push({ email: e, note: note.trim(), createdAt: new Date().toISOString() })
      changed()
    },
    async adminRemoveEmail(email) { needAdmin(); db.allowedEmails = db.allowedEmails!.filter((x) => x.email !== email); changed() },
    async adminAddAdmin(email) {
      needAdmin()
      const e = email.trim().toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('E-mail inválido')
      if (!db.admins.includes(e)) db.admins.push(e)
      changed(); emitAuth()
    },
    async adminRemoveAdmin(email) {
      needAdmin()
      if (email === me()!.email) throw new Error('Você não pode tirar a sua própria permissão de administrador')
      db.admins = db.admins.filter((x) => x !== email)
      changed(); emitAuth()
    },
    async adminSetBlocked(userId, blocked) {
      needAdmin()
      if (userId === db.sessionUserId) throw new Error('Você não pode bloquear a sua própria conta')
      const u = db.users.find((x) => x.id === userId)!
      if (blocked && db.admins.includes(u.email)) throw new Error('Tire a permissão de administrador antes de bloquear esta conta')
      u.blocked = blocked
      changed()
    },
    async adminDeleteUser(userId) {
      needAdmin()
      if (userId === db.sessionUserId) throw new Error('Você não pode excluir a sua própria conta por aqui')
      const u = db.users.find((x) => x.id === userId)!
      if (db.admins.includes(u.email)) throw new Error('Tire a permissão de administrador antes de excluir esta conta')
      const owned = new Set(db.projects.filter((p) => p.ownerId === userId).map((p) => p.id))
      const keep = <T extends { projectId: string }>(list: T[]) => list.filter((x) => !owned.has(x.projectId))
      db.projects = db.projects.filter((p) => !owned.has(p.id))
      db.members = keep(db.members).filter((m) => m.userId !== userId)
      db.invites = keep(db.invites)
      db.tasks = keep(db.tasks)
      db.assignees = keep(db.assignees).filter((a) => a.userId !== userId)
      db.deps = keep(db.deps)
      db.sprints = keep(db.sprints)
      db.history = keep(db.history)
      db.messages = keep(db.messages).filter((m) => m.userId !== userId && m.senderId !== userId)
      db.users = db.users.filter((x) => x.id !== userId)
      changed()
    },
  }
}
