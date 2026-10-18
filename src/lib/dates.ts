// Utilitários de data trabalhando em dias de calendário locais (AAAA-MM-DD).

const DAY = 86_400_000

export function toDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function today(): string {
  return toDay(new Date())
}

export function addDays(s: string, n: number): string {
  const d = parseDay(s)
  d.setDate(d.getDate() + n)
  return toDay(d)
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / DAY)
}

export function dayOfIso(iso: string): string {
  return toDay(new Date(iso))
}

export function rangeDays(start: string, end: string): string[] {
  const out: string[] = []
  let cur = start
  while (cur <= end) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}

const fmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
export function shortDate(s: string | null): string {
  if (!s) return '—'
  return fmt.format(parseDay(s)).replace('.', '')
}

export function weekday(s: string): number {
  return parseDay(s).getDay()
}
