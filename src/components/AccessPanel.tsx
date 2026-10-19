'use client'

// Área "Acesso ao sistema" do administrador: domínios permitidos para novos
// cadastros, e-mails liberados avulsos e administradores.

import { useCallback, useEffect, useState } from 'react'
import { friendlyError, type Repo } from '../data/repo'
import type { AccessLists } from '../types'
import { ConfirmButton, useHint } from './ui'

export function AccessPanel({ repo, onChanged }: { repo: Repo; onChanged?: () => void }) {
  const [lists, setLists] = useState<AccessLists | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [newDomain, setNewDomain] = useState('')
  const [newDomainNote, setNewDomainNote] = useState('')
  const [editing, setEditing] = useState<{ old: string; domain: string; note: string } | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [newEmailNote, setNewEmailNote] = useState('')
  const [newAdmin, setNewAdmin] = useState('')
  const help = useHint('ajuda-acesso', 'acesso ao sistema')

  const load = useCallback(async () => {
    try {
      setLists(await repo.adminAccess())
    } catch (e) {
      setError(friendlyError(e))
    }
  }, [repo])
  useEffect(() => void load(), [load])

  const act = async (fn: () => Promise<unknown>, msg: string, after?: () => void) => {
    setError(null)
    setNotice(null)
    try {
      await fn()
      setNotice(msg)
      after?.()
      await load()
      onChanged?.()
    } catch (e) {
      setError(friendlyError(e))
    }
  }

  const domainList = lists?.domains ?? []
  const open = lists !== null && domainList.length === 0

  return (
    <section className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head">
        <div className="title-row"><h2>Acesso ao sistema</h2>{help.button}</div>
      </div>
      {help.box(
        <>
          <p><b>Domínios permitidos:</b> só e-mails desses domínios conseguem criar conta. Subdomínios também valem: <code>ficr.edu.br</code> aceita <code>aluno.ficr.edu.br</code>. Sem nenhum domínio na lista, o cadastro fica aberto para qualquer e-mail.</p>
          <p><b>E-mails liberados:</b> exceções de qualquer domínio (monitor externo, professor convidado). A pessoa se cadastra normalmente com o e-mail liberado.</p>
          <p><b>Administradores:</b> veem todos os projetos e usuários e mudam estas regras. Podem ter qualquer e-mail e sempre conseguem se cadastrar. A permissão vale depois que a pessoa confirmar o e-mail.</p>
          <p>As regras valem para cadastros novos e para convites. Quem já tem conta continua entrando; para tirar o acesso de alguém, use <b>Bloquear</b> na lista de usuários.</p>
        </>,
      )}
      {error && <p className="form-error" style={{ marginBottom: 10 }}>{error}</p>}
      {notice && <p className="form-notice" style={{ marginBottom: 10 }}>{notice}</p>}

      {lists === null ? (
        <p className="empty">Carregando…</p>
      ) : (
        <div className="access-grid">
          {/* ---------------- domínios ---------------- */}
          <div className="bulk-box access-box">
            <h3>Domínios permitidos</h3>
            {open && <p className="access-warn">Lista vazia: <b>qualquer e-mail</b> pode criar conta.</p>}
            <ul className="access-list">
              {domainList.map((d) =>
                editing?.old === d.domain ? (
                  <li key={d.domain} className="access-row editing">
                    <form
                      className="access-edit"
                      onSubmit={(e) => {
                        e.preventDefault()
                        void act(() => repo.adminUpdateDomain(editing.old, editing.domain, editing.note), `Domínio atualizado: @${editing.domain.replace(/^@+/, '').toLowerCase()}`, () => setEditing(null))
                      }}
                    >
                      <input id={`dom-edit-${d.domain}`} className="input" aria-label="Domínio" value={editing.domain} onChange={(e) => setEditing({ ...editing, domain: e.target.value })} autoFocus />
                      <input className="input" aria-label="Observação" placeholder="Observação (opcional)" value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
                      <div className="row">
                        <button type="submit" className="btn primary small">Salvar</button>
                        <button type="button" className="btn small" onClick={() => setEditing(null)}>Cancelar</button>
                      </div>
                    </form>
                  </li>
                ) : (
                  <li key={d.domain} className="access-row">
                    <span className="access-main">
                      <strong className="mono">@{d.domain}</strong>
                      <span className="hint">{[d.note, `${d.users} conta${d.users === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="access-actions">
                      <button type="button" className="btn small" onClick={() => setEditing({ old: d.domain, domain: d.domain, note: d.note })}>Editar</button>
                      <ConfirmButton
                        className="small"
                        label="Remover"
                        confirmLabel={domainList.length === 1 ? 'Confirmar (cadastro fica aberto)' : 'Confirmar'}
                        onConfirm={() => void act(() => repo.adminRemoveDomain(d.domain), `@${d.domain} removido. Quem já tem conta continua entrando.`)}
                      />
                    </span>
                  </li>
                ),
              )}
            </ul>
            <form
              className="access-add"
              onSubmit={(e) => {
                e.preventDefault()
                if (!newDomain.trim()) return
                void act(() => repo.adminAddDomain(newDomain, newDomainNote), `Domínio @${newDomain.trim().replace(/^@+/, '').toLowerCase()} permitido.`, () => {
                  setNewDomain('')
                  setNewDomainNote('')
                })
              }}
            >
              <input id="new-domain" className="input" placeholder="ex.: ficr.edu.br" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} aria-label="Novo domínio" />
              <input id="new-domain-note" className="input" placeholder="Observação (opcional)" value={newDomainNote} onChange={(e) => setNewDomainNote(e.target.value)} aria-label="Observação do domínio" />
              <button type="submit" className="btn small primary">Adicionar domínio</button>
            </form>
          </div>

          {/* ---------------- e-mails liberados ---------------- */}
          <div className="bulk-box access-box">
            <h3>E-mails liberados</h3>
            <p className="hint" style={{ margin: 0 }}>Exceções de qualquer domínio.</p>
            {lists.emails.length === 0 ? (
              <p className="hint" style={{ margin: 0 }}>Nenhum e-mail liberado.</p>
            ) : (
              <ul className="access-list">
                {lists.emails.map((x) => (
                  <li key={x.email} className="access-row">
                    <span className="access-main">
                      <strong>{x.email}</strong>
                      <span className="hint">{[x.note, x.registered ? 'já tem conta' : 'ainda sem conta'].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="access-actions">
                      <ConfirmButton className="small" label="Remover" confirmLabel="Confirmar" onConfirm={() => void act(() => repo.adminRemoveEmail(x.email), `${x.email} removido da lista. Se já tem conta, continua entrando.`)} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="access-add"
              onSubmit={(e) => {
                e.preventDefault()
                if (!newEmail.trim()) return
                void act(() => repo.adminAddEmail(newEmail, newEmailNote), `${newEmail.trim().toLowerCase()} pode se cadastrar.`, () => {
                  setNewEmail('')
                  setNewEmailNote('')
                })
              }}
            >
              <input id="new-email" className="input" type="email" placeholder="pessoa@gmail.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} aria-label="E-mail a liberar" />
              <input id="new-email-note" className="input" placeholder="Quem é (opcional)" value={newEmailNote} onChange={(e) => setNewEmailNote(e.target.value)} aria-label="Observação do e-mail" />
              <button type="submit" className="btn small primary">Liberar e-mail</button>
            </form>
          </div>

          {/* ---------------- administradores ---------------- */}
          <div className="bulk-box access-box">
            <h3>Administradores</h3>
            <p className="hint" style={{ margin: 0 }}>Qualquer e-mail. Sempre podem se cadastrar.</p>
            <ul className="access-list">
              {lists.admins.map((a) => (
                <li key={a.email} className="access-row">
                  <span className="access-main">
                    <strong>{a.email}</strong>
                    <span className="hint">{a.me ? 'você' : a.confirmed ? 'ativo' : a.registered ? 'aguardando confirmar o e-mail' : 'aguardando cadastro'}</span>
                  </span>
                  <span className="access-actions">
                    {!a.me && (
                      <ConfirmButton className="small" label="Remover" confirmLabel="Confirmar" onConfirm={() => void act(() => repo.adminRemoveAdmin(a.email), `${a.email} não é mais administrador.`)} />
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <form
              className="access-add"
              onSubmit={(e) => {
                e.preventDefault()
                if (!newAdmin.trim()) return
                void act(() => repo.adminAddAdmin(newAdmin), `${newAdmin.trim().toLowerCase()} agora é administrador.`, () => setNewAdmin(''))
              }}
            >
              <input id="new-admin" className="input" type="email" placeholder="coordenacao@ficr.edu.br" value={newAdmin} onChange={(e) => setNewAdmin(e.target.value)} aria-label="E-mail do novo administrador" />
              <button type="submit" className="btn small primary">Tornar administrador</button>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
