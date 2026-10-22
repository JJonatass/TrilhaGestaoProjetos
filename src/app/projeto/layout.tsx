'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { ExportButtons } from '../../components/ExportButtons'
import { Badge, Toast } from '../../components/ui'
import { daysLeft, expiryLabel, formatDate, WARN_DAYS } from '../../lib/expiry'
import { today } from '../../lib/dates'
import { useAuth } from '../../state/AuthProvider'
import { ProjectProvider, useProject } from '../../state/ProjectProvider'
import { ROLE_LABEL } from '../../types'
import { TaskEditor } from '../../views/TaskEditor'

const TABS = [
  { path: '/projeto', label: 'Quadro' },
  { path: '/projeto/planejamento', label: 'Planejamento' },
  { path: '/projeto/cronograma', label: 'Cronograma' },
  { path: '/projeto/metricas', label: 'Métricas' },
  { path: '/projeto/painel', label: 'Painel' },
  { path: '/projeto/equipe', label: 'Equipe' },
  { path: '/projeto/mensagens', label: 'Mensagens' },
]

export default function ProjetoLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="loading">Abrindo projeto…</div>}>
      <WithId>{children}</WithId>
    </Suspense>
  )
}

function WithId({ children }: { children: React.ReactNode }) {
  const id = useSearchParams().get('id')
  if (!id) {
    return (
      <div className="page narrow">
        <p>Projeto não informado. <Link href="/">Voltar para meus projetos</Link></p>
      </div>
    )
  }
  return (
    <ProjectProvider projectId={id}>
      <Frame>{children}</Frame>
    </ProjectProvider>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  const p = useProject()
  const { inbox, walls } = useAuth()
  const pathname = (usePathname() || '/').replace(/\/$/, '')
  const params = useSearchParams()
  // link de aviso (?tarefa=123) abre a tarefa direto
  const taskParam = params.get('tarefa')
  const loaded = !!p.snap
  const { openTask } = p
  useEffect(() => {
    if (loaded && taskParam) openTask(Number(taskParam))
  }, [loaded, taskParam, openTask])
  const [name, setName] = useState('')
  useEffect(() => setName(p.snap?.meta.name ?? ''), [p.snap?.meta.name])

  if (p.error && !p.snap) {
    return (
      <div className="page narrow">
        <h1>Não foi possível abrir o projeto</h1>
        <p className="hint">{p.error}</p>
        <Link href="/" className="btn">Voltar para meus projetos</Link>
      </div>
    )
  }
  if (!p.snap) return <div className="loading">Abrindo projeto…</div>

  const unread =
    inbox.filter((t) => t.projectId === p.projectId).reduce((s, t) => s + t.unread, 0) +
    (walls.find((w) => w.projectId === p.projectId)?.unread ?? 0)
  const late = p.snap.tasks.filter((t) => t.status !== 'done' && t.due && t.due < today()).length

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <Link href={p.isAdminView ? '/admin/' : '/'} className="crumb">{p.isAdminView ? 'Administração' : 'Projetos'} /</Link>
          {p.isOwner ? (
            <input
              id="project-name"
              className="project-name"
              aria-label="Nome do projeto"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name !== p.snap!.meta.name && void p.updateProject({ name: name.trim() })}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          ) : (
            <h1 className="project-title">{p.snap.meta.name}</h1>
          )}
          {p.role && <span className={`role-tag ${p.role}`}>{ROLE_LABEL[p.role]}</span>}
        </div>
        <div className="top-actions">
          <ExportButtons />
          {p.canEdit && (
            <button type="button" className="btn primary" onClick={() => p.newTask('todo')}>+ Tarefa</button>
          )}
        </div>
        <nav className="tabs" aria-label="Visões do projeto">
          {TABS.map((t) => (
            <Link key={t.path} href={`${t.path}/?id=${p.projectId}`} className="tab" aria-current={pathname === t.path ? 'page' : undefined}>
              {t.label}
              {t.path === '/projeto' && <small>{p.snap!.tasks.length}</small>}
              {t.path === '/projeto/painel' && late > 0 && <small style={{ color: 'var(--late)' }}>{late} atrasada{late > 1 ? 's' : ''}</small>}
              {t.path === '/projeto/equipe' && <small>{p.snap!.members.length}</small>}
              {t.path === '/projeto/mensagens' && <Badge n={unread} />}
            </Link>
          ))}
        </nav>
      </header>
      {(() => {
        const d = daysLeft(p.snap!.meta.expiresAt)
        if (d === null || d > WARN_DAYS) return null
        return (
          <div className={`expiry-bar ${d > 3 ? 'soon' : ''}`} role="status">
            <span>
              <strong>{expiryLabel(p.snap!.meta.expiresAt)}</strong> ({formatDate(p.snap!.meta.expiresAt)}), por prazo definido pelo administrador.
              {' '}Baixe o relatório em PDF{p.snap!.meta.driveExportAllowed ? ' ou salve uma cópia no seu Google Drive' : ''} pelos botões acima.
            </span>
          </div>
        )
      })()}
      {p.isAdminView && (
        <div className="sample-note">
          <span><strong>Visão do administrador.</strong> Você vê o projeto como leitura e pode escrever no mural da equipe ou comentar com cada integrante na aba Mensagens.</span>
        </div>
      )}
      {!p.isAdminView && p.role === 'viewer' && (
        <div className="sample-note"><span>Você é <strong>leitor</strong> neste projeto: pode acompanhar tudo, mas não editar.</span></div>
      )}
      <main className="main">{children}</main>
      {p.editing && <TaskEditor key={`${p.editing.id ?? 'nova'}`} />}
      <Toast text={p.toast} onClose={() => p.setToast(null)} />
    </>
  )
}
