'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { friendlyError } from '../data/repo'
import { useAuth } from '../state/AuthProvider'
import { ROLE_LABEL, type PendingInvite, type ProjectSummary } from '../types'
import { Field, timeAgo } from '../components/ui'
import { daysLeft, WARN_DAYS } from '../lib/expiry'

export default function ProjetosPage() {
  const { repo, inbox } = useAuth()
  const router = useRouter()
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [invites, setInvites] = useState<PendingInvite[]>([])
  const [name, setName] = useState('')
  const [sample, setSample] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!repo) return
    try {
      const [p, i] = await Promise.all([repo.listProjects(), repo.myInvites()])
      setProjects(p)
      setInvites(i)
    } catch (e) {
      setError(friendlyError(e))
      setProjects([])
    }
  }, [repo])

  useEffect(() => void load(), [load])

  const create = async () => {
    if (busy) return
    if (!name.trim()) {
      setCreateError('Dê um nome ao projeto antes de criar.')
      document.getElementById('new-project-name')?.focus()
      return
    }
    if (!repo) {
      setCreateError('Sua sessão ainda está carregando. Tente de novo em instantes.')
      return
    }
    setBusy(true)
    setCreateError(null)
    try {
      const id = await repo.createProject(name.trim(), sample)
      router.push(`/projeto/?id=${id}`)
    } catch (e) {
      setCreateError(friendlyError(e))
      setBusy(false)
    }
  }

  const unreadFor = (projectId: string) => inbox.filter((t) => t.projectId === projectId).reduce((s, t) => s + t.unread, 0)

  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>Meus projetos</h1>
          <p className="hint">Projetos que você criou ou nos quais foi convidado.</p>
        </div>
        <Link href="/arquivo/" className="btn">Abrir arquivo do Drive</Link>
      </div>

      {invites.length > 0 && (
        <section className="panel invites">
          <h2>Convites pendentes</h2>
          {invites.map((i) => (
            <div key={i.id} className="invite-row">
              <div>
                <strong>{i.projectName}</strong>
                <div className="hint">{i.invitedByName} convidou você como {ROLE_LABEL[i.role].toLowerCase()} · {timeAgo(i.createdAt)}</div>
              </div>
              <div className="toolbar" style={{ margin: 0 }}>
                <button
                  type="button"
                  className="btn primary small"
                  onClick={async () => {
                    try {
                      const pid = await repo!.acceptInvite(i.id)
                      router.push(`/projeto/?id=${pid}`)
                    } catch (e) {
                      setError(friendlyError(e))
                    }
                  }}
                >
                  Aceitar
                </button>
                <button type="button" className="btn small" onClick={async () => { await repo!.declineInvite(i.id); void load() }}>
                  Recusar
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {error && <p className="form-error">{error}</p>}

      {projects === null ? (
        <p className="empty">Carregando projetos…</p>
      ) : (
        <div className="project-grid">
          {projects.map((p) => {
            const pct = p.tasks ? Math.round((p.done / p.tasks) * 100) : 0
            const n = unreadFor(p.id)
            return (
              <Link key={p.id} href={`/projeto/?id=${p.id}`} className="project-card">
                <div className="project-card-top">
                  <span className={`role-tag ${p.role}`}>{ROLE_LABEL[p.role]}</span>
                  {n > 0 && <span className="pill warn">{n} mensagem{n > 1 ? 's' : ''}</span>}
                  {(() => {
                    const d = daysLeft(p.expiresAt)
                    if (d === null) return null
                    return (
                      <span className={`pill ${d <= WARN_DAYS ? 'warn' : 'time'}`} title={`Prazo: ${new Date(p.expiresAt!).toLocaleDateString('pt-BR')}`}>
                        {d < 0 ? 'Prazo encerrado' : d === 0 ? 'Apagado hoje' : `Expira em ${d} d`}
                      </span>
                    )
                  })()}
                </div>
                <h2>{p.name}</h2>
                <p className="hint">{p.role === 'owner' ? 'Criado por você' : `Criado por ${p.ownerName}`} · {p.members} integrante{p.members > 1 ? 's' : ''}</p>
                <div className="meter" aria-label={`${pct}% das tarefas concluídas`}>
                  <i style={{ width: `${pct}%`, background: 'var(--st-done)' }} />
                </div>
                <p className="mono hint" style={{ margin: 0 }}>{p.done} de {p.tasks} tarefas concluídas</p>
              </Link>
            )
          })}

          <form
            className="project-card new"
            onSubmit={(e) => {
              e.preventDefault()
              void create()
            }}
          >
            <h2>Novo projeto</h2>
            <Field id="new-project-name" label="Nome" hint="O nome do produto ou da solução que a equipe vai construir. Pode ser alterado depois, clicando no nome dentro do projeto.">
              <input id="new-project-name" className="input" placeholder="Ex.: App de caronas da FICR" value={name} onChange={(e) => { setName(e.target.value); setCreateError(null) }} />
            </Field>
            <Field id="new-project-sample" label="Conteúdo inicial" hint="Cria 20 tarefas fictícias, da ideação ao fim do ciclo, com sprints e histórico, para ver o quadro e os gráficos funcionando. Você pode apagá-las depois.">
              <label className="check">
                <input id="new-project-sample" type="checkbox" checked={sample} onChange={(e) => setSample(e.target.checked)} />
                Começar com tarefas de exemplo
              </label>
            </Field>
            <button type="submit" className="btn primary" disabled={busy} aria-describedby={createError ? 'new-project-error' : undefined}>
              {busy ? 'Criando…' : 'Criar projeto'}
            </button>
            {createError && <p id="new-project-error" className="form-error" role="alert" style={{ margin: 0 }}>{createError}</p>}
          </form>
        </div>
      )}
    </div>
  )
}
