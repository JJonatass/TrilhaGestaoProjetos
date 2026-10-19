// Formato do arquivo .trilha.json: o projeto completo, independente do Supabase.

import type { Snapshot } from '../types'

export const FILE_FORMAT = 'trilha-projeto'
export const FILE_VERSION = 1
export const FILE_SUFFIX = '.trilha.json'

export interface ProjectFile {
  formato: typeof FILE_FORMAT
  versao: number
  exportadoEm: string
  exportadoPor: string
  observacao: string
  projeto: Snapshot
}

export function toProjectFile(snap: Snapshot, exportedBy: string): ProjectFile {
  // Convites e mensagens privadas não vão para o arquivo
  const projeto: Snapshot = { ...snap, invites: [] }
  return {
    formato: FILE_FORMAT,
    versao: FILE_VERSION,
    exportadoEm: new Date().toISOString(),
    exportadoPor: exportedBy,
    observacao: 'Cópia do projeto exportada do Trilha. Abra em /arquivo, com login do Google, para ver e editar sem o servidor.',
    projeto,
  }
}

export function parseProjectFile(text: string): ProjectFile {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('O arquivo não é um JSON válido.')
  }
  const f = data as Partial<ProjectFile>
  if (f.formato !== FILE_FORMAT || !f.projeto) throw new Error('Este arquivo não é um projeto do Trilha.')
  if ((f.versao ?? 0) > FILE_VERSION) throw new Error('Arquivo criado por uma versão mais nova do Trilha.')
  const p = f.projeto
  if (!p.meta || !Array.isArray(p.tasks) || !Array.isArray(p.history)) throw new Error('Arquivo incompleto ou corrompido.')
  p.members ??= []
  p.sprints ??= []
  p.invites = []
  p.meta.expiresAt ??= null
  p.meta.driveExportAllowed ??= true
  p.meta.maxMembers ??= null
  p.tasks = p.tasks.map((t) => ({ ...t, assignees: t.assignees ?? [], dependsOn: t.dependsOn ?? [] }))
  return f as ProjectFile
}

export function fileNameFor(projectName: string): string {
  const clean = projectName.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Projeto'
  return `${clean}${FILE_SUFFIX}`
}
