'use client'

// Uma conversa entre o administrador e um integrante, dentro de um projeto.
// Marca como lidas as mensagens recebidas assim que a conversa é aberta.

import { useCallback, useEffect, useRef, useState } from 'react'
import { friendlyError } from '../data/repo'
import { useAuth } from '../state/AuthProvider'
import type { Message } from '../types'

interface Props {
  projectId: string
  userId: string // integrante dono da conversa
  title: string
  subtitle?: string
  tasks?: { id: number; title: string }[]
  initialTaskId?: number | null
  emptyText?: string
}

export function Thread({ projectId, userId, title, subtitle, tasks = [], initialTaskId = null, emptyText }: Props) {
  const { repo, session, refreshInbox } = useAuth()
  const [msgs, setMsgs] = useState<Message[] | null>(null)
  const [body, setBody] = useState('')
  const [taskId, setTaskId] = useState<number | null>(initialTaskId)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const me = session?.user.id

  const load = useCallback(async () => {
    if (!repo) return
    try {
      const list = await repo.thread(projectId, userId)
      setMsgs(list)
      const incoming = list.some((m) => !m.readAt && m.senderId !== me)
      if (incoming) {
        await repo.markRead(projectId, userId)
        void refreshInbox()
      }
    } catch (e) {
      setError(friendlyError(e))
    }
  }, [repo, projectId, userId, me, refreshInbox])

  useEffect(() => {
    setMsgs(null)
    setTaskId(initialTaskId)
    void load()
    if (!repo) return
    let t: number | undefined
    const off = repo.subscribeMessages(() => {
      window.clearTimeout(t)
      t = window.setTimeout(() => void load(), 200)
    })
    return () => {
      off()
      window.clearTimeout(t)
    }
  }, [repo, load, initialTaskId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [msgs?.length])

  const send = async () => {
    const text = body.trim()
    if (!text || !repo) return
    setSending(true)
    setError(null)
    try {
      await repo.sendMessage(projectId, userId, text, taskId)
      setBody('')
      setTaskId(null)
      await load()
      void refreshInbox()
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setSending(false)
    }
  }

  const taskTitle = (id: number | null) => tasks.find((t) => t.id === id)?.title
  let lastDay = ''

  return (
    <section className="thread" aria-label={`Conversa: ${title}`}>
      <header className="thread-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </header>

      <div className="thread-body">
        {msgs === null ? (
          <p className="empty">Carregando conversa…</p>
        ) : msgs.length === 0 ? (
          <p className="empty">{emptyText ?? 'Nenhuma mensagem ainda.'}</p>
        ) : (
          msgs.map((m) => {
            const mine = m.senderId === me
            const day = new Date(m.createdAt).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
            const showDay = day !== lastDay
            lastDay = day
            return (
              <div key={m.id} className="msg-wrap">
                {showDay && <div className="day-sep"><span>{day}</span></div>}
                <div className={`msg ${mine ? 'mine' : 'theirs'}`}>
                  {m.taskId && taskTitle(m.taskId) && <div className="msg-task">Sobre: {taskTitle(m.taskId)}</div>}
                  <div className="msg-body">{m.body}</div>
                  <div className="msg-meta">
                    {new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    {mine && <span className={m.readAt ? 'read' : ''}>{m.readAt ? ' · Lida' : ' · Enviada'}</span>}
                    {!mine && !m.readAt && <span className="new"> · Nova</span>}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={endRef} />
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        {error && <p className="form-error">{error}</p>}
        {tasks.length > 0 && (
          <select id={`msg-task-${userId}`} className="input" value={taskId ?? ''} onChange={(e) => setTaskId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Mensagem geral do projeto</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>Sobre a tarefa: {t.title}</option>
            ))}
          </select>
        )}
        <div className="composer-row">
          <textarea
            id={`msg-body-${userId}`}
            className="input"
            rows={2}
            placeholder="Escreva uma mensagem"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void send()
            }}
          />
          <button type="submit" className="btn primary" disabled={sending || !body.trim()}>
            {sending ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
        <span className="hint">Ctrl + Enter envia</span>
      </form>
    </section>
  )
}
