'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { friendlyError } from '../../data/repo'
import { useAuth } from '../../state/AuthProvider'

type Mode = 'entrar' | 'cadastrar' | 'senha'

export default function EntrarPage() {
  const { repo } = useAuth()
  const [mode, setMode] = useState<Mode>('entrar')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [domains, setDomains] = useState<string[] | null>(null)

  // no cadastro, mostra quais e-mails são aceitos
  useEffect(() => {
    if (mode !== 'cadastrar' || !repo || domains) return
    repo.canSignUp('consulta@invalido.local').then((r) => setDomains(r.domains)).catch(() => setDomains([]))
  }, [mode, repo, domains])

  const submit = async () => {
    if (!repo) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'entrar') await repo.signIn(email, password)
      else if (mode === 'cadastrar') {
        const r = await repo.signUp(email, password, name.trim())
        if (r.needsConfirmation) setNotice(`Enviamos um link de confirmação para ${email}. Abra o e-mail e depois entre com sua senha.`)
      } else {
        await repo.resetPassword(email)
        setNotice('Se houver uma conta com este e-mail, você vai receber um link para criar uma nova senha.')
      }
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="brand-mark">Trilha</div>
        <h1>{mode === 'entrar' ? 'Entrar' : mode === 'cadastrar' ? 'Criar conta' : 'Recuperar senha'}</h1>
        <p className="hint">Kanban, cronograma e métricas do seu projeto, com a equipe toda no mesmo quadro.</p>

        {repo?.mode === 'demo' && repo.demoUsers && (
          <div className="demo-login">
            <p><strong>Modo demonstração.</strong> Escolha uma pessoa para testar cada papel:</p>
            <div className="demo-people">
              {repo.demoUsers().map((u) => (
                <button key={u.id} type="button" className="btn" onClick={() => void repo.signIn(u.email, '')}>
                  {u.fullName}
                </button>
              ))}
            </div>
            <p className="hint">Ana criou o projeto · Bruno, Carla e Diego editam · Elisa só lê · Jonatas é o administrador.</p>
          </div>
        )}

        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          {mode === 'cadastrar' && (
            <label className="field">
              <span>Nome</span>
              <input id="auth-name" className="input" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          )}
          <label className="field">
            <span>E-mail</span>
            <input id="auth-email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            {mode === 'cadastrar' && domains && domains.length > 0 && (
              <small id="auth-domains" className="hint">
                Use o seu e-mail institucional ({domains.map((d) => '@' + d).join(', ')}). Se você é de fora, peça ao professor para liberar o seu e-mail.
              </small>
            )}
          </label>
          {mode !== 'senha' && (
            <label className="field">
              <span>Senha</span>
              <input
                id="auth-password"
                className="input"
                type="password"
                minLength={6}
                autoComplete={mode === 'entrar' ? 'current-password' : 'new-password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          {error && <p className="form-error">{error}</p>}
          {notice && <p className="form-notice">{notice}</p>}
          <button type="submit" className="btn primary big" disabled={busy}>
            {busy ? 'Aguarde…' : mode === 'entrar' ? 'Entrar' : mode === 'cadastrar' ? 'Criar conta' : 'Enviar link'}
          </button>
        </form>

        <div className="auth-switch">
          {mode !== 'entrar' && <button type="button" className="link" onClick={() => setMode('entrar')}>Já tenho conta</button>}
          {mode !== 'cadastrar' && <button type="button" className="link" onClick={() => setMode('cadastrar')}>Criar conta</button>}
          {mode !== 'senha' && <button type="button" className="link" onClick={() => setMode('senha')}>Esqueci a senha</button>}
        </div>
        <p className="auth-legal">
          <Link href="/privacidade/">Política de privacidade</Link>
        </p>
      </div>
    </div>
  )
}
