// Prazo de existência dos projetos: conversões e textos.

import { toDay } from './dates'

export const WARN_DAYS = 14

/** Data do campo (AAAA-MM-DD) → fim daquele dia no horário local, em ISO. */
export function endOfDayIso(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59).toISOString()
}

/** ISO → AAAA-MM-DD local, para preencher um campo de data. */
export function isoToDay(iso: string | null): string {
  return iso ? toDay(new Date(iso)) : ''
}

export function daysLeft(iso: string | null): number | null {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

export function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : ''
}

export function expiryLabel(iso: string | null): string | null {
  const d = daysLeft(iso)
  if (d === null) return null
  if (d < 0) return 'Prazo encerrado: será apagado na próxima limpeza'
  if (d === 0) return 'Será apagado hoje'
  if (d === 1) return 'Será apagado amanhã'
  return `Será apagado em ${d} dias`
}
