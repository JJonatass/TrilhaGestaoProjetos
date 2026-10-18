// Modelo de dados do app. Espelha as tabelas do Supabase (supabase/setup.sql).

export type StatusId = 'backlog' | 'todo' | 'doing' | 'review' | 'done'

export interface StatusDef {
  id: StatusId
  label: string
}

export const STATUSES: StatusDef[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'A fazer' },
  { id: 'doing', label: 'Fazendo' },
  { id: 'review', label: 'Revisão' },
  { id: 'done', label: 'Feito' },
]

export const PHASES = [
  'Ideação',
  'Definição',
  'Planejamento',
  'Design',
  'Desenvolvimento',
  'Testes',
  'Lançamento',
  'Operação',
  'Evolução',
  'Fim do ciclo',
] as const
export type Phase = (typeof PHASES)[number]

export type Priority = 'baixa' | 'media' | 'alta' | 'critica'
export const PRIORITIES: { id: Priority; label: string }[] = [
  { id: 'baixa', label: 'Baixa' },
  { id: 'media', label: 'Média' },
  { id: 'alta', label: 'Alta' },
  { id: 'critica', label: 'Crítica' },
]

export type Role = 'owner' | 'editor' | 'viewer'
export const ROLE_LABEL: Record<Role, string> = { owner: 'Criador', editor: 'Editor', viewer: 'Leitor' }

export interface Profile {
  id: string
  email: string
  fullName: string
}

export interface Member extends Profile {
  role: Role
  joinedAt: string
}

export interface Invite {
  id: string
  email: string
  role: Role
  createdAt: string
}

export interface Task {
  id: number
  title: string
  description: string
  assignees: string[] // ids dos responsáveis (um ou mais integrantes)
  priority: Priority
  points: number
  status: StatusId
  phase: Phase
  sprintId: number | null
  start: string | null // AAAA-MM-DD
  due: string | null // AAAA-MM-DD
  milestone: boolean
  dependsOn: number[]
  createdAt: string // ISO
  createdBy: string | null
  position: number
}

export interface Sprint {
  id: number
  name: string
  start: string
  end: string
}

export interface StatusChange {
  id: number
  taskId: number
  from: StatusId | null
  to: StatusId
  at: string // ISO
  changedBy: string | null
}

export interface ProjectMeta {
  id: string
  name: string
  ownerId: string
  wip: Partial<Record<StatusId, number>>
  selfAssign: boolean
  createdAt: string
  expiresAt: string | null // prazo de existência definido pelo administrador
  driveExportAllowed: boolean // administrador autorizou salvar no Google Drive
}

export interface Snapshot {
  meta: ProjectMeta
  members: Member[]
  invites: Invite[]
  tasks: Task[]
  sprints: Sprint[]
  history: StatusChange[]
}

export interface ProjectSummary {
  id: string
  name: string
  role: Role
  ownerName: string
  members: number
  tasks: number
  done: number
  createdAt: string
  expiresAt: string | null
}

export interface PendingInvite {
  id: string
  projectId: string
  projectName: string
  role: Role
  invitedByName: string
  createdAt: string
}

export interface Message {
  id: number
  projectId: string
  userId: string // dono da conversa (o integrante)
  senderId: string
  taskId: number | null
  body: string
  createdAt: string
  readAt: string | null
}

export interface InboxThread {
  projectId: string
  projectName: string
  userId: string
  userName: string
  userEmail: string
  lastBody: string
  lastAt: string
  lastSender: string
  unread: number // mensagens que eu ainda não li
  unreadOther: number // mensagens que eu enviei e o outro lado ainda não leu
}

export interface AdminProject {
  id: string
  name: string
  ownerName: string
  ownerEmail: string
  createdAt: string
  members: number
  tasks: number
  done: number
  late: number
  pointsTotal: number
  pointsDone: number
  lastActivity: string | null
  unread: number
  expiresAt: string | null
  driveExportAllowed: boolean
}

export interface AdminUser {
  id: string
  email: string
  fullName: string
  createdAt: string
  lastSignInAt: string | null
  projects: number
  openTasks: number
  unread: number
}

export type TaskDraft = Omit<Task, 'id' | 'createdAt' | 'createdBy' | 'position'>

export interface AdminDefaults {
  expiresAt: string | null
  driveExport: boolean
}
