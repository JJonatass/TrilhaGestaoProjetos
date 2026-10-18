'use client'

// Modo arquivo: abre um projeto salvo no Google Drive do aluno, sem usar o Supabase.
// Quadro, cronograma, métricas e painel funcionam; as alterações são salvas no mesmo arquivo.

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExportButtons } from '../../components/ExportButtons'
import { Toast, timeAgo } from '../../components/ui'
import { createFileRepo, FILE_USER_ID, type FileRepo } from '../../data/fileRepo'
import type { Session } from '../../data/repo'
import {
  connectDrive, createJsonFile, disconnectDrive, downloadText, driveConfigured, DriveConflictError, listProjectFiles,
  updateJsonFile, type DriveFile,
} from '../../lib/googleDrive'
import { fileNameFor, parseProjectFile, toProjectFile, type ProjectFile } from '../../lib/projectFile'
import { useAuth } from '../../state/AuthProvider'
import { ProjectProvider, useProject } from '../../state/ProjectProvider'
import { Dashboard } from '../../views/Dashboard'
import { Gantt } from '../../views/Gantt'
import { Kanban } from '../../views/Kanban'
import { Metrics } from '../../views/Metrics'
import { TaskEditor } from '../../views/TaskEditor'

type Tab = 'quadro' | 'cronograma' | 'metricas' | 'painel'
const TABS: { id: Tab; label: string }[] = [
  { id: 'quadro', label: 'Quadro' },
  { id: 'cronograma', label: 'Cronograma' },
  { id: 'metricas', label: 'Métricas' },
  { id: 'painel', label: 'Painel' },
]

const FILE_SESSION: Session = { user: { id: FILE_USER_ID, email: '', fullName: 'Você (arquivo)' }, isAdmin: false }

export default function ArquivoPage() {
  const { session } = useAuth()
  const [connected, setConnected] = useState(false)
  const [files, setFiles] = useState<DriveFile[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [opened, setOpened] = useState<{ file: DriveFile | null; data: ProjectFile } | null>(null)
  const localInput = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    setFiles(await listProjectFiles())
  }, [])

  const connect = async () => {
    setBusy(true)
    setError(null)
    try {
      await connectDrive()
      setConnected(true)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const open = async (f: DriveFile) => {
    setBusy(true)
    setError(null)
    try {
      setOpened({ file: f, data: parseProjectFile(await downloadText(f.id)) })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (opened) {
    return (
      <FileProject
        key={opened.file?.id ?? 'local'}
        file={opened.file}
        data={opened.data}
        onClose={() => {
          setOpened(null)
          if (connected) void refresh()
        }}
      />
    )
  }

  return (
    <div className="app">
      <header className="globalbar">
        <Link href="/" className="brand-mark">Trilha</Link>
        <span className="global-link" aria-current="page">Arquivo do Google Drive</span>
        <span className="spacer" />
        {session ? (
          <Link href="/" className="global-link">Voltar aos projetos</Link>
        ) : (
          <Link href="/entrar/" className="global-link">Entrar no sistema</Link>
        )}
      </header>
      <div className="app-body">
        <div className="page narrow">
          <div className="page-head">
            <div>
              <h1>Abrir projeto do Google Drive</h1>
              <p className="hint">
                Projetos salvos pelo botão <strong>Salvar no Drive</strong> ficam como arquivos <span className="code">.trilha.json</span> no seu Google Drive.
                Aqui eles abrem sem o servidor do sistema: dá para ver o quadro, o cronograma e os gráficos, editar e salvar de volta no mesmo arquivo.
              </p>
            </div>
          </div>

          {error && <p className="form-error" style={{ marginBottom: 12 }}>{error}</p>}

          {!driveConfigured() ? (
            <section className="panel">
              <h2>Google Drive não configurado</h2>
              <p className="hint">O administrador do sistema ainda precisa cadastrar o acesso ao Google Drive (Client ID do Google). Enquanto isso, você pode abrir um arquivo que tenha baixado.</p>
            </section>
          ) : !connected ? (
            <section className="panel">
              <h2>Conectar ao Google Drive</h2>
              <p className="hint">O Google pede sua permissão. O sistema só enxerga os arquivos que ele mesmo criou no seu Drive, nada além disso.</p>
              <button type="button" className="btn primary" onClick={() => void connect()} disabled={busy}>
                {busy ? 'Conectando…' : 'Entrar com Google'}
              </button>
            </section>
          ) : (
            <section className="panel">
              <div className="panel-head">
                <h2>Seus projetos no Drive</h2>
                <span className="spacer" />
                <button type="button" className="btn small" onClick={() => void refresh()}>Atualizar</button>
                <button type="button" className="btn small" onClick={() => { disconnectDrive(); setConnected(false); setFiles(null) }}>Desconectar</button>
              </div>
              {files === null ? (
                <p className="empty">Carregando…</p>
              ) : files.length === 0 ? (
                <p className="empty">Nenhum projeto salvo ainda. Dentro de um projeto, use o botão <strong>Salvar no Drive</strong>.</p>
              ) : (
                <div className="list">
                  {files.map((f) => (
                    <button key={f.id} type="button" className="list-row" disabled={busy} onClick={() => void open(f)}>
                      <span className="t">{f.name.replace('.trilha.json', '')}</span>
                      <span className="hint">alterado {timeAgo(f.modifiedTime)}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          <p className="hint" style={{ marginTop: 16 }}>
            Tem o arquivo no computador?{' '}
            <button type="button" className="link" onClick={() => localInput.current?.click()}>Abrir arquivo baixado</button>
            <input
              ref={localInput}
              id="arquivo-local"
              type="file"
              accept=".json,application/json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                try {
                  setOpened({ file: null, data: parseProjectFile(await f.text()) })
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err))
                }
              }}
            />
          </p>
        </div>
      </div>
    </div>
  )
}

function FileProject({ file, data, onClose }: { file: DriveFile | null; data: ProjectFile; onClose: () => void }) {
  const [dirty, setDirty] = useState(false)
  const repo: FileRepo = useMemo(() => createFileRepo(data.projeto, setDirty), [data])

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (repo.dirty()) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [repo])

  return (
    <ProjectProvider projectId={data.projeto.meta.id} repoOverride={repo} sessionOverride={FILE_SESSION} roleOverride="owner">
      <FileFrame file={file} data={data} repo={repo} dirty={dirty} onClose={onClose} />
    </ProjectProvider>
  )
}

function FileFrame({
  file: initialFile, data, repo, dirty, onClose,
}: { file: DriveFile | null; data: ProjectFile; repo: FileRepo; dirty: boolean; onClose: () => void }) {
  const p = useProject()
  const [file, setFile] = useState<DriveFile | null>(initialFile)
  const [tab, setTab] = useState<Tab>('quadro')
  const [version, setVersion] = useState(file?.version)
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  const save = async (force = false) => {
    setSaving(true)
    try {
      const content = JSON.stringify({ ...toProjectFile(repo.current(), data.exportadoPor), exportadoEm: data.exportadoEm }, null, 2)
      if (!file) {
        // arquivo aberto do computador: cria uma cópia no Drive do aluno
        await connectDrive()
        const created = await createJsonFile(fileNameFor(repo.current().meta.name), content)
        setFile(created)
        setVersion(created.version)
        repo.markSaved()
        p.setToast('Cópia criada no seu Google Drive')
        return
      }
      const info = await updateJsonFile(file.id, content, force ? undefined : version)
      setVersion(info.version)
      repo.markSaved()
      setConflict(false)
      p.setToast('Salvo no Google Drive')
    } catch (e) {
      if (e instanceof DriveConflictError) setConflict(true)
      else p.setToast(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  if (!p.snap) return <div className="loading">Abrindo arquivo…</div>

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">Trilha</span>
          <h1 className="project-title">{p.snap.meta.name}</h1>
          <span className="role-tag">{file ? 'Arquivo do Drive' : 'Arquivo local'}</span>
        </div>
        <div className="top-actions">
          <span className="sync" style={{ cursor: 'default' }}>
            <span className={`dot ${dirty ? 'pending' : 'saved'}`} />
            <span>{dirty ? 'Alterações não salvas' : file ? 'Salvo no Drive' : 'Sem alterações'}</span>
          </span>
          {(file || driveConfigured()) && (
            <button type="button" className="btn primary" onClick={() => void save()} disabled={(!!file && !dirty) || saving}>
              {saving ? 'Salvando…' : file ? 'Salvar no Drive' : 'Salvar cópia no Drive'}
            </button>
          )}
          <ExportButtons pdfOnly />
          <button type="button" className="btn" onClick={() => p.newTask('todo')}>+ Tarefa</button>
          <button type="button" className="btn" onClick={() => (dirty ? setConfirmClose(true) : onClose())}>Fechar</button>
        </div>
        <nav className="tabs" aria-label="Visões do projeto">
          {TABS.map((t) => (
            <button key={t.id} type="button" className="tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="sample-note">
        <span>
          <strong>Modo arquivo.</strong> Este projeto está aberto direto do arquivo, sem o servidor do sistema. Exportado em{' '}
          {new Date(data.exportadoEm).toLocaleDateString('pt-BR')} por {data.exportadoPor}.
          {!file && ' Este arquivo veio do computador: use Salvar cópia no Drive para guardar as alterações.'}
        </span>
      </div>
      {conflict && (
        <div className="banner" role="alert">
          <strong>O arquivo foi alterado no Drive por outra pessoa ou aba depois que você o abriu.</strong>
          <button type="button" className="btn small danger" onClick={() => void save(true)}>Manter a minha versão</button>
          <button type="button" className="btn small" onClick={onClose}>Descartar e reabrir</button>
        </div>
      )}

      <main className="main">
        {tab === 'quadro' && <Kanban />}
        {tab === 'cronograma' && <Gantt snap={p.snap} onOpen={p.openTask} />}
        {tab === 'metricas' && <Metrics snap={p.snap} onOpen={p.openTask} />}
        {tab === 'painel' && <Dashboard snap={p.snap} onOpen={p.openTask} />}
      </main>
      {p.editing && <TaskEditor key={`${p.editing.id ?? 'nova'}`} />}
      <Toast text={p.toast} onClose={() => p.setToast(null)} />

      {confirmClose && (
        <div className="scrim center" onMouseDown={(e) => e.target === e.currentTarget && setConfirmClose(false)}>
          <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="close-title">
            <h2 id="close-title">Sair sem salvar?</h2>
            <p className="dialog-text">As alterações feitas neste arquivo ainda não foram salvas{file ? ' no Google Drive' : ''} e serão perdidas.</p>
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setConfirmClose(false)}>Continuar editando</button>
              {(file || driveConfigured()) && <button type="button" className="btn primary" onClick={() => void save().then(onClose)}>Salvar e sair</button>}
              <button type="button" className="btn danger" onClick={onClose}>Sair sem salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
