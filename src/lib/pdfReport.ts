// Relatório do projeto em PDF, gerado no navegador (jsPDF + autotable).

import { columnOf, projectColumns } from './columns'
import { parseDay, shortDate, today } from './dates'
import { formatDate } from './expiry'
import { burn, criticalPath, daysLate, flowTimes, isLate, projectHealth, schedule, throughput } from './metrics'
import { PHASES, PRIORITIES, ROLE_LABEL, STATUSES, type Snapshot, type Task } from '../types'

// As fontes padrão do PDF cobrem português, mas não setas e símbolos especiais
const clean = (s: string) =>
  s
    .replace(/→/g, '->')
    .replace(/≈/g, '~')
    .replace(/[^\x20-\x7E -ÿ–—‘’“”•…\n]/g, '')

type Rgb = [number, number, number]
const INK: Rgb = [21, 32, 28]
const MUTED: Rgb = [91, 106, 101]
const ACCENT: Rgb = [11, 110, 95]
const LATE: Rgb = [192, 57, 43]
const LINE: Rgb = [211, 219, 216]
const STATUS_RGB: Record<string, Rgb> = {
  backlog: [154, 166, 162],
  todo: [85, 119, 176],
  doing: [209, 139, 28],
  review: [138, 95, 192],
  done: [47, 143, 91],
}

export async function downloadProjectPdf(snap: Snapshot, generatedBy: string) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 14
  let y = M

  const name = (id: string | null) => {
    const m = snap.members.find((x) => x.id === id)
    return m ? m.fullName || m.email : 'Ex-integrante'
  }
  const cols = projectColumns(snap.meta)
  const colLabel = (t: Task) => columnOf(t, cols).label
  const prioLabel = (s: string) => PRIORITIES.find((x) => x.id === s)?.label ?? s
  const fmtDay = (d: string | null) => (d ? parseDay(d).toLocaleDateString('pt-BR') : '-')
  const num = (v: number | null) => (v === null ? '-' : v.toFixed(1).replace('.', ','))

  const ensure = (h: number) => {
    if (y + h > H - 16) {
      doc.addPage()
      y = M
    }
  }
  const title = (text: string) => {
    ensure(14)
    doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...INK)
    doc.text(clean(text), M, y + 5)
    y += 9
  }
  const para = (text: string, color: Rgb = MUTED, size = 9.5) => {
    doc.setFont('helvetica', 'normal').setFontSize(size).setTextColor(...color)
    const lines = doc.splitTextToSize(clean(text), W - 2 * M)
    ensure(lines.length * 4.4)
    doc.text(lines, M, y + 3.5)
    y += lines.length * 4.4 + 1.5
  }
  const table = (head: string[], body: (string | number)[][], opts: Record<string, unknown> = {}) => {
    autoTable(doc, {
      startY: y,
      head: [head.map(clean)],
      body: body.map((r) => r.map((c) => clean(String(c)))),
      margin: { left: M, right: M },
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.8, textColor: INK, lineColor: LINE, lineWidth: 0.1 },
      headStyles: { fillColor: [232, 236, 234], textColor: MUTED, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 249] },
      ...opts,
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
  }

  // ---------- dados ----------
  const sched = schedule(snap.tasks)
  const critical = criticalPath(snap.tasks, sched)
  const health = projectHealth(snap)
  const times = flowTimes(snap)
  const work = snap.tasks.filter((t) => !t.milestone)
  const totalPts = work.reduce((s, t) => s + t.points, 0)
  const donePts = work.filter((t) => t.status === 'done').reduce((s, t) => s + t.points, 0)
  const late = snap.tasks.filter((t) => isLate(t)).sort((a, b) => daysLate(b) - daysLate(a))
  const end = [...sched.values()].reduce((m, s) => (s.end > m ? s.end : m), '')
  const owner = snap.members.find((m) => m.role === 'owner')

  // ---------- capa ----------
  doc.setFillColor(...ACCENT).rect(0, 0, W, 3, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...ACCENT)
  doc.text('TRILHA · RELATÓRIO DO PROJETO', M, y + 4)
  y += 9
  doc.setFont('helvetica', 'bold').setFontSize(20).setTextColor(...INK)
  const nameLines = doc.splitTextToSize(clean(snap.meta.name), W - 2 * M)
  doc.text(nameLines, M, y + 6)
  y += nameLines.length * 8 + 2
  para(
    `Gerado em ${new Date().toLocaleString('pt-BR')} por ${generatedBy}. ` +
      `Criado por ${owner ? owner.fullName || owner.email : '-'} em ${new Date(snap.meta.createdAt).toLocaleDateString('pt-BR')}. ` +
      `${snap.members.length} integrante(s), ${snap.tasks.length} tarefa(s).` +
      (snap.meta.expiresAt ? ` Prazo de existência: ${formatDate(snap.meta.expiresAt)}.` : ''),
  )
  y += 2

  // ---------- resumo ----------
  title('Resumo')
  const healthLabel = { verde: 'No prazo', amarelo: 'Atenção', vermelho: 'Em risco' }[health.health]
  table(['Indicador', 'Valor', 'Como ler'], [
    ['Situação', healthLabel, health.reasons.join('; ')],
    ['Concluído', `${totalPts ? Math.round((donePts / totalPts) * 100) : 0}% (${donePts} de ${totalPts} pts)`, 'Esforço estimado já em Feito'],
    ['Tarefas atrasadas', String(late.length), 'Prazo vencido e não concluídas'],
    ['Bugs abertos', String(snap.tasks.filter((t) => t.kind === 'bug' && t.status !== 'done').length), 'Itens do tipo bug ainda não concluídos'],
    ['Lead time médio', `${num(times.leadTime)} dias`, 'Da criação até Feito'],
    ['Cycle time médio', `${num(times.cycleTime)} dias`, 'De Fazendo até Feito'],
    ['Término previsto', end ? fmtDay(end) : '-', 'Maior data de fim no cronograma'],
  ], { columnStyles: { 0: { fontStyle: 'bold', cellWidth: 38 }, 1: { cellWidth: 48 } } })

  // ---------- burndown do sprint atual ----------
  const now = today()
  const sprint = snap.sprints.find((s) => s.start <= now && s.end >= now) ?? snap.sprints[snap.sprints.length - 1]
  if (sprint) {
    const pts = burn(snap, sprint)
    const scope = Math.max(1, ...pts.map((p) => p.scope))
    title(`Burndown · ${sprint.name} (${fmtDay(sprint.start)} a ${fmtDay(sprint.end)})`)
    ensure(62)
    const cx = M + 10
    const cw = W - 2 * M - 14
    const ch = 48
    const cy = y + 2
    const xs = (i: number) => cx + (pts.length <= 1 ? 0 : (i * cw) / (pts.length - 1))
    const ys = (v: number) => cy + ch - (v / scope) * ch
    doc.setDrawColor(...LINE).setLineWidth(0.2)
    ;[0, 0.5, 1].forEach((f) => {
      doc.line(cx, ys(scope * f), cx + cw, ys(scope * f))
      doc.setFontSize(7).setTextColor(...MUTED).text(String(Math.round(scope * f)), cx - 2, ys(scope * f) + 1, { align: 'right' })
    })
    doc.setDrawColor(...MUTED).setLineWidth(0.3)
    doc.setLineDashPattern([1.2, 1], 0)
    doc.line(xs(0), ys(pts[0].ideal), xs(pts.length - 1), ys(pts[pts.length - 1].ideal))
    doc.setLineDashPattern([], 0)
    doc.setDrawColor(...ACCENT).setLineWidth(0.7)
    const known = pts.map((p, i) => ({ p, i })).filter(({ p }) => p.remaining !== null)
    for (let k = 1; k < known.length; k++) {
      doc.line(xs(known[k - 1].i), ys(known[k - 1].p.remaining!), xs(known[k].i), ys(known[k].p.remaining!))
    }
    doc.setFontSize(7).setTextColor(...MUTED)
    doc.text(shortDate(pts[0].day), xs(0), cy + ch + 4)
    doc.text(shortDate(pts[pts.length - 1].day), xs(pts.length - 1), cy + ch + 4, { align: 'right' })
    y = cy + ch + 7
    const last = known[known.length - 1]?.p
    para(
      `Linha verde: pontos que faltam (real). Tracejada: ritmo ideal. ` +
        (last ? `Em ${fmtDay(last.day)}: ${last.done} de ${last.scope} pontos concluídos.` : ''),
    )
    y += 2
  }

  // ---------- progresso por fase ----------
  title('Progresso por fase')
  const phaseRows = PHASES.flatMap((ph) => {
    const items = snap.tasks.filter((t) => t.phase === ph)
    if (!items.length) return []
    const tot = items.reduce((s, t) => s + (t.milestone ? 0 : t.points), 0)
    const done = items.filter((t) => t.status === 'done').reduce((s, t) => s + (t.milestone ? 0 : t.points), 0)
    return [[ph, items.length, items.filter((t) => t.status === 'done').length, `${done}/${tot}`, `${tot ? Math.round((done / tot) * 100) : 0}%`]]
  })
  table(['Fase', 'Tarefas', 'Concluídas', 'Pontos', 'Progresso'], phaseRows)

  // ---------- épicos ----------
  if (snap.epics.length) {
    title('Progresso por épico')
    table(
      ['Épico', 'Tarefas', 'Concluídas', 'Pontos', 'Progresso'],
      snap.epics.map((e) => {
        const items = snap.tasks.filter((t) => t.epicId === e.id)
        const tot = items.reduce((a, t) => a + (t.milestone ? 0 : t.points), 0)
        const done = items.filter((t) => t.status === 'done').reduce((a, t) => a + (t.milestone ? 0 : t.points), 0)
        return [e.name, items.length, items.filter((t) => t.status === 'done').length, `${done}/${tot}`, `${tot ? Math.round((done / tot) * 100) : 0}%`]
      }),
    )
  }

  // ---------- equipe ----------
  title('Equipe')
  table(
    ['Integrante', 'E-mail', 'Papel', 'Tarefas abertas', 'Pontos concluídos'],
    snap.members.map((m) => {
      const mine = snap.tasks.filter((t) => t.assignees.includes(m.id))
      return [
        m.fullName || '-',
        m.email,
        ROLE_LABEL[m.role],
        mine.filter((t) => t.status !== 'done').length,
        mine.filter((t) => t.status === 'done' && !t.milestone).reduce((s, t) => s + t.points, 0),
      ]
    }),
  )

  // ---------- prazos vencidos ----------
  if (late.length) {
    title('Prazos vencidos')
    table(
      ['Tarefa', 'Responsáveis', 'Coluna', 'Prazo', 'Atraso'],
      late.map((t) => [t.title, t.assignees.map(name).join(', ') || '-', colLabel(t), fmtDay(t.due), `${daysLate(t)} dias`]),
      { bodyStyles: { textColor: LATE } },
    )
  }

  // ---------- tarefas ----------
  title('Tarefas')
  const order = STATUSES.map((s) => s.id)
  const tasks = [...snap.tasks].sort(
    (a, b) => order.indexOf(a.status) - order.indexOf(b.status) || (sched.get(a.id)!.start).localeCompare(sched.get(b.id)!.start),
  )
  table(
    ['Tarefa', 'Fase', 'Coluna', 'Responsáveis', 'Prior.', 'Pts', 'Início', 'Prazo'],
    tasks.map((t) => [
      (t.milestone ? '[Marco] ' : t.kind === 'bug' ? '[Bug] ' : t.kind === 'historia' ? '[História] ' : '') +
        t.title +
        (critical.has(t.id) ? ' *' : '') +
        (t.epicId && snap.epics.find((e) => e.id === t.epicId) ? `\nÉpico: ${snap.epics.find((e) => e.id === t.epicId)!.name}` : '') +
        (t.labels.length ? `\nRótulos: ${t.labels.map((l) => snap.labels.find((x) => x.id === l)?.name).filter(Boolean).join(', ')}` : '') +
        (t.checklist.length ? `\nChecklist: ${t.checklist.filter((c) => c.done).length}/${t.checklist.length}` : ''),
      t.phase,
      colLabel(t),
      t.assignees.map(name).join(', ') || '-',
      prioLabel(t.priority),
      t.milestone ? '-' : t.points,
      fmtDay(t.start ?? sched.get(t.id)?.start ?? null),
      fmtDay(t.due ?? sched.get(t.id)?.end ?? null),
    ]),
    {
      columnStyles: { 0: { cellWidth: 52 }, 5: { halign: 'right' } },
      didParseCell: (data: { section: string; column: { index: number }; row: { index: number }; cell: { styles: { textColor: Rgb; fontStyle: string } } }) => {
        if (data.section !== 'body') return
        const t = tasks[data.row.index]
        if (data.column.index === 2) data.cell.styles.textColor = STATUS_RGB[t.status]
        if (data.column.index === 7 && isLate(t)) data.cell.styles.textColor = LATE
      },
    },
  )
  para('* Faz parte do caminho crítico: se atrasar, atrasa o projeto. Datas sem prazo informado foram estimadas pela pontuação e pelas dependências.')

  // ---------- sprints e vazão ----------
  if (snap.sprints.length) {
    title('Sprints')
    table(
      ['Sprint', 'Período', 'Objetivo', 'Situação', 'Pontos entregues'],
      snap.sprints.map((s) => {
        if (s.report) {
          return [s.name, `${fmtDay(s.start)} a ${fmtDay(s.end)}`, s.goal || '-', `Encerrado (${s.report.carried.length} levada${s.report.carried.length === 1 ? '' : 's'} adiante)`, `${s.report.completedPoints} de ${s.report.committedPoints}`]
        }
        const ts = snap.tasks.filter((t) => t.sprintId === s.id)
        return [s.name, `${fmtDay(s.start)} a ${fmtDay(s.end)}`, s.goal || '-', 'Aberto', `${ts.filter((t) => t.status === 'done').reduce((a, t) => a + t.points, 0)} de ${ts.reduce((a, t) => a + t.points, 0)}`]
      }),
    )
  }
  const thr = throughput(snap)
  title('Vazão semanal (tarefas concluídas)')
  table(
    thr.map((w) => (w.label === 'esta' ? 'Esta semana' : `${w.label.replace('-', '')} sem. atrás`)),
    [thr.map((w) => w.count)],
  )

  // ---------- rodapé ----------
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED)
    doc.text(clean(`${snap.meta.name} · Trilha de Projetos`), M, H - 8)
    doc.text(`Página ${i} de ${pages}`, W - M, H - 8, { align: 'right' })
  }

  const fileDay = today()
  const slug = snap.meta.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'projeto'
  doc.save(`relatorio-${slug}-${fileDay}.pdf`)
}
