'use client'

// Botões do topo do projeto: relatório em PDF e cópia no Google Drive do aluno.

import Link from 'next/link'
import { useState } from 'react'
import { friendlyError } from '../data/repo'
import { connectDrive, createJsonFile, driveConfigured, findByName, updateJsonFile, type DriveFile } from '../lib/googleDrive'
import { downloadProjectPdf } from '../lib/pdfReport'
import { fileNameFor, toProjectFile } from '../lib/projectFile'
import { useAuth } from '../state/AuthProvider'
import { useProject } from '../state/ProjectProvider'
import { personName } from './ui'

export function ExportButtons({ pdfOnly = false }: { pdfOnly?: boolean }) {
  const { snap, setToast, isAdminView } = useProject()
  const { session } = useAuth()
  const [busy, setBusy] = useState<'pdf' | 'drive' | null>(null)
  const [saved, setSaved] = useState<DriveFile | null>(null)
  if (!snap) return null
  const who = session ? personName(session.user) : 'Usuário'
  const allowed = snap.meta.driveExportAllowed
  const canDrive = !isAdminView && !pdfOnly

  const pdf = async () => {
    setBusy('pdf')
    try {
      await downloadProjectPdf(snap, who)
    } catch (e) {
      setToast(`Não foi possível gerar o PDF: ${friendlyError(e)}`)
    } finally {
      setBusy(null)
    }
  }

  const drive = async () => {
    if (!allowed) {
      setToast('Salvar no Google Drive depende de autorização do administrador. Peça pela aba Mensagens.')
      return
    }
    if (!driveConfigured()) {
      setToast('O Google Drive ainda não foi configurado neste sistema. Avise o administrador.')
      return
    }
    setBusy('drive')
    try {
      await connectDrive()
      const name = fileNameFor(snap.meta.name)
      const content = JSON.stringify(toProjectFile(snap, who), null, 2)
      const existing = await findByName(name)
      const file = existing ? await updateJsonFile(existing.id, content) : await createJsonFile(name, content)
      setSaved(file)
    } catch (e) {
      setToast(friendlyError(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <button type="button" className="btn" onClick={() => void pdf()} disabled={busy !== null} title="Baixar relatório completo em PDF">
        {busy === 'pdf' ? 'Gerando…' : 'Relatório PDF'}
      </button>
      {canDrive && (
        <button
          type="button"
          className={`btn ${allowed ? '' : 'locked'}`}
          onClick={() => void drive()}
          disabled={busy !== null}
          aria-disabled={!allowed}
          title={allowed ? 'Salvar uma cópia completa no seu Google Drive' : 'Aguardando autorização do administrador'}
        >
          {busy === 'drive' ? 'Salvando…' : 'Salvar no Drive'}
        </button>
      )}
      {saved && (
        <div className="scrim center" onMouseDown={(e) => e.target === e.currentTarget && setSaved(null)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="saved-title">
            <h2 id="saved-title">Projeto salvo no seu Google Drive</h2>
            <div className="dialog-text">
              <p>O arquivo <strong>{saved.name}</strong> tem o projeto completo: tarefas, responsáveis, sprints e histórico. Mensagens e convites não vão no arquivo.</p>
              <p>Ele pode ser aberto a qualquer momento em <strong>Abrir arquivo do Drive</strong>, mesmo depois que o projeto for apagado deste sistema. Salvar de novo atualiza o mesmo arquivo.</p>
            </div>
            <div className="dialog-actions">
              {saved.webViewLink && (
                <a className="btn" href={saved.webViewLink} target="_blank" rel="noreferrer">Ver no Google Drive</a>
              )}
              <Link className="btn" href="/arquivo/">Abrir arquivo do Drive</Link>
              <button type="button" className="btn primary" onClick={() => setSaved(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
