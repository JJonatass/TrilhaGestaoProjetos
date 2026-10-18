'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Badge, initials, personName, timeAgo } from '../../components/ui'
import { friendlyError } from '../../data/repo'
import { useAuth } from '../../state/AuthProvider'

export default function PerfilPage() {
  const { repo, session, inbox, unread, refreshSession } = useAuth()
  const [name, setName] = useState(session?.user.fullName ?? '')
  const [msg, setMsg] = useState<string | null>(null)
  if (!session) return null
  const pending = inbox.filter((t) => t.unread > 0)

  return (
    <div className="page narrow">
      <div className="profile-head">
        <span className="avatar xl">{initials(personName(session.user))}</span>
        <div>
          <h1>{personName(session.user)}</h1>
          <p className="hint">{session.user.email}{session.isAdmin ? ' · Administrador do sistema' : ''}</p>
        </div>
      </div>

      <section className={`panel ${unread ? 'attention' : ''}`}>
        <div className="panel-head">
          <h2>Mensagens</h2>
          <Badge n={unread} />
          <span className="spacer" />
          <Link href="/mensagens/" className="btn small">Abrir caixa de mensagens</Link>
        </div>
        {unread === 0 ? (
          <p className="hint" style={{ margin: 0 }}>Nenhuma mensagem não lida.</p>
        ) : (
          <div className="list">
            {pending.map((t) => (
              <Link key={`${t.projectId}|${t.userId}`} href="/mensagens/" className="list-row">
                <span>
                  <span className="t">{t.projectName}</span>
                  <div className="sub">{t.lastBody}</div>
                </span>
                <span className="mono" style={{ fontSize: 12 }}>{t.unread} nova{t.unread > 1 ? 's' : ''} · {timeAgo(t.lastAt)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Dados da conta</h2>
        <form
          className="auth-form"
          onSubmit={async (e) => {
            e.preventDefault()
            try {
              await repo!.updateProfile(name.trim())
              await refreshSession()
              setMsg('Nome atualizado.')
            } catch (err) {
              setMsg(friendlyError(err))
            }
          }}
        >
          <label className="field">
            <span>Nome exibido para a equipe</span>
            <input id="profile-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="toolbar" style={{ margin: 0 }}>
            <button type="submit" className="btn primary" disabled={!name.trim()}>Salvar</button>
            {msg && <span className="hint">{msg}</span>}
          </div>
        </form>
      </section>

      <button type="button" className="btn" onClick={() => void repo?.signOut()}>Sair da conta</button>
    </div>
  )
}
