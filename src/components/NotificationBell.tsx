'use client'

// Sino de avisos: @menções e comentários nas tarefas em que sou responsável.

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../state/AuthProvider'
import { Badge, timeAgo } from './ui'

export function NotificationBell() {
  const { notifications, unreadNotifications, repo, refreshInbox } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const markAll = async () => {
    if (!repo) return
    await repo.markNotificationsRead(null)
    await refreshInbox()
  }

  return (
    <div className="bell-wrap" ref={ref}>
      <button
        type="button"
        className="bell"
        aria-expanded={open}
        aria-label={unreadNotifications ? `Avisos: ${unreadNotifications} não lido(s)` : 'Avisos'}
        title="Avisos"
        onClick={() => setOpen(!open)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
          <path d="M12 3a6 6 0 0 0-6 6v3.6L4.3 15.4A1 1 0 0 0 5.1 17h13.8a1 1 0 0 0 .8-1.6L18 12.6V9a6 6 0 0 0-6-6Zm0 18a2.5 2.5 0 0 0 2.4-2h-4.8A2.5 2.5 0 0 0 12 21Z" fill="currentColor" />
        </svg>
        <Badge n={unreadNotifications} />
      </button>
      {open && (
        <div className="pop bell-pop" role="dialog" aria-label="Avisos">
          <div className="bell-head">
            <strong>Avisos</strong>
            <span className="spacer" />
            {unreadNotifications > 0 && <button type="button" className="link" onClick={() => void markAll()}>marcar todos como lidos</button>}
          </div>
          {notifications.length === 0 ? (
            <p className="hint" style={{ margin: 8 }}>Nenhum aviso. Quando alguém mencionar você com @ ou comentar numa tarefa sua, aparece aqui.</p>
          ) : (
            <ul className="bell-list">
              {notifications.slice(0, 20).map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`bell-item ${n.readAt ? '' : 'unread'}`}
                    onClick={() => {
                      setOpen(false)
                      if (!n.readAt && repo) void repo.markNotificationsRead([n.id]).then(() => refreshInbox())
                      if (n.taskId) router.push(`/projeto/?id=${n.projectId}&tarefa=${n.taskId}`)
                    }}
                  >
                    <span className="bell-line">
                      <b>{n.actorName}</b> {n.kind === 'mention' ? 'mencionou você em' : 'comentou em'} <b>{n.taskTitle}</b>
                    </span>
                    {n.excerpt && <span className="bell-excerpt">“{n.excerpt}”</span>}
                    <span className="hint">{n.projectName} · {timeAgo(n.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
