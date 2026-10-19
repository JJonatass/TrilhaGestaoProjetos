// Implementação com Supabase. Toda a segurança está no banco (RLS):
// este arquivo só monta consultas; o que o usuário não pode ver ou mudar,
// o Postgres recusa.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  AccessLists, TeamMessage, TeamWall,
  AdminDefaults, AdminProject, AdminUser, InboxThread, Member, Message, PendingInvite, Phase, Priority,
  ProjectSummary, Role, Snapshot, StatusId, Task, TaskDraft,
} from '../types'
import type { Repo, Session } from './repo'

type Row = Record<string, unknown>

function check<T>(res: { data: T; error: { message: string } | null } | { data: unknown; error: { message: string } }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

const taskToRow = (d: Partial<TaskDraft & { position: number }>) => {
  const r: Row = {}
  if (d.title !== undefined) r.title = d.title
  if (d.description !== undefined) r.description = d.description
  if (d.priority !== undefined) r.priority = d.priority
  if (d.points !== undefined) r.points = d.points
  if (d.status !== undefined) r.status = d.status
  if (d.phase !== undefined) r.phase = d.phase
  if (d.sprintId !== undefined) r.sprint_id = d.sprintId
  if (d.start !== undefined) r.start_date = d.start
  if (d.due !== undefined) r.due_date = d.due
  if (d.milestone !== undefined) r.milestone = d.milestone
  if (d.position !== undefined) r.position = d.position
  return r
}

export function createSupabaseRepo(): Repo {
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })

  const toSession = async (userId: string | undefined): Promise<Session | null> => {
    if (!userId) return null
    const [{ data: prof }, { data: admin }] = await Promise.all([
      sb.from('profiles').select('id, email, full_name').eq('id', userId).maybeSingle(),
      sb.rpc('is_admin'),
    ])
    const { data: u } = await sb.auth.getUser()
    return {
      user: {
        id: userId,
        email: (prof?.email as string) ?? u.user?.email ?? '',
        fullName: (prof?.full_name as string) ?? '',
      },
      isAdmin: Boolean(admin),
    }
  }

  const redirectTo = () =>
    typeof window === 'undefined' ? undefined : `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/`


  // Regra de cadastro (domínios permitidos e e-mails liberados), consultável sem login
  async function signupRule(email: string) {
    const [allowed, domains] = await Promise.all([
      sb.rpc('can_sign_up', { p_email: email.trim().toLowerCase() }),
      sb.rpc('signup_domains'),
    ])
    return {
      allowed: Boolean(check(allowed)),
      domains: ((check(domains) as unknown[]) ?? []).map((d) => (typeof d === 'string' ? d : String((d as Row).signup_domains))),
    }
  }

  return {
    mode: 'supabase',

    async getSession() {
      const { data } = await sb.auth.getSession()
      return toSession(data.session?.user.id)
    },

    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((event, session) => {
        if (event === 'TOKEN_REFRESHED') return
        // adia para fora do callback, como recomenda o supabase-js
        setTimeout(() => void toSession(session?.user.id).then(cb), 0)
      })
      return () => data.subscription.unsubscribe()
    },

    async signIn(email, password) {
      check(await sb.auth.signInWithPassword({ email, password }))
    },

    async signUp(email, password, fullName) {
      // confere a regra antes, para dar uma mensagem clara (o banco também barra)
      const rule = await signupRule(email)
      if (!rule.allowed) {
        const list = rule.domains.map((d) => '@' + d).join(', ')
        throw new Error(
          `Cadastro não permitido para este e-mail. Use o seu e-mail institucional${list ? ` (${list})` : ''} ou peça ao professor para liberar o seu e-mail.`,
        )
      }
      const data = check(
        await sb.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: redirectTo() } }),
      )
      return { needsConfirmation: !data.session }
    },

    async signOut() {
      await sb.auth.signOut()
    },

    async resetPassword(email) {
      check(await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() }))
    },

    async updateProfile(fullName) {
      const { data } = await sb.auth.getUser()
      check(await sb.from('profiles').update({ full_name: fullName }).eq('id', data.user!.id))
    },

    // ---------------- projetos ----------------

    async listProjects() {
      const { data: u } = await sb.auth.getUser()
      const me = u.user?.id
      const rows = check(
        await sb
          .from('project_members')
          .select('role, projects!inner(id, name, created_at, expires_at, owner:profiles!projects_owner_id_fkey(full_name, email), project_members(count), tasks(status))')
          .eq('user_id', me!),
      ) as unknown as Row[]
      return rows
        .map((r): ProjectSummary => {
          const p = r.projects as Row
          const owner = p.owner as Row
          const tasks = (p.tasks as Row[]) ?? []
          return {
            id: p.id as string,
            name: p.name as string,
            role: r.role as Role,
            ownerName: ((owner?.full_name as string) || (owner?.email as string)) ?? '',
            members: ((p.project_members as Row[])?.[0]?.count as number) ?? 1,
            tasks: tasks.length,
            done: tasks.filter((t) => t.status === 'done').length,
            createdAt: p.created_at as string,
            expiresAt: (p.expires_at as string | null) ?? null,
          }
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },

    async createProject(name, withSample) {
      const { data: u } = await sb.auth.getUser()
      const row = check(await sb.from('projects').insert({ name, owner_id: u.user!.id }).select('id').single()) as Row
      const id = row.id as string
      if (withSample) check(await sb.rpc('seed_sample_project', { p: id }))
      return id
    },

    async myInvites() {
      const rows = check(await sb.rpc('my_invites')) as Row[]
      return rows.map(
        (r): PendingInvite => ({
          id: r.id as string,
          projectId: r.project_id as string,
          projectName: r.project_name as string,
          role: r.role as Role,
          invitedByName: r.invited_by_name as string,
          createdAt: r.created_at as string,
        }),
      )
    },

    async acceptInvite(id) {
      return check(await sb.rpc('accept_invite', { invite_id: id })) as string
    },

    async declineInvite(id) {
      check(await sb.from('project_invites').delete().eq('id', id))
    },

    // ---------------- um projeto ----------------

    async loadProject(id) {
      const [proj, members, invites, tasks, assignees, deps, sprints, history] = await Promise.all([
        sb.from('projects').select('*').eq('id', id).single(),
        sb.from('project_members').select('user_id, role, joined_at, profiles(id, email, full_name)').eq('project_id', id),
        sb.from('project_invites').select('id, email, role, created_at').eq('project_id', id).is('accepted_at', null).order('created_at'),
        sb.from('tasks').select('*').eq('project_id', id).order('position').order('id'),
        sb.from('task_assignees').select('task_id, user_id, assigned_at').eq('project_id', id).order('assigned_at'),
        sb.from('task_dependencies').select('task_id, depends_on').eq('project_id', id),
        sb.from('sprints').select('*').eq('project_id', id).order('start_date'),
        sb.from('status_history').select('id, task_id, from_status, to_status, at, changed_by').eq('project_id', id).order('at').order('id'),
      ])
      const p = check(proj) as Row
      const asg = new Map<number, string[]>()
      for (const a of check(assignees) as Row[]) {
        const list = asg.get(a.task_id as number) ?? []
        list.push(a.user_id as string)
        asg.set(a.task_id as number, list)
      }
      const dep = new Map<number, number[]>()
      for (const d of check(deps) as Row[]) {
        const list = dep.get(d.task_id as number) ?? []
        list.push(d.depends_on as number)
        dep.set(d.task_id as number, list)
      }
      const snap: Snapshot = {
        meta: {
          id: p.id as string,
          name: p.name as string,
          ownerId: p.owner_id as string,
          wip: (p.wip as Snapshot['meta']['wip']) ?? {},
          selfAssign: p.self_assign as boolean,
          createdAt: p.created_at as string,
          expiresAt: (p.expires_at as string | null) ?? null,
          driveExportAllowed: Boolean(p.drive_export_allowed),
          maxMembers: (p.max_members as number | null) ?? null,
        },
        members: (check(members) as Row[])
          .map((m): Member => {
            const pr = (m.profiles as Row) ?? {}
            return {
              id: m.user_id as string,
              email: (pr.email as string) ?? '',
              fullName: (pr.full_name as string) ?? '',
              role: m.role as Role,
              joinedAt: m.joined_at as string,
            }
          })
          .sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.joinedAt.localeCompare(b.joinedAt))),
        invites: (invites.error ? [] : (invites.data as Row[])).map((i) => ({
          id: i.id as string,
          email: i.email as string,
          role: i.role as Role,
          createdAt: i.created_at as string,
        })),
        tasks: (check(tasks) as Row[]).map(
          (r): Task => ({
            id: r.id as number,
            title: r.title as string,
            description: r.description as string,
            assignees: asg.get(r.id as number) ?? [],
            priority: r.priority as Priority,
            points: r.points as number,
            status: r.status as StatusId,
            phase: r.phase as Phase,
            sprintId: (r.sprint_id as number | null) ?? null,
            start: (r.start_date as string | null) ?? null,
            due: (r.due_date as string | null) ?? null,
            milestone: r.milestone as boolean,
            dependsOn: dep.get(r.id as number) ?? [],
            createdAt: r.created_at as string,
            createdBy: (r.created_by as string | null) ?? null,
            position: r.position as number,
          }),
        ),
        sprints: (check(sprints) as Row[]).map((s) => ({
          id: s.id as number,
          name: s.name as string,
          start: s.start_date as string,
          end: s.end_date as string,
        })),
        history: (check(history) as Row[]).map((h) => ({
          id: h.id as number,
          taskId: h.task_id as number,
          from: (h.from_status as StatusId | null) ?? null,
          to: h.to_status as StatusId,
          at: h.at as string,
          changedBy: (h.changed_by as string | null) ?? null,
        })),
      }
      return snap
    },

    subscribeProject(id, onChange) {
      const ch = sb.channel(`projeto-${id}-${Math.random().toString(36).slice(2)}`)
      for (const table of ['tasks', 'task_assignees', 'task_dependencies', 'sprints', 'status_history', 'project_members']) {
        ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `project_id=eq.${id}` }, onChange)
      }
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter: `id=eq.${id}` }, onChange)
      ch.subscribe()
      return () => void sb.removeChannel(ch)
    },

    async updateProject(id, patch) {
      const r: Row = {}
      if (patch.name !== undefined) r.name = patch.name
      if (patch.wip !== undefined) r.wip = patch.wip
      if (patch.selfAssign !== undefined) r.self_assign = patch.selfAssign
      check(await sb.from('projects').update(r).eq('id', id))
    },

    async deleteProject(id) {
      check(await sb.from('projects').delete().eq('id', id))
    },

    async createTask(projectId, d) {
      const row = check(
        await sb.from('tasks').insert({ ...taskToRow(d), project_id: projectId, position: Date.now() / 1e6 }).select('id').single(),
      ) as Row
      const id = row.id as number
      if (d.dependsOn.length) {
        check(await sb.from('task_dependencies').insert(d.dependsOn.map((x) => ({ task_id: id, depends_on: x, project_id: projectId }))))
      }
      for (const u of d.assignees) check(await sb.from('task_assignees').insert({ task_id: id, user_id: u, project_id: projectId }))
      return id
    },

    async updateTask(_projectId, id, patch) {
      const r = taskToRow(patch)
      if (Object.keys(r).length) check(await sb.from('tasks').update(r).eq('id', id))
    },

    async moveTask(_projectId, id, status, position) {
      check(await sb.from('tasks').update({ status, position }).eq('id', id))
    },

    async deleteTask(_projectId, id) {
      check(await sb.from('tasks').delete().eq('id', id))
    },

    async setAssignee(projectId, taskId, userId, on) {
      if (on) check(await sb.from('task_assignees').insert({ task_id: taskId, user_id: userId, project_id: projectId }))
      else check(await sb.from('task_assignees').delete().eq('task_id', taskId).eq('user_id', userId))
    },

    async setDependencies(projectId, taskId, deps) {
      check(await sb.from('task_dependencies').delete().eq('task_id', taskId))
      if (deps.length) {
        check(await sb.from('task_dependencies').insert(deps.map((x) => ({ task_id: taskId, depends_on: x, project_id: projectId }))))
      }
    },

    async addSprint(projectId, s) {
      check(await sb.from('sprints').insert({ project_id: projectId, name: s.name, start_date: s.start, end_date: s.end }))
    },

    async updateSprint(_projectId, s) {
      check(await sb.from('sprints').update({ name: s.name, start_date: s.start, end_date: s.end }).eq('id', s.id))
    },

    async deleteSprint(_projectId, id) {
      check(await sb.from('sprints').delete().eq('id', id))
    },

    async invite(projectId, email, role) {
      const { data: u } = await sb.auth.getUser()
      check(await sb.from('project_invites').insert({ project_id: projectId, email: email.trim().toLowerCase(), role, invited_by: u.user!.id }))
    },

    async cancelInvite(_projectId, inviteId) {
      check(await sb.from('project_invites').delete().eq('id', inviteId))
    },

    async changeRole(projectId, userId, role) {
      check(await sb.from('project_members').update({ role }).eq('project_id', projectId).eq('user_id', userId))
    },

    async removeMember(projectId, userId) {
      check(await sb.from('project_members').delete().eq('project_id', projectId).eq('user_id', userId))
    },

    // ---------------- mensagens ----------------

    async inbox() {
      const rows = check(await sb.rpc('inbox')) as Row[]
      return rows.map(
        (r): InboxThread => ({
          projectId: r.project_id as string,
          projectName: r.project_name as string,
          userId: r.user_id as string,
          userName: r.user_name as string,
          userEmail: r.user_email as string,
          lastBody: r.last_body as string,
          lastAt: r.last_at as string,
          lastSender: r.last_sender as string,
          unread: r.unread as number,
          unreadOther: r.unread_other as number,
        }),
      )
    },

    async thread(projectId, userId) {
      const rows = check(
        await sb.from('messages').select('*').eq('project_id', projectId).eq('user_id', userId).order('created_at').order('id'),
      ) as Row[]
      return rows.map(
        (r): Message => ({
          id: r.id as number,
          projectId: r.project_id as string,
          userId: r.user_id as string,
          senderId: r.sender_id as string,
          taskId: (r.task_id as number | null) ?? null,
          body: r.body as string,
          createdAt: r.created_at as string,
          readAt: (r.read_at as string | null) ?? null,
        }),
      )
    },

    async sendMessage(projectId, userId, body, taskId) {
      check(await sb.from('messages').insert({ project_id: projectId, user_id: userId, body, task_id: taskId }))
    },

    async markRead(projectId, userId) {
      check(await sb.rpc('mark_thread_read', { p_project: projectId, p_user: userId }))
    },

    subscribeMessages(onChange) {
      const ch = sb
        .channel(`mensagens-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, onChange)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_messages' }, onChange)
        .subscribe()
      return () => void sb.removeChannel(ch)
    },

    // ---------------- mural da equipe ----------------

    async teamInbox() {
      const rows = check(await sb.rpc('team_inbox')) as Row[]
      return rows.map(
        (r): TeamWall => ({
          projectId: r.project_id as string,
          projectName: r.project_name as string,
          unread: (r.unread as number) ?? 0,
          lastBody: r.last_body as string,
          lastAt: r.last_at as string,
          lastSenderName: r.last_sender_name as string,
          total: (r.total as number) ?? 0,
        }),
      )
    },
    async teamThread(projectId) {
      const rows = check(await sb.rpc('team_thread', { p_project: projectId })) as Row[]
      return rows.map(
        (r): TeamMessage => ({
          id: r.id as number,
          projectId: r.project_id as string,
          senderId: r.sender_id as string,
          senderName: r.sender_name as string,
          senderIsAdmin: Boolean(r.sender_is_admin),
          taskId: (r.task_id as number | null) ?? null,
          body: r.body as string,
          createdAt: r.created_at as string,
        }),
      )
    },
    async sendTeamMessage(projectId, body, taskId) {
      check(await sb.from('team_messages').insert({ project_id: projectId, body, task_id: taskId }))
    },
    async markTeamRead(projectId) {
      check(await sb.rpc('mark_team_read', { p_project: projectId }))
    },

    // ---------------- administrador ----------------

    async adminProjects() {
      const rows = check(await sb.rpc('admin_projects_v3')) as Row[]
      return rows.map(
        (r): AdminProject => ({
          id: r.id as string,
          name: r.name as string,
          ownerName: r.owner_name as string,
          ownerEmail: r.owner_email as string,
          createdAt: r.created_at as string,
          members: r.members as number,
          tasks: r.tasks as number,
          done: r.done as number,
          late: r.late as number,
          pointsTotal: r.points_total as number,
          pointsDone: r.points_done as number,
          lastActivity: (r.last_activity as string | null) ?? null,
          unread: r.unread as number,
          expiresAt: (r.expires_at as string | null) ?? null,
          driveExportAllowed: Boolean(r.drive_export_allowed),
          maxMembers: (r.max_members as number | null) ?? null,
          pendingInvites: (r.pending_invites as number) ?? 0,
        }),
      )
    },

    async adminSetExpiry(ids, date) {
      return check(await sb.rpc('admin_set_expiry', { p_ids: ids, p_date: date })) as number
    },

    async adminSetDriveExport(ids, allowed) {
      return check(await sb.rpc('admin_set_drive_export', { p_ids: ids, p_allowed: allowed })) as number
    },

    async adminSetMaxMembers(ids, max) {
      return check(await sb.rpc('admin_set_max_members', { p_ids: ids, p_max: max })) as number
    },

    async adminGetDefaults(): Promise<AdminDefaults> {
      const r = check(
        await sb.from('app_settings').select('default_expires_at, default_drive_export, default_max_members').maybeSingle(),
      ) as Row | null
      return {
        expiresAt: (r?.default_expires_at as string | null) ?? null,
        driveExport: Boolean(r?.default_drive_export),
        maxMembers: (r?.default_max_members as number | null) ?? null,
      }
    },

    async adminSetDefaults(d) {
      check(await sb.rpc('admin_set_defaults', { p_expires_at: d.expiresAt, p_drive_export: d.driveExport }))
      check(await sb.rpc('admin_set_default_max_members', { p_max: d.maxMembers }))
    },

    async adminUsers() {
      const rows = check(await sb.rpc('admin_users_v2')) as Row[]
      return rows.map(
        (r): AdminUser => ({
          id: r.id as string,
          email: r.email as string,
          fullName: r.full_name as string,
          createdAt: r.created_at as string,
          lastSignInAt: (r.last_sign_in_at as string | null) ?? null,
          projects: r.projects as number,
          openTasks: r.open_tasks as number,
          unread: r.unread as number,
          isAdmin: Boolean(r.is_admin),
          blocked: Boolean(r.blocked),
          confirmed: Boolean(r.confirmed),
          ownedProjects: (r.owned_projects as number) ?? 0,
        }),
      )
    },

    // ---------------- acesso ao sistema ----------------

    canSignUp: (email) => signupRule(email),
    async adminAccess(): Promise<AccessLists> {
      const r = check(await sb.rpc('admin_access_lists')) as Row
      const arr = (x: unknown) => (Array.isArray(x) ? (x as Row[]) : [])
      return {
        domains: arr(r.domains).map((d) => ({ domain: d.domain as string, note: (d.note as string) ?? '', createdAt: d.created_at as string, users: Number(d.users) || 0 })),
        emails: arr(r.emails).map((e) => ({ email: e.email as string, note: (e.note as string) ?? '', createdAt: e.created_at as string, registered: Boolean(e.registered) })),
        admins: arr(r.admins).map((a) => ({ email: a.email as string, registered: Boolean(a.registered), confirmed: Boolean(a.confirmed), me: Boolean(a.me) })),
      }
    },
    async adminAddDomain(domain, note) { check(await sb.rpc('admin_add_domain', { p_domain: domain, p_note: note })) },
    async adminUpdateDomain(oldDomain, domain, note) { check(await sb.rpc('admin_update_domain', { p_old: oldDomain, p_domain: domain, p_note: note })) },
    async adminRemoveDomain(domain) { check(await sb.rpc('admin_remove_domain', { p_domain: domain })) },
    async adminAddEmail(email, note) { check(await sb.rpc('admin_add_email', { p_email: email, p_note: note })) },
    async adminRemoveEmail(email) { check(await sb.rpc('admin_remove_email', { p_email: email })) },
    async adminAddAdmin(email) { check(await sb.rpc('admin_add_admin', { p_email: email })) },
    async adminRemoveAdmin(email) { check(await sb.rpc('admin_remove_admin', { p_email: email })) },
    async adminSetBlocked(userId, blocked) { check(await sb.rpc('admin_set_blocked', { p_user: userId, p_blocked: blocked })) },
    async adminDeleteUser(userId) { check(await sb.rpc('admin_delete_user', { p_user: userId })) },
  }
}
