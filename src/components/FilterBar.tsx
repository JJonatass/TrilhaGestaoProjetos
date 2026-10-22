'use client'

// Barra de filtros do quadro e do cronograma: busca, painel com critérios
// (responsável, tipo, épico, rótulo, prioridade, sprint, prazo) e filtros salvos.

import { useEffect, useRef, useState } from 'react'
import { countCriteria, isEmptyQuery } from '../lib/filters'
import { useProject } from '../state/ProjectProvider'
import { KINDS, PRIORITIES, type FilterQuery, type Kind, type Priority } from '../types'
import { personName } from './ui'
import { KindIcon } from './TaskBits'

const toggle = <T,>(list: T[] | undefined, v: T): T[] | undefined => {
  const cur = list ?? []
  const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]
  return next.length ? next : undefined
}

export function FilterBar({ hint }: { hint?: string }) {
  const p = useProject()
  const { snap, filter, setFilter, visibleTasks, me } = p
  const [open, setOpen] = useState(false)
  const [savedOpen, setSavedOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveShared, setSaveShared] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // fecha os painéis ao clicar fora
  useEffect(() => {
    if (!open && !savedOpen) return
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSavedOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, savedOpen])

  if (!snap) return null
  const set = (patch: Partial<FilterQuery>) => {
    const next = { ...filter, ...patch }
    for (const k of Object.keys(next) as (keyof FilterQuery)[]) if (next[k] === undefined) delete next[k]
    setFilter(next)
  }
  const n = countCriteria({ ...filter, text: undefined })
  const iAmMember = !!me && snap.members.some((m) => m.id === me)
  const filters = snap.savedFilters
  const total = snap.tasks.length

  return (
    <div className="filter-bar" ref={boxRef}>
      <input
        id="filter-text"
        className="input search"
        type="search"
        placeholder="Buscar tarefa (ou #número)"
        value={filter.text ?? ''}
        onChange={(e) => set({ text: e.target.value || undefined })}
      />

      <div className="pop-wrap">
        <button type="button" className={`btn ${n ? 'active' : ''}`} aria-expanded={open} onClick={() => { setOpen(!open); setSavedOpen(false) }}>
          Filtros{n ? ` (${n})` : ''}
        </button>
        {open && (
          <div className="pop filter-pop" role="dialog" aria-label="Filtros">
            <FilterGroup title="Responsável">
              {iAmMember && <Chip on={!!filter.assignees?.includes('me')} onClick={() => set({ assignees: toggle(filter.assignees, 'me') })}>Eu</Chip>}
              {snap.members.filter((m) => m.id !== me).map((m) => (
                <Chip key={m.id} on={!!filter.assignees?.includes(m.id)} onClick={() => set({ assignees: toggle(filter.assignees, m.id) })}>{personName(m)}</Chip>
              ))}
              <Chip on={!!filter.assignees?.includes('none')} onClick={() => set({ assignees: toggle(filter.assignees, 'none') })}>Sem responsável</Chip>
            </FilterGroup>
            <FilterGroup title="Tipo">
              {KINDS.map((k) => (
                <Chip key={k.id} on={!!filter.kinds?.includes(k.id)} onClick={() => set({ kinds: toggle<Kind>(filter.kinds, k.id) })}>
                  <KindIcon kind={k.id} /> {k.label}
                </Chip>
              ))}
            </FilterGroup>
            {snap.epics.length > 0 && (
              <FilterGroup title="Épico">
                {snap.epics.map((e) => (
                  <Chip key={e.id} on={!!filter.epics?.includes(e.id)} onClick={() => set({ epics: toggle(filter.epics, e.id) })}>
                    <i className="dot" style={{ background: e.color }} /> {e.name}
                  </Chip>
                ))}
                <Chip on={!!filter.epics?.includes(0)} onClick={() => set({ epics: toggle(filter.epics, 0) })}>Sem épico</Chip>
              </FilterGroup>
            )}
            {snap.labels.length > 0 && (
              <FilterGroup title="Rótulo">
                {snap.labels.map((l) => (
                  <Chip key={l.id} on={!!filter.labels?.includes(l.id)} onClick={() => set({ labels: toggle(filter.labels, l.id) })}>
                    <i className="dot" style={{ background: l.color }} /> {l.name}
                  </Chip>
                ))}
              </FilterGroup>
            )}
            <FilterGroup title="Prioridade">
              {PRIORITIES.map((x) => (
                <Chip key={x.id} on={!!filter.priorities?.includes(x.id)} onClick={() => set({ priorities: toggle<Priority>(filter.priorities, x.id) })}>{x.label}</Chip>
              ))}
            </FilterGroup>
            <div className="filter-row">
              <label className="field">
                <span>Sprint</span>
                <select
                  id="filter-sprint"
                  className="input"
                  value={filter.sprint === undefined ? '' : String(filter.sprint)}
                  onChange={(e) => {
                    const v = e.target.value
                    set({ sprint: v === '' ? undefined : v === 'atual' || v === 'sem' ? v : Number(v) })
                  }}
                >
                  <option value="">Todos</option>
                  <option value="atual">Sprint atual</option>
                  {snap.sprints.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.closedAt ? ' (encerrado)' : ''}</option>
                  ))}
                  <option value="sem">Sem sprint</option>
                </select>
              </label>
              <label className="field">
                <span>Prazo</span>
                <select
                  id="filter-due"
                  className="input"
                  value={filter.due ?? ''}
                  onChange={(e) => set({ due: (e.target.value || undefined) as FilterQuery['due'] })}
                >
                  <option value="">Qualquer</option>
                  <option value="atrasadas">Atrasadas</option>
                  <option value="semana">Vencem em 7 dias</option>
                  <option value="sem-prazo">Sem prazo</option>
                </select>
              </label>
            </div>
            <div className="pop-foot">
              <span className="hint">{visibleTasks.length} de {total} tarefas</span>
              <button type="button" className="btn small" onClick={() => setFilter({})} disabled={isEmptyQuery(filter)}>Limpar</button>
              <button type="button" className="btn small primary" onClick={() => setOpen(false)}>Pronto</button>
            </div>
          </div>
        )}
      </div>

      {p.serverFeatures && (
        <div className="pop-wrap">
          <button type="button" className="btn" aria-expanded={savedOpen} onClick={() => { setSavedOpen(!savedOpen); setOpen(false) }}>
            Filtros salvos{filters.length ? ` (${filters.length})` : ''}
          </button>
          {savedOpen && (
            <div className="pop saved-pop" role="dialog" aria-label="Filtros salvos">
              {filters.length === 0 && <p className="hint" style={{ margin: '0 0 8px' }}>Nenhum filtro salvo ainda.</p>}
              <ul className="saved-list">
                {filters.map((f) => (
                  <li key={f.id}>
                    <button type="button" className="link" onClick={() => { setFilter(f.query); setSavedOpen(false) }}>{f.name}</button>
                    <span className="hint">{f.shared ? 'da equipe' : 'só meu'}</span>
                    {f.ownerId === me && (
                      <button type="button" className="icon-btn" aria-label={`Excluir o filtro ${f.name}`} title="Excluir" onClick={() => void p.deleteFilter(f.id)}>×</button>
                    )}
                  </li>
                ))}
              </ul>
              <form
                className="save-filter"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!saveName.trim()) return
                  void p.saveFilter(saveName.trim(), saveShared).then(() => {
                    setSaveName('')
                    setSaveShared(false)
                  })
                }}
              >
                <span className="hint">Salvar os filtros atuais{isEmptyQuery(filter) ? ' (escolha algum filtro antes)' : ''}</span>
                <input id="filter-save-name" className="input" placeholder="Nome do filtro" value={saveName} onChange={(e) => setSaveName(e.target.value)} maxLength={60} />
                <label className="check">
                  <input type="checkbox" checked={saveShared} onChange={(e) => setSaveShared(e.target.checked)} /> Mostrar para a equipe
                </label>
                <button type="submit" className="btn small primary" disabled={!saveName.trim() || isEmptyQuery(filter)}>Salvar filtro</button>
              </form>
            </div>
          )}
        </div>
      )}

      {!isEmptyQuery(filter) && (
        <span className="filter-summary">
          {visibleTasks.length} de {total}
          <button type="button" className="link" onClick={() => setFilter({})}>limpar</button>
        </span>
      )}
      <span className="spacer" />
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="filter-group">
      <span className="filter-title">{title}</span>
      <div className="chips">{children}</div>
    </div>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  )
}
