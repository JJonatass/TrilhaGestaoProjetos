'use client'

// Caixa de mensagens: lista de conversas à esquerda, conversa aberta à direita.
// Integrantes veem as conversas com o administrador; o admin vê todas.

import Link from 'next/link'
import { useState } from 'react'
import { useAuth } from '../state/AuthProvider'
import { Badge, initials, timeAgo } from './ui'
import { Thread } from './Thread'

export function InboxView() {
  const { inbox, session, unread } = useAuth()
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
              ? 'Conversas com os integrantes dos projetos. Cada conversa fica registrada no projeto do aluno.'
              : 'Comentários do administrador sobre os seus projetos. Você pode responder por aqui.'}
          </p>
        </div>
        {unread > 0 && <span className="pill warn">{unread} não lida{unread > 1 ? 's' : ''}</span>}
      </div>

      <div className={`inbox ${current ? 'has-open' : ''}`}>
        <nav className="inbox-list" aria-label="Conversas">
          {inbox.length === 0 && (
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
