'use client'

// Sessão, papel de administrador e contagem de mensagens não lidas,
// disponíveis para todo o app.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { getRepo, type Repo, type Session } from '../data/repo'
import type { AppNotification, InboxThread, TeamWall } from '../types'

interface AuthState {
  repo: Repo | null
  session: Session | null
  loading: boolean
  inbox: InboxThread[]
  /** murais das equipes com mensagens */
  walls: TeamWall[]
  /** não lidas somando conversas privadas e murais */
  unread: number
  /** @menções e comentários nas minhas tarefas */
  notifications: AppNotification[]
  unreadNotifications: number
  refreshInbox: () => Promise<void>
  refreshSession: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [repo, setRepo] = useState<Repo | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [inbox, setInbox] = useState<InboxThread[]>([])
  const [walls, setWalls] = useState<TeamWall[]>([])
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const repoRef = useRef<Repo | null>(null)

  const refreshInbox = useCallback(async () => {
    const r = repoRef.current
    if (!r) return
    const [a, b, c] = await Promise.allSettled([r.inbox(), r.teamInbox(), r.notifications()])
    setInbox(a.status === 'fulfilled' ? a.value : [])
    setWalls(b.status === 'fulfilled' ? b.value : [])
    setNotifications(c.status === 'fulfilled' ? c.value : [])
  }, [])

  const refreshSession = useCallback(async () => {
    const r = repoRef.current
    if (r) setSession(await r.getSession())
  }, [])

  useEffect(() => {
    let off: (() => void) | undefined
    ;(async () => {
      const r = await getRepo()
      repoRef.current = r
      setRepo(r)
      setSession(await r.getSession())
      setLoading(false)
      off = r.onAuthChange((s) => setSession(s))
    })()
    return () => off?.()
  }, [])

  // Caixa de mensagens: carrega ao entrar e acompanha em tempo real
  useEffect(() => {
    if (!repo || !session) {
      setInbox([])
      setWalls([])
      setNotifications([])
      return
    }
    void refreshInbox()
    let t: number | undefined
    const off = repo.subscribeMessages(() => {
      window.clearTimeout(t)
      t = window.setTimeout(() => void refreshInbox(), 250)
    })
    const poll = window.setInterval(() => void refreshInbox(), 60_000)
    return () => {
      off()
      window.clearInterval(poll)
      window.clearTimeout(t)
    }
  }, [repo, session, refreshInbox])

  const unread = inbox.reduce((s, t) => s + t.unread, 0) + walls.reduce((s, w) => s + w.unread, 0)

  return (
    <Ctx.Provider value={{ repo, session, loading, inbox, walls, unread, notifications, unreadNotifications: notifications.filter((n) => !n.readAt).length, refreshInbox, refreshSession }}>{children}</Ctx.Provider>
  )
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return v
}
