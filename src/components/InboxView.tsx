'use client'

// Caixa de mensagens: lista de conversas à esquerda, conversa aberta à direita.
// Integrantes veem as conversas com o administrador; o admin vê todas.

import Link from 'next/link'
import { useState } from 'react'
import { useAuth } from '../state/AuthProvider'
import { Badge, initials, timeAgo } from './ui'
import { Thread } from './Thread'

export function InboxView() {
  const { inbox, walls, session, unread } = useAuth()
  const [open, setOpen] = useState<string | null>(null)
  const isAdmin = !!session?.isAdmin
  const key = (p: string, u: string) => `${p}|${u}`
  const current = inbox.find((t) => key(t.projectId, t.userId) === open) ?? null

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Mensagens</h1>
          <p className="hint">
            {isAdmin
              ? 'Murais das equipes e conversas individuais com os integrantes. Tudo fica registrado no projeto.'
              : 'Murais das suas equipes e a conversa privada com o professor em cada projeto.'}
          </p>
        </div>
        {unread > 0 && <span className="pill warn">{unread} não lida{unread > 1 ? 's' : ''}</span>}
      </div>

      <div className={`inbox ${current ? 'has-open' : ''}`}>
        <nav className="inbox-list" aria-label="Conversas">
          {walls.length > 0 && <p className="inbox-group">Murais das equipes</p>}
          {walls.map((w) => (
            <Link key={`mural-${w.projectId}`} href={`/projeto/mensagens/?id=${w.projectId}`} className={`inbox-item ${w.unread ? 'unread' : ''}`}>
              <span className="avatar wall" aria-hidden>{initials(w.projectName)}</span>
              <span className="inbox-text">
                <span className="inbox-top">
                  <strong>{w.projectName}</strong>
                  <time>{timeAgo(w.lastAt)}</time>
                </span>
                <span className="inbox-project">Mural da equipe · {w.total} mensage{w.total === 1 ? 'm' : 'ns'}</span>
                <span className="inbox-last">{w.lastSenderName}: {w.lastBody}</span>
              </span>
              <Badge n={w.unread} />
            </Link>
          ))}
          {walls.length > 0 && inbox.length > 0 && <p className="inbox-group">{isAdmin ? 'Conversas individuais' : 'Conversas com o professor'}</p>}
          {inbox.length === 0 && walls.length === 0 && (
            <p className="empty">
              {isAdmin ? (
                <>Nenhuma conversa ainda. Abra um projeto no <Link href="/admin/">painel do administrador</Link> para comentar com os integrantes.</>
              ) : (
                <>Nenhuma mensagem. Quando o administrador comentar algo em um projeto seu, aparece aqui.</>
              )}
            </p>
          )}
          {inbox.map((t) => {
            const k = key(t.projectId, t.userId)
            const fromMe = t.lastSender === session?.user.id
            return (
              <button key={k} type="button" className={`inbox-item ${open === k ? 'active' : ''} ${t.unread ? 'unread' : ''}`} onClick={() => setOpen(k)}>
                <span className="avatar">{initials(isAdmin ? t.userName : 'Admin')}</span>
                <span className="inbox-text">
                  <span className="inbox-top">
                    <strong>{isAdmin ? t.userName : 'Administrador'}</strong>
                    <time>{timeAgo(t.lastAt)}</time>
                  </span>
                  <span className="inbox-project">{t.projectName}</span>
                  <span className="inbox-last">{fromMe ? 'Você: ' : ''}{t.lastBody}</span>
                  {isAdmin && t.unreadOther > 0 && <span className="inbox-pending">Aluno ainda não leu {t.unreadOther}</span>}
                </span>
                <Badge n={t.unread} />
              </button>
            )
          })}
        </nav>
        <div className="inbox-open">
          {current ? (
            <>
              <button type="button" className="btn small back" onClick={() => setOpen(null)}>← Conversas</button>
              <Thread
                key={open!}
                projectId={current.projectId}
                userId={current.userId}
                title={isAdmin ? current.userName : 'Administrador'}
                subtitle={`Projeto: ${current.projectName}`}
              />
              <Link className="btn small" href={`/projeto/?id=${current.projectId}`} style={{ alignSelf: 'flex-start' }}>
                Abrir o projeto
              </Link>
            </>
          ) : (
            <p className="empty">Escolha uma conversa.</p>
          )}
        </div>
      </div>
    </div>
  )
}
