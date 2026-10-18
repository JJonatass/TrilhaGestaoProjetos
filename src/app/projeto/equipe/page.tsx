'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { DeleteProjectDialog } from '../../../components/DeleteProjectDialog'
import { expiryLabel, formatDate } from '../../../lib/expiry'
import { ConfirmButton, Field, initials, personName, timeAgo } from '../../../components/ui'
import { addDays, today } from '../../../lib/dates'
import { useAuth } from '../../../state/AuthProvider'
import { useProject } from '../../../state/ProjectProvider'
import { ROLE_LABEL, STATUSES, type Role } from '../../../types'

export default function EquipePage() {
  const p = useProject()
  const { repo } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('editor')
  const [copied, setCopied] = useState(false)
  const [deleting, setDeleting] = useState(false)
  if (!p.snap || !repo) return null
  const { snap } = p
  const lastSprint = snap.sprints[snap.sprints.length - 1]
  const siteUrl = typeof window === 'undefined' ? '' : `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/`
  const openTasks = (uid: string) => snap.tasks.filter((t) => t.status !== 'done' && t.assignees.includes(uid)).length

  const sendInvite = async () => {
    const e = email.trim().toLowerCase()
    if (!e.includes('@')) return
    if (snap.members.some((m) => m.email === e)) {
      p.setToast('Essa pessoa já faz parte do projeto.')
      return
    }
    const ok = await p.run(() => repo.invite(p.projectId, e, role).then(() => true), `Convite registrado para ${e}`)
    if (ok !== undefined) setEmail('')
    await p.refresh()
  }

  return (
    <div className="page">
      <div className="grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Integrantes</h2>
              <p>Criador gerencia o projeto e define responsáveis. Editor altera tarefas. Leitor só acompanha.</p>
            </div>
          </div>
          <div className="list">
            {snap.members.map((m) => (
              <div key={m.id} className="member-row">
                <span className="avatar">{initials(personName(m))}</span>
                <span className="member-info">
                  <strong>{personName(m)}{m.id === p.me ? ' (você)' : ''}</strong>
                  <span className="hint">{m.email} · {openTasks(m.id)} tarefa{openTasks(m.id) === 1 ? '' : 's'} em aberto</span>
                </span>
                {p.isOwner && m.role !== 'owner' ? (
                  <select
                    id={`role-${m.id}`}
                    className="input"
                    style={{ width: 'auto' }}
                    value={m.role}
                    onChange={(e) => void p.run(() => repo.changeRole(p.projectId, m.id, e.target.value as Role), 'Papel atualizado').then(p.refresh)}
                  >
                    <option value="editor">{ROLE_LABEL.editor}</option>
                    <option value="viewer">{ROLE_LABEL.viewer}</option>
                  </select>
                ) : (
                  <span className={`role-tag ${m.role}`}>{ROLE_LABEL[m.role]}</span>
                )}
                {p.isOwner && m.role !== 'owner' && (
                  <ConfirmButton
                    className="small"
                    label="Remover"
                    confirmLabel="Confirmar"
                    onConfirm={() => void p.run(() => repo.removeMember(p.projectId, m.id), `${personName(m)} saiu do projeto`).then(p.refresh)}
                  />
                )}
              </div>
            ))}
          </div>
          {p.role && p.role !== 'owner' && (
            <div style={{ marginTop: 12 }}>
              <ConfirmButton
                label="Sair do projeto"
                confirmLabel="Confirmar saída"
                onConfirm={() => void p.run(() => repo.removeMember(p.projectId, p.me!)).then(() => router.push('/'))}
              />
            </div>
          )}
        </section>

        {p.isOwner && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Convidar</h2>
                <p>A pessoa entra com este e-mail (ou cria a conta com ele) e aceita o convite na lista de projetos.</p>
              </div>
            </div>
            <form
              className="invite-form-wrap"
              onSubmit={(e) => {
                e.preventDefault()
                void sendInvite()
              }}
            >
              <div className="invite-form">
                <Field id="invite-email" label="E-mail" hint="Use o mesmo e-mail com que a pessoa vai entrar no sistema. Se ela ainda não tem conta, cria com este e-mail e o convite aparece na lista de projetos dela.">
                  <input id="invite-email" className="input" type="email" required placeholder="aluno@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Field id="invite-role" label="Papel" hint="Editor cria, edita e move tarefas e pode se colocar como responsável. Leitor só acompanha o quadro e os gráficos. Dá para mudar depois.">
                  <select id="invite-role" className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                    <option value="editor">{ROLE_LABEL.editor}</option>
                    <option value="viewer">{ROLE_LABEL.viewer}</option>
                  </select>
                </Field>
              </div>
              <button type="submit" className="btn primary">Convidar</button>
            </form>
            <div className="share-row">
              <span className="hint">Envie o endereço do sistema para a pessoa:</span>
              <span className="code">{siteUrl}</span>
              <button
                type="button"
                className="btn small"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(siteUrl)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  } catch {
                    p.setToast('Não foi possível copiar. Selecione o endereço e copie manualmente.')
                  }
                }}
              >
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            {snap.invites.length > 0 && (
              <div className="list" style={{ marginTop: 10 }}>
                {snap.invites.map((i) => (
                  <div key={i.id} className="member-row">
                    <span className="avatar empty">@</span>
                    <span className="member-info">
                      <strong>{i.email}</strong>
                      <span className="hint">Convite pendente · {ROLE_LABEL[i.role]} · {timeAgo(i.createdAt)}</span>
                    </span>
                    <button type="button" className="btn small" onClick={() => void p.run(() => repo.cancelInvite(p.projectId, i.id), 'Convite cancelado').then(p.refresh)}>
                      Cancelar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Regras do projeto</h2>
              <p>{p.isOwner ? 'Só o criador altera estas regras.' : 'Definidas pelo criador do projeto.'}</p>
            </div>
          </div>
          <label className="check">
            <input
              id="self-assign"
              type="checkbox"
              disabled={!p.isOwner}
              checked={snap.meta.selfAssign}
              onChange={(e) => void p.updateProject({ selfAssign: e.target.checked })}
            />
            Integrantes podem se colocar como responsáveis sozinhos
          </label>
          <p className="hint" style={{ margin: '4px 0 12px 26px' }}>
            Desligado: só o criador define quem é responsável por cada tarefa.
          </p>
          <Field id="wip-todo" label="Limite de WIP por coluna" hint="WIP é o trabalho em andamento. O limite é o máximo de tarefas ao mesmo tempo numa coluna: quando passa, o contador fica vermelho, sinal de gargalo. Deixe vazio para não limitar.">
            <div className="row3">
              {STATUSES.filter((s) => s.id !== 'backlog' && s.id !== 'done').map((s) => (
                <label key={s.id} className="field">
                  <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>{s.label}</span>
                  <input
                    id={`wip-${s.id}`}
                    className="input num"
                    type="number"
                    min={1}
                    disabled={!p.isOwner}
                    defaultValue={snap.meta.wip[s.id] ?? ''}
                    onBlur={(e) => {
                      const v = Number(e.target.value)
                      const wip = { ...snap.meta.wip }
                      if (v > 0) wip[s.id] = v
                      else delete wip[s.id]
                      if (JSON.stringify(wip) !== JSON.stringify(snap.meta.wip)) void p.updateProject({ wip })
                    }}
                  />
                </label>
              ))}
            </div>
          </Field>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Sprints</h2>
              <p>Usados no burndown, no burnup e na faixa superior do Gantt.</p>
            </div>
          </div>
          {snap.sprints.length === 0 && <p className="hint">Nenhum sprint cadastrado.</p>}
          {snap.sprints.map((sp) => (
            <div className="sprint-row" key={sp.id}>
              <label className="sprint-field sprint-name">
                <span>Nome do sprint</span>
                <input id={`sp-name-${sp.id}`} className="input" defaultValue={sp.name} disabled={!p.canEdit} placeholder="Ex.: Sprint 1 · Protótipo"
                  onBlur={(e) => e.target.value.trim() && e.target.value !== sp.name && void p.updateSprint({ ...sp, name: e.target.value.trim() })} />
              </label>
              <label className="sprint-field">
                <span>Início</span>
                <input id={`sp-start-${sp.id}`} className="input" type="date" defaultValue={sp.start} disabled={!p.canEdit}
                  onBlur={(e) => e.target.value && e.target.value !== sp.start && void p.updateSprint({ ...sp, start: e.target.value })} />
              </label>
              <label className="sprint-field">
                <span>Fim</span>
                <input id={`sp-end-${sp.id}`} className="input" type="date" defaultValue={sp.end} disabled={!p.canEdit}
                  onBlur={(e) => e.target.value && e.target.value !== sp.end && void p.updateSprint({ ...sp, end: e.target.value })} />
              </label>
              {p.canEdit && (
                <div className="sprint-remove">
                  <ConfirmButton className="small" label="Remover" confirmLabel="Confirmar" onConfirm={() => void p.deleteSprint(sp.id)} />
                </div>
              )}
            </div>
          ))}
          {p.canEdit && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                const start = lastSprint ? addDays(lastSprint.end, 1) : today()
                void p.addSprint({ name: `Sprint ${snap.sprints.length + 1}`, start, end: addDays(start, 13) })
              }}
            >
              + Adicionar sprint de 2 semanas
            </button>
          )}
        </section>

        <section className="panel">
          <h2>Prazo do projeto</h2>
          {snap.meta.expiresAt ? (
            <p className="hint">
              O administrador definiu que este projeto existe até <strong>{formatDate(snap.meta.expiresAt)}</strong>. {expiryLabel(snap.meta.expiresAt)}, com tarefas, histórico e mensagens.
              Antes disso, baixe o relatório em PDF{snap.meta.driveExportAllowed ? ' ou salve o projeto no seu Google Drive' : ''} pelos botões no topo.
            </p>
          ) : (
            <p className="hint">Sem prazo definido. Se o administrador definir um, o aviso aparece no topo do projeto com 14 dias de antecedência.</p>
          )}
          <p className="hint" style={{ marginBottom: 0 }}>
            Salvar no Google Drive: {snap.meta.driveExportAllowed ? 'autorizado pelo administrador.' : 'aguardando autorização do administrador. Você pode pedir pela aba Mensagens.'}
          </p>
        </section>

        {p.isOwner && (
          <section className="panel danger-zone">
            <h2>Excluir projeto</h2>
            <p className="hint">Apaga tarefas, histórico, convites e mensagens deste projeto para todos. Não pode ser desfeito. A confirmação pede que você digite o nome do projeto.</p>
            <button type="button" className="btn danger" onClick={() => setDeleting(true)}>Excluir projeto…</button>
          </section>
        )}
        {deleting && (
          <DeleteProjectDialog
            projectName={snap.meta.name}
            onClose={() => setDeleting(false)}
            onConfirm={async () => {
              const ok = await p.run(() => repo.deleteProject(p.projectId).then(() => true))
              if (ok !== undefined) router.push('/')
              else setDeleting(false)
            }}
          />
        )}
      </div>
    </div>
  )
}
