// Google Drive do próprio aluno, direto do navegador.
// - Login com Google Identity Services (token curto, sem servidor).
// - Escopo drive.file: o app só enxerga os arquivos que ele mesmo criou.

import { FILE_SUFFIX } from './projectFile'

const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const GIS_SRC = 'https://accounts.google.com/gsi/client'
const API = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''
export const driveConfigured = () => !!GOOGLE_CLIENT_ID

interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
}
interface TokenClient {
  requestAccessToken(opts?: { prompt?: string }): void
  callback: (r: TokenResponse) => void
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(cfg: { client_id: string; scope: string; callback: (r: TokenResponse) => void }): TokenClient
          revoke(token: string, done?: () => void): void
        }
      }
    }
  }
}

export interface DriveFile {
  id: string
  name: string
  version: string
  modifiedTime: string
  webViewLink?: string
}

export class DriveConflictError extends Error {
  constructor() {
    super('O arquivo foi alterado no Google Drive depois que você o abriu.')
  }
}

let gisPromise: Promise<void> | null = null
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = GIS_SRC
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => {
        gisPromise = null
        reject(new Error('Não foi possível carregar o login do Google. Verifique a conexão.'))
      }
      document.head.appendChild(s)
    })
  }
  return gisPromise
}

let token: string | null = null
let expiresAt = 0
let client: TokenClient | null = null

export const driveConnected = () => !!token && Date.now() < expiresAt

/** Abre a janela de permissão do Google. Precisa ser chamado a partir de um clique. */
export async function connectDrive(): Promise<void> {
  if (!GOOGLE_CLIENT_ID) throw new Error('O Google Drive ainda não foi configurado neste sistema.')
  if (driveConnected()) return
  await loadGis()
  const g = window.google
  if (!g) throw new Error('Login do Google indisponível.')
  await new Promise<void>((resolve, reject) => {
    const cb = (r: TokenResponse) => {
      if (r.error || !r.access_token) {
        reject(new Error(r.error === 'access_denied' ? 'Permissão negada no Google.' : 'Falha no login do Google.'))
        return
      }
      token = r.access_token
      expiresAt = Date.now() + ((r.expires_in ?? 3600) - 60) * 1000
      resolve()
    }
    if (!client) client = g.accounts.oauth2.initTokenClient({ client_id: GOOGLE_CLIENT_ID, scope: SCOPE, callback: cb })
    else client.callback = cb
    client.requestAccessToken({ prompt: '' })
  })
}

export function disconnectDrive() {
  if (token) window.google?.accounts.oauth2.revoke(token)
  token = null
  expiresAt = 0
}

async function req(url: string, init: RequestInit = {}): Promise<Response> {
  if (!driveConnected()) throw new Error('Conecte o Google Drive novamente.')
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } })
  if (res.status === 401) {
    token = null
    throw new Error('A sessão do Google expirou. Conecte de novo.')
  }
  if (!res.ok) throw new Error(`Google Drive respondeu ${res.status}: ${(await res.text()).slice(0, 160)}`)
  return res
}

const FIELDS = 'id,name,version,modifiedTime,webViewLink'

export async function listProjectFiles(): Promise<DriveFile[]> {
  const q = encodeURIComponent(`name contains '${FILE_SUFFIX}' and trashed = false`)
  const res = await req(`${API}?q=${q}&spaces=drive&orderBy=modifiedTime desc&pageSize=100&fields=files(${FIELDS})`)
  return ((await res.json()) as { files: DriveFile[] }).files
}

export async function findByName(name: string): Promise<DriveFile | null> {
  const safe = name.replace(/'/g, "\\'")
  const q = encodeURIComponent(`name = '${safe}' and trashed = false`)
  const res = await req(`${API}?q=${q}&spaces=drive&fields=files(${FIELDS})`)
  return ((await res.json()) as { files: DriveFile[] }).files[0] ?? null
}

export async function getFileInfo(id: string): Promise<DriveFile> {
  return (await req(`${API}/${id}?fields=${FIELDS}`)).json()
}

export async function downloadText(id: string): Promise<string> {
  return (await req(`${API}/${id}?alt=media`)).text()
}

export async function createJsonFile(name: string, content: string): Promise<DriveFile> {
  const body = new FormData()
  body.append('metadata', new Blob([JSON.stringify({ name, mimeType: 'application/json', description: 'Projeto do Trilha' })], { type: 'application/json' }))
  body.append('file', new Blob([content], { type: 'application/json' }))
  return (await req(`${UPLOAD}?uploadType=multipart&fields=${FIELDS}`, { method: 'POST', body })).json()
}

/** Grava por cima. Com expectedVersion, recusa se alguém salvou outra versão antes. */
export async function updateJsonFile(id: string, content: string, expectedVersion?: string): Promise<DriveFile> {
  if (expectedVersion) {
    const info = await getFileInfo(id)
    if (info.version !== expectedVersion) throw new DriveConflictError()
  }
  return (
    await req(`${UPLOAD}/${id}?uploadType=media&fields=${FIELDS}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: content,
    })
  ).json()
}
