'use client'

// Mural da equipe: conversa do grupo do projeto. Todos os integrantes e o
// administrador leem e escrevem; cada mensagem mostra quem escreveu.

import { useCallback, useEffect, useRef, useState } from 'react'
import { friendlyError } from '../data/repo'
import { useAuth } from '../state/AuthProvider'
import type { TeamMessage } from '../types'
import { initials } from './ui'

interface Props {
  projectId: string
  projectName: string
  tasks?: { id: number; title: string }[]
  /** quantas pessoas leem o mural (para o subtítulo) */
  members?: number
}

export function TeamWall({ projectId, projectName, tasks = [], members }: Props) {
  const { repo, session, refreshInbox, walls } = useAuth()
  const [msgs, setMsgs] = useState<TeamMessage[] | null>(null)
  const [body, setBody] = useState('')
  const [taskId, setTaskId] = useState<number | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const me = session?.user.id
  const unreadHere = walls.find((w) => w.projectId === projectId)?.unread ?? 0

  const load = useCallback(async () => {
    if (!repo) return
    try {
      setMsgs(await repo.teamThread(projectId))
    } catch (e) {
      setError(friendlyError(e))
    }
  }, [repo, projectId])

  // ao abrir (e quando chega mensagem nova), marca o mural como lido
  useEffect(() => {
    if (!repo || unreadHere === 0) return
    void repo.markTeamRead(projectId).then(() => refreshInbox())
  }, [repo, projectId, unreadHere, refreshInbox])

  useEffect(() => {
    setMsgs(null)
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
  }, [repo, load])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [msgs?.length])

  const send = async () => {
    const text = body.trim()
    if (!text || !repo) return
    setSending(true)
    setError(null)
    try {
      await repo.sendTeamMessage(projectId, text, taskId)
      setBody('')
      setTaskId(null)
      await load()
      await repo.markTeamRead(projectId)
      void refreshInbox()
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setSending(false)
    }
  }

  const taskTitle = (id: number | null) => tasks.find((t) => t.id === id)?.title
  let lastDay = ''
  let prev: TeamMessage | null = null

  return (
    <section className="thread team-wall" aria-label={`Mural da equipe: ${projectName}`}>
      <header className="thread-head">
        <div>
          <h2>Mural da equipe</h2>
          <p>
            Conversa do grupo de <b>{projectName}</b>. Todos os integrantes{members ? ` (${members})` : ''} e o professor leem e escrevem aqui.
          </p>
        </div>
      </header>

      <div className="thread-body">
        {msgs === null ? (
          <p className="empty">Carregando mural…</p>
        ) : msgs.length === 0 ? (
          <p className="empty">Nenhuma mensagem no mural ainda. Combine reuniões, avise o que travou ou compartilhe links com a equipe.</p>
        ) : (
          msgs.map((m) => {
            const mine = m.senderId === me
            const day = new Date(m.createdAt).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
            const showDay = day !== lastDay
            // agrupa mensagens seguidas da mesma pessoa (até 5 minutos de intervalo)
            const grouped = !showDay && prev?.senderId === m.senderId && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000
            lastDay = day
            prev = m
            return (
              <div key={m.id} className="msg-wrap">
                {showDay && <div className="day-sep"><span>{day}</span></div>}
                <div className={`wall-row ${mine ? 'mine' : 'theirs'} ${grouped ? 'grouped' : ''}`}>
                  {!mine && (
                    <span className={`avatar ${m.senderIsAdmin ? 'admin' : ''}`} aria-hidden style={{ visibility: grouped ? 'hidden' : undefined }}>
                      {initials(m.senderName)}
                    </span>
                  )}
                  <div className={`msg ${mine ? 'mine' : 'theirs'}`}>
                    {!mine && !grouped && (
                      <div className="msg-author">
                        {m.senderName}
                        {m.senderIsAdmin && <span className="role-tag owner">Professor</span>}
                      </div>
                    )}
                    {m.taskId && taskTitle(m.taskId) && <div className="msg-task">Sobre: {taskTitle(m.taskId)}</div>}
                    <div className="msg-body">{m.body}</div>
                    <div className="msg-meta">
                      {new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
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
          <select id="wall-task" className="input" value={taskId ?? ''} onChange={(e) => setTaskId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Mensagem geral para a equipe</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>Sobre a tarefa: {t.title}</option>
            ))}
          </select>
        )}
        <div className="composer-row">
          <textarea
            id="wall-body"
            className="input"
            rows={2}
            placeholder="Escreva para a equipe"
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
