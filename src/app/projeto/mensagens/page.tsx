'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Thread } from '../../../components/Thread'
import { Badge, initials, personName } from '../../../components/ui'
import { useAuth } from '../../../state/AuthProvider'
import { useProject } from '../../../state/ProjectProvider'

export default function ProjetoMensagensPage() {
  const { snap, isAdminView, me, projectId } = useProject()
  const { inbox, session } = useAuth()
  const params = useSearchParams()
  const [selected, setSelected] = useState<string | null>(params.get('u'))
  const taskParam = params.get('t')

  useEffect(() => {
    const u = params.get('u')
    if (u) setSelected(u)
  }, [params])

  if (!snap) return null
  const tasks = snap.tasks.map((t) => ({ id: t.id, title: t.title }))

  // Integrante: uma única conversa, com o administrador
  if (!isAdminView) {
    return (
      <div className="page narrow">
        <Thread
          projectId={projectId}
          userId={me!}
          title="Conversa com o administrador"
          subtitle="Comentários sobre o seu trabalho neste projeto. Só você e o administrador veem esta conversa."
          tasks={tasks}
          emptyText="Nenhuma mensagem ainda. Você pode escrever para tirar dúvidas ou pedir orientação."
        />
      </div>
    )
  }

  // Administrador: escolhe o integrante e conversa
  const unreadOf = (uid: string) => inbox.find((t) => t.projectId === projectId && t.userId === uid)?.unread ?? 0
  const pendingOf = (uid: string) => inbox.find((t) => t.projectId === projectId && t.userId === uid)?.unreadOther ?? 0
  const current = snap.members.find((m) => m.id === selected) ?? null
  const members = snap.members.filter((m) => m.id !== session?.user.id)

  return (
    <div className="page">
      <div className={`inbox ${current ? 'has-open' : ''}`}>
        <nav className="inbox-list" aria-label="Integrantes">
          <p className="hint" style={{ margin: '4px 4px 10px' }}>Escolha com quem conversar. Cada conversa é individual.</p>
          {members.map((m) => (
            <button key={m.id} type="button" className={`inbox-item ${selected === m.id ? 'active' : ''} ${unreadOf(m.id) ? 'unread' : ''}`} onClick={() => setSelected(m.id)}>
              <span className="avatar">{initials(personName(m))}</span>
              <span className="inbox-text">
                <span className="inbox-top"><strong>{personName(m)}</strong></span>
                <span className="inbox-project">{snap.tasks.filter((t) => t.status !== 'done' && t.assignees.includes(m.id)).length} tarefas em aberto</span>
                {pendingOf(m.id) > 0 && <span className="inbox-pending">Ainda não leu {pendingOf(m.id)}</span>}
              </span>
              <Badge n={unreadOf(m.id)} />
            </button>
          ))}
        </nav>
        <div className="inbox-open">
          {current ? (
            <>
              <button type="button" className="btn small back" onClick={() => setSelected(null)}>← Integrantes</button>
              <Thread
                key={`${current.id}-${taskParam ?? ''}`}
                projectId={projectId}
                userId={current.id}
                title={personName(current)}
                subtitle={`${current.email} · ${snap.meta.name}`}
                tasks={tasks}
                initialTaskId={taskParam ? Number(taskParam) : null}
                emptyText={`Nenhuma mensagem com ${personName(current)} neste projeto. Escreva o primeiro comentário.`}
              />
            </>
          ) : (
            <p className="empty">Escolha um integrante para comentar.</p>
          )}
        </div>
      </div>
    </div>
  )
}
