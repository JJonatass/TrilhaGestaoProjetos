'use client'

// Parte de baixo do editor de tarefa: comentários (com @menções),
// registro de atividades e histórico de colunas.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { friendlyError } from '../data/repo'
import { CATEGORY_LABEL, projectColumns } from '../lib/columns'
import { dayOfIso, shortDate } from '../lib/dates'
import { useAuth } from '../state/AuthProvider'
import { useProject } from '../state/ProjectProvider'
import { KINDS, PRIORITIES, type Activity, type Member, type StatusChange, type Task, type TaskComment } from '../types'
import { initials, personName, timeAgo } from './ui'

type Tab = 'comentarios' | 'atividade' | 'historico'

export function TaskDiscussion({ task, history }: { task: Task; history: StatusChange[] }) {
  const { serverFeatures } = useProject()
  const [tab, setTab] = useState<Tab>(serverFeatures ? 'comentarios' : 'historico')
  return (
    <div className="discussion">
      <div className="seg disc-tabs" role="tablist" aria-label="Discussão da tarefa">
        {serverFeatures && (
          <button type="button" role="tab" aria-selected={tab === 'comentarios'} aria-pressed={tab === 'comentarios'} onClick={() => setTab('comentarios')}>Comentários</button>
        )}
        {serverFeatures && (
          <button type="button" role="tab" aria-selected={tab === 'atividade'} aria-pressed={tab === 'atividade'} onClick={() => setTab('atividade')}>Atividade</button>
        )}
        <button type="button" role="tab" aria-selected={tab === 'historico'} aria-pressed={tab === 'historico'} onClick={() => setTab('historico')}>Histórico de colunas</button>
      </div>
      {tab === 'comentarios' && <Comments task={task} />}
      {tab === 'atividade' && <ActivityList task={task} />}
      {tab === 'historico' && <ColumnHistory task={task} history={history} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Comentários

function Comments({ task }: { task: Task }) {
  const { repo, projectId, snap, me } = useProject()
  const { refreshInbox } = useAuth()
  const [list, setList] = useState<TaskComment[] | null>(null)
  const [body, setBody] = useState('')
  const [mentions, setMentions] = useState<Member[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggest, setSuggest] = useState<{ q: string; start: number } | null>(null)
  const [hi, setHi] = useState(0)
  const ref = useRef<HTMLTextAreaElement>(null)
  const caretAfter = useRef<number | null>(null)
  const members = snap?.members ?? []

  // depois de escolher alguém no @, o cursor vai para depois do nome antes da próxima tecla
  useLayoutEffect(() => {
    if (caretAfter.current === null || !ref.current) return
    ref.current.focus()
    ref.current.setSelectionRange(caretAfter.current, caretAfter.current)
    caretAfter.current = null
  }, [body])

  const load = useCallback(async () => {
    if (!repo) return
    try {
      setList(await repo.listComments(projectId, task.id))
    } catch (e) {
      setError(friendlyError(e))
    }
  }, [repo, projectId, task.id])

  useEffect(() => {
    void load()
    if (!repo) return
    // abrir a tarefa marca como lidos os avisos dela
    void repo.markNotificationsRead(null, task.id).then(() => refreshInbox())
    return repo.subscribeProject(projectId, () => void load())
  }, [repo, projectId, task.id, load, refreshInbox])

  const options = useMemo(() => {
    if (!suggest) return []
    const q = suggest.q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    return members
      .filter((m) => m.id !== me)
      .filter((m) => personName(m).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q))
      .slice(0, 6)
  }, [suggest, members, me])

  const onChange = (v: string, caret: number) => {
    setBody(v)
    const before = v.slice(0, caret)
    const m = /(^|\s)@([\p{L}\p{N}._-]*)$/u.exec(before)
    if (m) {
      setSuggest({ q: m[2], start: caret - m[2].length - 1 })
      setHi(0)
    } else setSuggest(null)
  }

  const pick = (m: Member) => {
    if (!suggest) return
    const name = personName(m)
    const caret = ref.current?.selectionStart ?? body.length
    const next = `${body.slice(0, suggest.start)}@${name} ${body.slice(caret)}`
    caretAfter.current = suggest.start + name.length + 2
    setBody(next)
    setMentions((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]))
    setSuggest(null)
  }

  const send = async () => {
    const text = body.trim()
    if (!text || !repo) return
    setSending(true)
    setError(null)
    try {
      // só vale a menção que continua no texto
      const ids = mentions.filter((m) => text.includes(`@${personName(m)}`)).map((m) => m.id)
      await repo.addComment(projectId, task.id, text, ids)
      setBody('')
      setMentions([])
      await load()
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setSending(false)
    }
  }

  const remove = async (id: number) => {
    if (!repo) return
    try {
      await repo.deleteComment(projectId, id)
      await load()
    } catch (e) {
      setError(friendlyError(e))
    }
  }

  // destaca @Nome de quem foi mencionado
  const render = (c: TaskComment) => {
    const names = c.mentions.map((id) => members.find((m) => m.id === id)).filter((m): m is Member => !!m).map((m) => `@${personName(m)}`)
    if (!names.length) return c.body
    const re = new RegExp(`(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g')
    return c.body.split(re).map((part, i) => (names.includes(part) ? <mark key={i} className="mention">{part}</mark> : part))
  }

  return (
    <div className="comments">
      {list === null ? (
        <p className="hint">Carregando comentários…</p>
      ) : list.length === 0 ? (
        <p className="hint">Nenhum comentário. Use @ para chamar alguém da equipe.</p>
      ) : (
        <ul className="comment-list">
          {list.map((c) => (
            <li key={c.id} className="comment">
              <span className="avatar">{initials(c.authorName)}</span>
              <div className="comment-body">
                <div className="comment-head">
                  <strong>{c.authorId === me ? 'Você' : c.authorName}</strong>
                  <time className="hint" title={new Date(c.createdAt).toLocaleString('pt-BR')}>{timeAgo(c.createdAt)}</time>
                  {c.authorId === me && (
                    <button type="button" className="link danger-link" onClick={() => void remove(c.id)}>apagar</button>
                  )}
                </div>
                <p>{render(c)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="comment-composer">
        {error && <p className="form-error">{error}</p>}
        <div className="mention-wrap">
          <textarea
            ref={ref}
            id="comment-body"
            className="input"
            rows={2}
            placeholder="Escreva um comentário. Use @ para mencionar alguém."
            value={body}
            maxLength={4000}
            onChange={(e) => onChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onKeyDown={(e) => {
              if (suggest && options.length) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => (h + 1) % options.length); return }
                if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (h - 1 + options.length) % options.length); return }
                if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(options[hi]); return }
                if (e.key === 'Escape') { setSuggest(null); return }
              }
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void send()
            }}
          />
          {suggest && options.length > 0 && (
            <ul className="mention-list" role="listbox" aria-label="Mencionar">
              {options.map((m, i) => (
                <li key={m.id}>
                  <button type="button" role="option" aria-selected={i === hi} className={i === hi ? 'hi' : ''} onMouseDown={(e) => { e.preventDefault(); pick(m) }}>
                    <span className="avatar">{initials(personName(m))}</span> {personName(m)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="row-end">
          <span className="hint">Ctrl + Enter envia · quem for mencionado e os responsáveis são avisados</span>
          <button type="button" className="btn primary small" onClick={() => void send()} disabled={sending || !body.trim()}>
            {sending ? 'Enviando…' : 'Comentar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Atividade

function ActivityList({ task }: { task: Task }) {
  const { repo, projectId, snap } = useProject()
  const [list, setList] = useState<Activity[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!repo) return
    const load = () =>
      repo.listActivity(projectId, task.id).then((l) => setList(l)).catch((e) => setError(friendlyError(e)))
    void load()
    return repo.subscribeProject(projectId, () => void load())
  }, [repo, projectId, task.id])

  if (!snap) return null
  const cols = projectColumns(snap.meta)
  const who = (id: string | null) => {
    if (!id) return 'Alguém'
    const m = snap.members.find((x) => x.id === id)
    return m ? personName(m) : 'Professor'
  }
  const colName = (k: unknown) => {
    const key = String(k ?? '')
    return cols.find((c) => c.id === key)?.label ?? CATEGORY_LABEL[key as keyof typeof CATEGORY_LABEL] ?? key
  }
  const fmt = (v: unknown, campo: string) => {
    if (v === null || v === undefined || v === '') return '(vazio)'
    if (campo === 'kind') return KINDS.find((k) => k.id === v)?.label ?? String(v)
    if (campo === 'priority') return PRIORITIES.find((p) => p.id === v)?.label ?? String(v)
    if (campo === 'start' || campo === 'due') return shortDate(String(v))
    return String(v)
  }
  const FIELD: Record<string, string> = {
    title: 'o título', kind: 'o tipo', priority: 'a prioridade', points: 'os pontos', start: 'o início', due: 'o prazo',
    phase: 'a fase', sprint: 'o sprint', epic: 'o épico',
  }
  const describe = (a: Activity): React.ReactNode => {
    const d = a.detail as Record<string, unknown>
    switch (a.action) {
      case 'criou': return 'criou a tarefa'
      case 'coluna': return <>moveu de <b>{colName(d.de)}</b> para <b>{colName(d.para)}</b></>
      case 'responsavel_entrou': return <>incluiu <b>{String(d.nome)}</b> como responsável</>
      case 'responsavel_saiu': return <>tirou <b>{String(d.nome)}</b> dos responsáveis</>
      case 'rotulo_entrou': return <>pôs o rótulo <b>{String(d.nome)}</b></>
      case 'rotulo_saiu': return <>tirou o rótulo <b>{String(d.nome)}</b></>
      case 'checklist_novo': return <>adicionou o item <b>{String(d.item)}</b></>
      case 'checklist_feito': return <>concluiu o item <b>{String(d.item)}</b></>
      case 'checklist_reaberto': return <>reabriu o item <b>{String(d.item)}</b></>
      case 'campo': {
        const campo = String(d.campo)
        if (campo === 'description') return 'editou a descrição'
        return <>mudou {FIELD[campo] ?? campo}: {fmt(d.de, campo)} → <b>{fmt(d.para, campo)}</b></>
      }
      default: return a.action
    }
  }

  if (error) return <p className="form-error">{error}</p>
  if (list === null) return <p className="hint">Carregando atividade…</p>
  if (list.length === 0) return <p className="hint">Nenhuma atividade registrada ainda.</p>
  return (
    <ol className="activity">
      {[...list].reverse().map((a) => (
        <li key={a.id}>
          <span className="who">{who(a.actorId)}</span> {describe(a)}
          <time className="hint" title={new Date(a.at).toLocaleString('pt-BR')}> · {timeAgo(a.at)}</time>
        </li>
      ))}
    </ol>
  )
}

// ---------------------------------------------------------------------------
// Histórico de etapas (o que alimenta burndown e fluxo cumulativo)

function ColumnHistory({ task, history }: { task: Task; history: StatusChange[] }) {
  const { snap } = useProject()
  if (!snap) return null
  const who = (id: string | null) => personName(snap.members.find((m) => m.id === id))
  return (
    <div className="timeline">
      <div>Criada em <b>{shortDate(dayOfIso(task.createdAt))}</b>{task.createdBy ? ` por ${who(task.createdBy)}` : ''}</div>
      {history.map((h) => (
        <div key={h.id}>
          {h.from ? <>{CATEGORY_LABEL[h.from]} → <b>{CATEGORY_LABEL[h.to]}</b></> : <>Entrou em <b>{CATEGORY_LABEL[h.to]}</b></>}
          {' · '}
          {new Date(h.at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          {h.changedBy ? ` · ${who(h.changedBy)}` : ''}
        </div>
      ))}
      <p className="hint" style={{ margin: '6px 0 0' }}>Mostra as etapas (Backlog, A fazer, Fazendo, Revisão, Feito), que alimentam o burndown e o fluxo cumulativo.</p>
    </div>
  )
}
