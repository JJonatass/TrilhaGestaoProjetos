'use client'

// Moldura global: barra com navegação, avisos de mensagens não lidas e
// proteção das rotas (quem não entrou vai para /entrar).

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { AuthProvider, useAuth } from '../state/AuthProvider'
import { Badge, initials, personName } from './ui'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Frame>{children}</Frame>
    </AuthProvider>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  const { session, loading, unread, repo } = useAuth()
  const pathname = (usePathname() || '/').replace(/\/$/, '') || '/'
  const router = useRouter()
  const isAuthPage = pathname === '/entrar'
  const isFilePage = pathname === '/arquivo'
  const isPublicPage = pathname === '/privacidade'

  useEffect(() => {
    if (loading || isFilePage || isPublicPage) return
    if (!session && !isAuthPage) router.replace('/entrar/')
    if (session && isAuthPage) router.replace('/')
  }, [loading, session, isAuthPage, isFilePage, isPublicPage, router])

  // Páginas públicas (política de privacidade): abrem sem login e sem moldura
  if (isPublicPage) return <>{children}</>

  // O modo arquivo funciona sem conta no sistema: só com o Google Drive do aluno
  if (isFilePage && !session) return <>{children}</>

  if (loading || (!session && !isAuthPage) || (session && isAuthPage)) {
    return (
      <div className="loading">
        Carregando…
        {/* link visível já no HTML estático: o Google confere que a página inicial aponta para a política */}
        <Link href="/privacidade/" className="loading-legal">Política de privacidade</Link>
      </div>
    )
  }
  if (isAuthPage) return <>{children}</>

  const nav = [
    { href: '/', label: 'Projetos', active: pathname === '/' || pathname.startsWith('/projeto') },
    { href: '/mensagens/', label: 'Mensagens', active: pathname === '/mensagens', badge: unread },
    ...(session!.isAdmin ? [{ href: '/admin/', label: 'Administração', active: pathname.startsWith('/admin') }] : []),
  ]

  return (
    <div className="app">
      {repo?.mode === 'demo' && (
        <div className="demo-bar">
          <strong>Modo demonstração.</strong> Dados fictícios guardados só neste navegador.
          <DemoSwitcher />
        </div>
      )}
      <header className="globalbar">
        <Link href="/" className="brand-mark">Trilha</Link>
        <nav className="global-nav" aria-label="Principal">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="global-link" aria-current={n.active ? 'page' : undefined}>
              {n.label}
              {'badge' in n && n.badge ? <Badge n={n.badge} /> : null}
            </Link>
          ))}
        </nav>
        <Link href="/perfil/" className="me-button" aria-current={pathname === '/perfil' ? 'page' : undefined} title="Meu perfil">
          <span className="avatar">{initials(personName(session!.user))}</span>
          <span className="me-name">{personName(session!.user)}</span>
          <Badge n={unread} title={unread ? `${unread} mensagem(ns) não lida(s)` : undefined} />
        </Link>
      </header>
      <div className="app-body">{children}</div>
    </div>
  )
}

function DemoSwitcher() {
  const { repo, session } = useAuth()
  const router = useRouter()
  if (!repo?.demoUsers || !repo.demoSwitch) return null
  return (
    <label className="demo-switch">
      Entrar como
      <select
        id="demo-user"
        className="input"
        value={session?.user.id ?? ''}
        onChange={async (e) => {
          await repo.demoSwitch!(e.target.value)
          router.push('/')
        }}
      >
        {repo.demoUsers().map((u) => (
          <option key={u.id} value={u.id}>{u.fullName}</option>
        ))}
      </select>
    </label>
  )
}
