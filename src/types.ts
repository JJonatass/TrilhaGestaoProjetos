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

/** Tipo de item, como no Jira */
export type Kind = 'historia' | 'tarefa' | 'bug'
export const KINDS: { id: Kind; label: string; short: string }[] = [
  { id: 'historia', label: 'História', short: 'H' },
  { id: 'tarefa', label: 'Tarefa', short: 'T' },
  { id: 'bug', label: 'Bug', short: 'B' },
]

/**
 * Coluna do quadro. Cada coluna pertence a uma das cinco etapas fixas
 * (category), que alimentam burndown, fluxo cumulativo e tempos.
 */
export interface ColumnDef {
  id: string
  label: string
  category: StatusId
  wip: number | null
}

export interface Epic {
  id: number
  name: string
  color: string
  description: string
  position: number
}

export interface Label {
  id: number
  name: string
  color: string
}

export interface ChecklistItem {
  id: number
  title: string
  done: boolean
  position: number
  doneBy: string | null
  doneAt: string | null
}

export interface TaskComment {
  id: number
  taskId: number
  authorId: string
  authorName: string
  body: string
  mentions: string[]
  createdAt: string
}

export interface Activity {
  id: number
  taskId: number
  actorId: string | null
  action: string
  detail: Record<string, unknown>
  at: string
}

/** Critérios de filtro do quadro e do cronograma */
export interface FilterQuery {
  text?: string
  assignees?: string[] // ids; 'me' = eu; 'none' = sem responsável
  labels?: number[]
  epics?: number[] // 0 = sem épico
  kinds?: Kind[]
  priorities?: Priority[]
  sprint?: 'atual' | 'sem' | number
  due?: 'atrasadas' | 'semana' | 'sem-prazo'
}

export interface SavedFilter {
  id: number
  name: string
  ownerId: string
  shared: boolean
  query: FilterQuery
}

export interface SprintReport {
  committedPoints: number
  completedPoints: number
  committedTasks: number
  completedTasks: number
  completed: number[]
  carried: number[]
  bugsOpen: number
  nextSprint: number | null
}

export interface AppNotification {
  id: number
  projectId: string
  projectName: string
  taskId: number | null
  taskTitle: string
  commentId: number | null
  excerpt: string
  actorName: string
  kind: 'mention' | 'comment'
  createdAt: string
  readAt: string | null
}

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
  kind: Kind
  epicId: number | null
  labels: number[] // ids dos rótulos
  columnKey: string | null // coluna personalizada (null = primeira coluna da etapa)
  checklist: ChecklistItem[]
  createdAt: string // ISO
  createdBy: string | null
  position: number
}

export interface Sprint {
  id: number
  name: string
  start: string
  end: string
  goal: string
  closedAt: string | null
  report: SprintReport | null
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
  maxMembers: number | null // limite de integrantes definido pelo administrador (null = sem limite)
  /** colunas personalizadas do quadro (null = as cinco padrão) */
  columns: ColumnDef[] | null
}

export interface Snapshot {
  meta: ProjectMeta
  members: Member[]
  invites: Invite[]
  tasks: Task[]
  sprints: Sprint[]
  history: StatusChange[]
  epics: Epic[]
  labels: Label[]
  savedFilters: SavedFilter[]
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

/** Mensagem do mural da equipe (conversa do grupo) */
export interface TeamMessage {
  id: number
  projectId: string
  senderId: string
  senderName: string
  senderIsAdmin: boolean // administrador do sistema que não é integrante
  taskId: number | null
  body: string
  createdAt: string
}

/** Mural com mensagens, para a caixa de entrada */
export interface TeamWall {
  projectId: string
  projectName: string
  unread: number
  lastBody: string
  lastAt: string
  lastSenderName: string
  total: number
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
  maxMembers: number | null
  pendingInvites: number
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
  isAdmin: boolean
  blocked: boolean
  confirmed: boolean
  ownedProjects: number
}

/** Regras de acesso ao sistema (área do administrador) */
export interface AccessLists {
  domains: { domain: string; note: string; createdAt: string; users: number }[]
  emails: { email: string; note: string; createdAt: string; registered: boolean }[]
  admins: { email: string; registered: boolean; confirmed: boolean; me: boolean }[]
}

export type TaskDraft = Omit<Task, 'id' | 'createdAt' | 'createdBy' | 'position' | 'checklist'>

export interface AdminDefaults {
  expiresAt: string | null
  driveExport: boolean
  maxMembers: number | null
}
