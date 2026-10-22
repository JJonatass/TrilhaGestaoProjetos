// Contrato de acesso a dados. O app inteiro fala só com esta interface.
// - supabaseRepo: banco real, com login, regras de acesso e tempo real.
// - demoRepo: dados fictícios no navegador, para aulas e testes sem conta.

import type {
  AccessLists, Activity, AdminDefaults, AdminProject, AppNotification, ChecklistItem, Epic, FilterQuery, Label,
  SprintReport, TaskComment, TeamMessage, TeamWall, AdminUser, InboxThread, Message, PendingInvite, Profile, ProjectMeta,
  ProjectSummary, Role, Snapshot, Sprint, StatusId, Task, TaskDraft,
} from '../types'

export interface Session {
  user: Profile
  isAdmin: boolean
}

export type Unsubscribe = () => void

export interface Repo {
  readonly mode: 'supabase' | 'demo'

  // ---- conta ----
  getSession(): Promise<Session | null>
  onAuthChange(cb: (s: Session | null) => void): Unsubscribe
  signIn(email: string, password: string): Promise<void>
  /** Retorna true quando o Supabase exige confirmar o e-mail antes de entrar. */
  signUp(email: string, password: string, fullName: string): Promise<{ needsConfirmation: boolean }>
  signOut(): Promise<void>
  resetPassword(email: string): Promise<void>
  updateProfile(fullName: string): Promise<void>
  /** Só no modo demonstração: trocar de pessoa para testar papéis. */
  demoUsers?(): Profile[]
  demoSwitch?(userId: string): Promise<void>

  // ---- projetos ----
  listProjects(): Promise<ProjectSummary[]>
  createProject(name: string, withSample: boolean): Promise<string>
  myInvites(): Promise<PendingInvite[]>
  acceptInvite(id: string): Promise<string>
  declineInvite(id: string): Promise<void>

  // ---- um projeto ----
  loadProject(id: string): Promise<Snapshot>
  subscribeProject(id: string, onChange: () => void): Unsubscribe
  updateProject(id: string, patch: Partial<Pick<ProjectMeta, 'name' | 'wip' | 'selfAssign' | 'columns'>>): Promise<void>
  deleteProject(id: string): Promise<void>

  createTask(projectId: string, draft: TaskDraft): Promise<number>
  updateTask(projectId: string, id: number, patch: Partial<TaskDraft & { position: number }>): Promise<void>
  /** columnKey: coluna personalizada de destino (null nas colunas padrão) */
  moveTask(projectId: string, id: number, status: StatusId, position: number, columnKey?: string | null): Promise<void>
  deleteTask(projectId: string, id: number): Promise<void>
  setAssignee(projectId: string, taskId: number, userId: string, on: boolean): Promise<void>
  setDependencies(projectId: string, taskId: number, deps: number[]): Promise<void>

  setLabels(projectId: string, taskId: number, labelIds: number[]): Promise<void>

  // checklist (subtarefas)
  addChecklistItem(projectId: string, taskId: number, title: string): Promise<void>
  updateChecklistItem(projectId: string, id: number, patch: Partial<Pick<ChecklistItem, 'title' | 'done' | 'position'>>): Promise<void>
  deleteChecklistItem(projectId: string, id: number): Promise<void>

  // épicos e rótulos
  addEpic(projectId: string, e: Omit<Epic, 'id'>): Promise<void>
  updateEpic(projectId: string, e: Epic): Promise<void>
  deleteEpic(projectId: string, id: number): Promise<void>
  addLabel(projectId: string, l: Omit<Label, 'id'>): Promise<void>
  updateLabel(projectId: string, l: Label): Promise<void>
  deleteLabel(projectId: string, id: number): Promise<void>

  // comentários e atividade de uma tarefa
  /** false no modo arquivo (sem servidor) */
  supportsComments?: boolean
  listComments(projectId: string, taskId: number): Promise<TaskComment[]>
  addComment(projectId: string, taskId: number, body: string, mentions: string[]): Promise<void>
  deleteComment(projectId: string, id: number): Promise<void>
  listActivity(projectId: string, taskId: number): Promise<Activity[]>

  // filtros salvos
  addFilter(projectId: string, name: string, query: FilterQuery, shared: boolean): Promise<void>
  updateFilter(projectId: string, id: number, patch: { name?: string; query?: FilterQuery; shared?: boolean }): Promise<void>
  deleteFilter(projectId: string, id: number): Promise<void>

  // notificações (@menções e comentários nas minhas tarefas)
  notifications(): Promise<AppNotification[]>
  markNotificationsRead(ids: number[] | null, taskId?: number): Promise<void>

  addSprint(projectId: string, s: Omit<Sprint, 'id' | 'closedAt' | 'report'>): Promise<void>
  updateSprint(projectId: string, s: Sprint): Promise<void>
  deleteSprint(projectId: string, id: number): Promise<void>
  /** Encerra o sprint e leva o que sobrou para nextId (ou para fora de sprint) */
  closeSprint(projectId: string, id: number, nextId: number | null): Promise<SprintReport>
  reopenSprint(projectId: string, id: number): Promise<void>

  invite(projectId: string, email: string, role: Role): Promise<void>
  cancelInvite(projectId: string, inviteId: string): Promise<void>
  changeRole(projectId: string, userId: string, role: Role): Promise<void>
  removeMember(projectId: string, userId: string): Promise<void>

  // ---- mensagens ----
  inbox(): Promise<InboxThread[]>
  thread(projectId: string, userId: string): Promise<Message[]>
  sendMessage(projectId: string, userId: string, body: string, taskId: number | null): Promise<void>
  markRead(projectId: string, userId: string): Promise<void>
  subscribeMessages(onChange: () => void): Unsubscribe

  // ---- mural da equipe ----
  teamInbox(): Promise<TeamWall[]>
  teamThread(projectId: string): Promise<TeamMessage[]>
  sendTeamMessage(projectId: string, body: string, taskId: number | null): Promise<void>
  markTeamRead(projectId: string): Promise<void>

  // ---- administrador ----
  adminProjects(): Promise<AdminProject[]>
  adminUsers(): Promise<AdminUser[]>
  /** ids nulo = todos os projetos; date nulo = sem prazo */
  adminSetExpiry(ids: string[] | null, date: string | null): Promise<number>
  adminSetDriveExport(ids: string[] | null, allowed: boolean): Promise<number>
  adminSetMaxMembers(ids: string[] | null, max: number | null): Promise<number>
  adminGetDefaults(): Promise<AdminDefaults>
  adminSetDefaults(d: AdminDefaults): Promise<void>

  // ---- acesso ao sistema ----
  /** Consulta sem login: este e-mail pode se cadastrar? (e quais domínios são aceitos) */
  canSignUp(email: string): Promise<{ allowed: boolean; domains: string[] }>
  adminAccess(): Promise<AccessLists>
  adminAddDomain(domain: string, note: string): Promise<void>
  adminUpdateDomain(oldDomain: string, domain: string, note: string): Promise<void>
  adminRemoveDomain(domain: string): Promise<void>
  adminAddEmail(email: string, note: string): Promise<void>
  adminRemoveEmail(email: string): Promise<void>
  adminAddAdmin(email: string): Promise<void>
  adminRemoveAdmin(email: string): Promise<void>
  adminSetBlocked(userId: string, blocked: boolean): Promise<void>
  adminDeleteUser(userId: string): Promise<void>
}

export type { Task }

let instance: Repo | null = null

export const isDemo = () =>
  process.env.NEXT_PUBLIC_DEMO === '1' || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export async function getRepo(): Promise<Repo> {
  if (instance) return instance
  if (isDemo()) {
    const { createDemoRepo } = await import('./demoRepo')
    instance = createDemoRepo()
  } else {
    const { createSupabaseRepo } = await import('./supabaseRepo')
    instance = createSupabaseRepo()
  }
  return instance
}

/** Traduz mensagens de erro comuns do Supabase para português. */
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  const map: [RegExp, string][] = [
    [/Invalid login credentials/i, 'E-mail ou senha incorretos.'],
    [/Email not confirmed/i, 'Confirme seu e-mail pelo link que enviamos antes de entrar.'],
    [/User already registered/i, 'Já existe uma conta com este e-mail. Entre com sua senha.'],
    [/Password should be at least/i, 'A senha precisa ter pelo menos 6 caracteres.'],
    [/row-level security|permission denied/i, 'Você não tem permissão para fazer isso neste projeto.'],
    [/duplicate key.*project_invites/i, 'Este e-mail já foi convidado.'],
    [/max_members_check|default_max_members_check/i, 'O limite de integrantes precisa ser um número entre 1 e 200.'],
    [/Database error saving new user|Cadastro não permitido/i, 'Cadastro não permitido para este e-mail. Use o seu e-mail institucional ou peça ao professor para liberar o seu e-mail.'],
    [/admin_delete_user/i, 'A exclusão de contas ainda não foi ativada no banco. Por enquanto, bloqueie a conta aqui ou exclua pelo painel do Supabase (Authentication → Users).'],
    [/User is banned/i, 'Esta conta está bloqueada. Fale com o administrador do sistema.'],
    [/Failed to fetch|NetworkError/i, 'Sem conexão com o servidor. Verifique a internet e tente de novo.'],
    [/rate limit/i, 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.'],
  ]
  for (const [re, pt] of map) if (re.test(msg)) return pt
  return msg
}
