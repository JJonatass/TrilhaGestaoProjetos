'use client'

// Exclusão com confirmação forte: é preciso digitar o nome do projeto.

import { useEffect, useState } from 'react'

export function DeleteProjectDialog({
  projectName, onConfirm, onClose,
}: { projectName: string; onConfirm: () => Promise<void>; onClose: () => void }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const matches = typed.trim() === projectName.trim()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  return (
    <div className="scrim center" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="del-title" aria-describedby="del-desc">
        <h2 id="del-title">Excluir “{projectName}”?</h2>
        <div id="del-desc" className="dialog-text">
          <p>Isso apaga para todos os integrantes, de forma definitiva:</p>
          <ul>
            <li>todas as tarefas, responsáveis e dependências;</li>
            <li>sprints e o histórico de colunas (gráficos e tempos);</li>
            <li>convites pendentes e as mensagens com o administrador.</li>
          </ul>
          <p>Antes de excluir, você pode baixar o <strong>relatório em PDF</strong> pelo botão no topo do projeto.</p>
        </div>
        <label className="field" htmlFor="del-confirm">
          <span>Digite o nome do projeto para confirmar</span>
          <input
            id="del-confirm"
            className="input"
            autoComplete="off"
            autoFocus
            placeholder={projectName}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </label>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancelar</button>
          <button
            type="button"
            className="btn danger armed"
            disabled={!matches || busy}
            onClick={async () => {
              setBusy(true)
              await onConfirm()
              setBusy(false)
            }}
          >
            {busy ? 'Excluindo…' : 'Excluir definitivamente'}
          </button>
        </div>
      </div>
    </div>
  )
}
