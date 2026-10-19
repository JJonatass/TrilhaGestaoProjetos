'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Badge, ConfirmButton, initials, timeAgo, useHint } from '../../components/ui'
import { daysLeft, endOfDayIso, isoToDay, WARN_DAYS } from '../../lib/expiry'
import { friendlyError } from '../../data/repo'
import { useAuth } from '../../state/AuthProvider'
import type { AdminDefaults, AdminProject, AdminUser } from '../../types'

export default function AdminPage() {
  const { repo, session, inbox, unread } = useAuth()
  const [projects, setProjects] = useState<AdminProject[] | null>(null)
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [defaults, setDefaults] = useState<AdminDefaults | null>(null)
  const [bulkDate, setBulkDate] = useState('')
  const [bulkMax, setBulkMax] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const hPrazo = useHint('ajuda-prazos', 'prazos, equipes e Google Drive')

  const load = useCallback(async () => {
    if (!repo) return
    try {
      const [p, u, d] = await Promise.all([repo.adminProjects(), repo.adminUsers(), repo.adminGetDefaults()])
      setProjects(p)
      setUsers(u)
      setDefaults(d)
    } catch (e) {
      setError(friendlyError(e))
    }
  }, [repo])

  useEffect(() => void load(), [load])
  // recarrega quando chegam mensagens novas
  useEffect(() => void load(), [load, unread])

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    if (!repo) return
    try {
      await fn()
      setNotice(msg)
      await load()
    } catch (e) {
      setError(friendlyError(e))
    }
  }

  if (!session?.isAdmin) {
    return (
      <div className="page narrow">
        <h1>Administração</h1>
        <p className="hint">Esta área é exclusiva do administrador do sistema.</p>
      </div>
    )
  }

  const awaiting = inbox.reduce((s, t) => s + t.unreadOther, 0)
  const late = projects?.reduce((s, p) => s + p.late, 0) ?? 0
  const q = filter.trim().toLowerCase()
  const fp = (projects ?? []).filter((p) => !q || `${p.name} ${p.ownerName} ${p.ownerEmail}`.toLowerCase().includes(q))
  const fu = (users ?? []).filter((u) => !q || `${u.fullName} ${u.email}`.toLowerCase().includes(q))

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Administração</h1>
          <p className="hint">Todos os projetos e usuários do sistema. Abra um projeto para ver o quadro e comentar com os integrantes.</p>
        </div>
        <input id="admin-filter" className="input" style={{ maxWidth: 260 }} placeholder="Filtrar por nome ou e-mail" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="kpis">
        <div className="kpi"><span className="label">Usuários</span><span className="value">{users?.length ?? '–'}</span><span className="sub">contas cadastradas</span></div>
        <div className="kpi"><span className="label">Projetos</span><span className="value">{projects?.length ?? '–'}</span><span className="sub">em andamento</span></div>
        <div className={`kpi ${unread ? 'alert' : ''}`}>
          <span className="label">Não lidas</span>
          <span className="value" style={{ color: unread ? 'var(--late)' : undefined }}>{unread}</span>
          <span className="sub">respostas dos alunos</span>
        </div>
        <div className="kpi"><span className="label">Aguardando leitura</span><span className="value">{awaiting}</span><span className="sub">suas mensagens ainda não lidas</span></div>
        <div className="kpi"><span className="label">Tarefas atrasadas</span><span className="value" style={{ color: late ? 'var(--late)' : undefined }}>{late}</span><span className="sub">somando todos os projetos</span></div>
      </div>

      {unread > 0 && (
        <section className="panel attention" style={{ marginBottom: 16 }}>
          <div className="panel-head">
            <h2>Mensagens não lidas</h2>
            <Badge n={unread} />
            <span className="spacer" />
            <Link href="/mensagens/" className="btn small">Abrir caixa de mensagens</Link>
          </div>
          <div className="list">
            {inbox.filter((t) => t.unread > 0).map((t) => (
              <Link key={`${t.projectId}|${t.userId}`} href={`/projeto/mensagens/?id=${t.projectId}&u=${t.userId}`} className="list-row">
                <span>
                  <span className="t">{t.userName}</span> <span className="hint">em {t.projectName}</span>
                  <div className="sub">{t.lastBody}</div>
                </span>
                <span className="mono" style={{ fontSize: 12 }}>{t.unread} nova{t.unread > 1 ? 's' : ''} · {timeAgo(t.lastAt)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head">
          <div className="title-row"><h2>Prazos, equipes e Google Drive</h2>{hPrazo.button}</div>
        </div>
        {hPrazo.box(
          <>
            <p><b>Prazo de existência:</b> no dia seguinte à data, o projeto é apagado automaticamente (a limpeza roda todo dia às 03:15). Os integrantes veem o aviso 14 dias antes, com os botões para baixar o relatório em PDF e salvar no Google Drive.</p>
            <p><b>Limite de integrantes:</b> número máximo de pessoas por equipe, contando o criador e os convites ainda não aceitos. Com a equipe cheia, o criador não consegue convidar mais ninguém. Baixar o limite não remove quem já está no projeto. Deixe vazio para não ter limite.</p>
            <p><b>Google Drive:</b> quando autorizado, os integrantes podem salvar o projeto completo como arquivo no próprio Drive e abri-lo depois sem este sistema.</p>
            <p>Você pode definir para cada projeto na tabela abaixo, para todos de uma vez, ou como padrão para os projetos criados daqui em diante.</p>
          </>,
        )}
        {notice && <p className="form-notice" style={{ marginBottom: 10 }}>{notice}</p>}
        <div className="bulk-grid">
          <div className="bulk-box">
            <h3>Prazo para todos os projetos</h3>
            <div className="row">
              <input id="bulk-date" className="input" type="date" min={isoToDay(new Date().toISOString())} value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} />
              <ConfirmButton
                className="small"
                label="Aplicar a todos"
                confirmLabel={`Confirmar em ${projects?.length ?? 0} projetos`}
                onConfirm={() => bulkDate && void act(() => repo!.adminSetExpiry(null, endOfDayIso(bulkDate)), `Prazo de ${new Date(endOfDayIso(bulkDate)).toLocaleDateString('pt-BR')} aplicado a todos os projetos.`)}
              />
            </div>
            <button type="button" className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => void act(() => repo!.adminSetExpiry(null, null), 'Prazo removido de todos os projetos.')}>
              Remover prazo de todos
            </button>
          </div>
          <div className="bulk-box">
            <h3>Limite de integrantes para todos</h3>
            <div className="row">
              <input id="bulk-max" className="input" type="number" min={1} max={200} placeholder="Ex.: 5" style={{ width: 90 }} value={bulkMax} onChange={(e) => setBulkMax(e.target.value)} />
              <ConfirmButton
                className="small"
                label="Aplicar a todos"
                confirmLabel={`Confirmar em ${projects?.length ?? 0} projetos`}
                onConfirm={() => {
                  const n = parseInt(bulkMax, 10)
                  if (n >= 1) void act(() => repo!.adminSetMaxMembers(null, n), `Limite de ${n} integrantes aplicado a todos os projetos.`)
                }}
              />
            </div>
            <button type="button" className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => void act(() => repo!.adminSetMaxMembers(null, null), 'Limite de integrantes removido de todos os projetos.')}>
              Remover limite de todos
            </button>
          </div>
          <div className="bulk-box">
            <h3>Google Drive para todos</h3>
            <div className="row">
              <button type="button" className="btn small" onClick={() => void act(() => repo!.adminSetDriveExport(null, true), 'Todos os projetos podem ser salvos no Google Drive.')}>Autorizar todos</button>
              <button type="button" className="btn small" onClick={() => void act(() => repo!.adminSetDriveExport(null, false), 'Salvar no Google Drive bloqueado em todos os projetos.')}>Bloquear todos</button>
            </div>
          </div>
          {defaults && (
            <form
              className="bulk-box"
              onSubmit={(e) => {
                e.preventDefault()
                void act(() => repo!.adminSetDefaults(defaults), 'Padrão para novos projetos salvo.')
              }}
            >
              <h3>Padrão para novos projetos</h3>
              <div className="row">
                <label htmlFor="def-date" className="hint">Prazo</label>
                <input
                  id="def-date"
                  className="input"
                  type="date"
                  value={isoToDay(defaults.expiresAt)}
                  onChange={(e) => setDefaults({ ...defaults, expiresAt: e.target.value ? endOfDayIso(e.target.value) : null })}
                />
              </div>
              <div className="row">
                <label htmlFor="def-max" className="hint">Máx. integrantes</label>
                <input
                  id="def-max"
                  className="input"
                  type="number"
                  min={1}
                  max={200}
                  placeholder="sem limite"
                  style={{ width: 110 }}
                  value={defaults.maxMembers ?? ''}
                  onChange={(e) => setDefaults({ ...defaults, maxMembers: e.target.value ? Math.max(1, parseInt(e.target.value, 10) || 1) : null })}
                />
              </div>
              <label className="switch">
                <input id="def-drive" type="checkbox" checked={defaults.driveExport} onChange={(e) => setDefaults({ ...defaults, driveExport: e.target.checked })} />
                Já autorizar o Google Drive
              </label>
              <button type="submit" className="btn primary small" style={{ alignSelf: 'flex-start' }}>Salvar padrão</button>
            </form>
          )}
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><h2>Projetos</h2></div>
        {projects === null ? (
          <p className="empty">Carregando…</p>
        ) : fp.length === 0 ? (
          <p className="empty">Nenhum projeto encontrado.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Projeto</th><th>Criador</th><th className="num">Equipe</th><th>Progresso</th>
                  <th className="num">Atrasadas</th><th>Última atividade</th><th className="num">Não lidas</th><th>Prazo</th><th>Drive</th><th />
                </tr>
              </thead>
              <tbody>
                {fp.map((p) => {
                  const pct = p.pointsTotal ? Math.round((p.pointsDone / p.pointsTotal) * 100) : 0
                  return (
                    <tr key={p.id} className={p.unread ? 'row-alert' : ''}>
                      <td><Link href={`/projeto/?id=${p.id}`} className="strong-link">{p.name}</Link></td>
                      <td>{p.ownerName}<div className="hint">{p.ownerEmail}</div></td>
                      <td className="num">
                        <div className="team-cell">
                          <span className={p.maxMembers !== null && p.members + p.pendingInvites >= p.maxMembers ? 'team-full' : undefined}>
                            {p.members}
                          </span>
                          <span className="hint">de</span>
                          <input
                            id={`max-${p.id}`}
                            className="input"
                            type="number"
                            min={1}
                            max={200}
                            placeholder="∞"
                            aria-label={`Limite de integrantes de ${p.name}`}
                            title="Limite de integrantes (vazio = sem limite)"
                            defaultValue={p.maxMembers ?? ''}
                            key={p.maxMembers ?? 'sem'}
                            onBlur={(e) => {
                              const v = e.target.value ? parseInt(e.target.value, 10) : null
                              if (v !== p.maxMembers) void act(() => repo!.adminSetMaxMembers([p.id], v), v ? `Limite de "${p.name}": ${v} integrantes.` : `"${p.name}" sem limite de integrantes.`)
                            }}
                          />
                        </div>
                        {p.pendingInvites > 0 && <div className="hint team-pending">+{p.pendingInvites} convite{p.pendingInvites > 1 ? 's' : ''} pendente{p.pendingInvites > 1 ? 's' : ''}</div>}
                      </td>
                      <td style={{ minWidth: 140 }}>
                        <div className="meter"><i style={{ width: `${pct}%`, background: 'var(--st-done)' }} /></div>
                        <span className="hint mono">{pct}% · {p.done}/{p.tasks} tarefas</span>
                      </td>
                      <td className="num" style={{ color: p.late ? 'var(--late)' : undefined }}>{p.late}</td>
                      <td>{timeAgo(p.lastActivity)}</td>
                      <td className="num"><Badge n={p.unread} />{!p.unread && <span className="hint">0</span>}</td>
                      <td>
                        <div className="date-cell">
                          <input
                            id={`prazo-${p.id}`}
                            className="input"
                            type="date"
                            aria-label={`Prazo de ${p.name}`}
                            defaultValue={isoToDay(p.expiresAt)}
                            key={p.expiresAt ?? 'sem'}
                            onBlur={(e) => {
                              const v = e.target.value
                              if (v !== isoToDay(p.expiresAt)) void act(() => repo!.adminSetExpiry([p.id], v ? endOfDayIso(v) : null), v ? `Prazo de "${p.name}" definido.` : `Prazo de "${p.name}" removido.`)
                            }}
                          />
                        </div>
                        {(() => {
                          const d = daysLeft(p.expiresAt)
                          return d === null ? <span className="hint">sem prazo</span> : <span className="hint" style={{ color: d <= WARN_DAYS ? 'var(--late)' : undefined }}>{d < 0 ? 'vencido' : `${d} dias`}</span>
                        })()}
                      </td>
                      <td>
                        <label className="switch">
                          <input
                            id={`drive-${p.id}`}
                            type="checkbox"
                            checked={p.driveExportAllowed}
                            onChange={(e) => void act(() => repo!.adminSetDriveExport([p.id], e.target.checked), e.target.checked ? `"${p.name}" pode ser salvo no Drive.` : `Drive bloqueado para "${p.name}".`)}
                          />
                          {p.driveExportAllowed ? 'Autorizado' : 'Bloqueado'}
                        </label>
                      </td>
                      <td>
                        <div className="toolbar" style={{ margin: 0, flexWrap: 'nowrap' }}>
                          <Link href={`/projeto/?id=${p.id}`} className="btn small">Ver quadro</Link>
                          <Link href={`/projeto/mensagens/?id=${p.id}`} className="btn small">Comentar</Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Usuários</h2></div>
        {users === null ? (
          <p className="empty">Carregando…</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Pessoa</th><th className="num">Projetos</th><th className="num">Tarefas abertas</th><th>Último acesso</th><th>Cadastro</th><th className="num">Não lidas</th></tr>
              </thead>
              <tbody>
                {fu.map((u) => (
                  <tr key={u.id} className={u.unread ? 'row-alert' : ''}>
                    <td>
                      <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span className="avatar">{initials(u.fullName || u.email)}</span>
                        <span>{u.fullName || u.email.split('@')[0]}<div className="hint">{u.email}</div></span>
                      </span>
                    </td>
                    <td className="num">{u.projects}</td>
                    <td className="num">{u.openTasks}</td>
                    <td>{timeAgo(u.lastSignInAt)}</td>
                    <td>{new Date(u.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td className="num"><Badge n={u.unread} />{!u.unread && <span className="hint">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
