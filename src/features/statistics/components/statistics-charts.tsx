"use client"

import type { ReactNode } from "react"
import { useState } from "react"

import { Minus, TrendingDown, TrendingUp } from "lucide-react"

import {
  type DailyBucket,
  formatBRDate,
  formatSmartDate,
  weekdayOfKey,
} from "@/application/study-analytics/engine/stats-engine"

// ─── Card de seção ──────────────────────────────────────────────────────────

export function SectionCard({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-xl border bg-card p-5 shadow-sm space-y-4 ${className}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-sm">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

// ─── Estado vazio honesto ───────────────────────────────────────────────────

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-full min-h-24 flex items-center justify-center text-center text-xs text-muted-foreground border rounded-lg bg-muted/10 px-4 py-8">
      {message}
    </div>
  )
}

// ─── Chips de classificação ─────────────────────────────────────────────────

export function ClassificationChip({ classification }: { classification: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    DOMINADO: {
      label: "Dominado",
      cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
    },
    EM_DESENVOLVIMENTO: {
      label: "Em desenvolvimento",
      cls: "bg-amber-500/10 text-amber-600 border-amber-500/30",
    },
    ATENCAO: { label: "Atenção", cls: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
    CRITICO: { label: "Crítico", cls: "bg-rose-500/10 text-rose-600 border-rose-500/30" },
  }
  const c = map[classification] ?? {
    label: classification,
    cls: "bg-muted text-muted-foreground border",
  }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${c.cls}`}
    >
      {c.label}
    </span>
  )
}

// ─── Delta (subiu / caiu / igual) ───────────────────────────────────────────

export function DeltaBadge({
  delta,
  invert = false,
  suffix = "",
}: {
  delta: number | null
  invert?: boolean
  suffix?: string
}) {
  if (delta === null || delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
        <Minus className="h-3 w-3" /> igual
      </span>
    )
  }
  const up = invert ? delta < 0 : delta > 0
  const sign = delta > 0 ? "+" : ""
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-bold ${up ? "text-emerald-600" : "text-rose-600"}`}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {sign}
      {Math.round(Math.abs(delta))}
      {suffix}
    </span>
  )
}

// ─── Barra de progresso simples ─────────────────────────────────────────────

export function ProgressBar({
  pct,
  barClass = "bg-[#2563EB]",
  height = "h-2",
}: {
  pct: number
  barClass?: string
  height?: string
}) {
  return (
    <div className={`w-full ${height} bg-muted/40 rounded-full overflow-hidden`}>
      <div
        className={`${height} ${barClass} rounded-full transition-all`}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  )
}

// ─── Mini métrica ───────────────────────────────────────────────────────────

export function Metric({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  accent?: boolean
}) {
  return (
    <div className="rounded-lg border bg-card p-3 min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 font-black text-xl ${accent ? "text-[#2563EB]" : "text-foreground"}`}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Heatmap estilo GitHub ──────────────────────────────────────────────────

const HEAT_LEVELS: Record<number, string> = {
  0: "bg-muted/30",
  1: "bg-[#2563EB]/25",
  2: "bg-[#2563EB]/45",
  3: "bg-[#2563EB]/70",
  4: "bg-[#2563EB]",
}

const MONTH_NAMES = [
  "",
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
]

export function HeatmapCalendar({
  cells,
  now,
  timezone,
}: {
  cells: { date: string; minutes: number; level: 0 | 1 | 2 | 3 | 4 }[]
  now: Date
  timezone: string
}) {
  const [hover, setHover] = useState<{ date: string; minutes: number } | null>(null)
  const byDate = new Map(cells.map((c) => [c.date, c]))

  const firstCell = cells.length > 0 ? cells[0] : undefined
  const firstWeekday = firstCell ? (weekdayOfKey(firstCell.date) ?? 0) : 0
  const grid: (string | null)[][] = []
  let week: (string | null)[] = new Array(firstWeekday).fill(null)
  cells.forEach((c) => {
    week.push(c.date)
    if (week.length === 7) {
      grid.push(week)
      week = []
    }
  })
  if (week.length > 0) {
    while (week.length < 7) week.push(null)
    grid.push(week)
  }

  let prevMonth = ""
  const colLabels = grid.map((col) => {
    const firstKey = col.find((k) => k !== null)
    const m = firstKey ? firstKey.slice(0, 7) : null
    if (m && m !== prevMonth) {
      prevMonth = m
      return m
    }
    return ""
  })

  const lastDate = cells[cells.length - 1]?.date ?? ""

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {hover
            ? `${formatBRDate(hover.date)} — ${hover.minutes > 0 ? `${Math.round(hover.minutes)}min de estudo` : "sem sessões"}`
            : `${cells.length} dias de atividade`}
        </span>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          Menos
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className={`w-3 h-3 rounded-sm ${HEAT_LEVELS[l]}`} />
          ))}
          Mais
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="min-w-max">
          <div className="flex gap-[3px]">
            <div className="flex flex-col gap-[3px] pr-0.5">
              {["Dom", "Seg", "", "Qua", "", "Sex", ""].map((label, r) => (
                <span key={r} className="h-[13px] text-[9px] leading-[13px] text-muted-foreground">
                  {label}
                </span>
              ))}
            </div>
            {grid.map((col, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                <span className="h-[13px] text-[9px] leading-[13px] text-muted-foreground whitespace-nowrap">
                  {colLabels[wi] ? (MONTH_NAMES[Number(colLabels[wi].slice(5, 7))] ?? "") : ""}
                </span>
                {[0, 1, 2, 3, 4, 5, 6].map((di) => {
                  const d = col[di]
                  if (!d) return <span key={di} className="h-[13px] w-[13px]" />
                  const cell = byDate.get(d)
                  const minutes = cell?.minutes ?? 0
                  const level = cell?.level ?? 0
                  return (
                    <div
                      key={d}
                      className={`h-[13px] w-[13px] rounded-[3px] ${HEAT_LEVELS[level]} ${minutes > 0 ? "cursor-pointer" : ""}`}
                      onMouseEnter={() => setHover({ date: d, minutes })}
                      onMouseLeave={() => setHover(null)}
                      title={`${formatBRDate(d)} — ${minutes > 0 ? `${minutes}min` : "sem estudo"}`}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground">
        {lastDate && `Período até ${formatSmartDate(lastDate, now, timezone)}`}
      </p>
    </div>
  )
}

// ─── Texto de resumo para tooltips dos buckets ──────────────────────────────

export function bucketTooltipText(b: DailyBucket | undefined): string {
  if (!b) return ""
  const parts: string[] = []
  if (b.minutes > 0) parts.push(`${Math.round(b.minutes)}min`)
  if (b.questions > 0) parts.push(`${b.correct}/${b.questions} questões`)
  if (b.pages > 0) parts.push(`${b.pages} páginas`)
  if (b.sessions > 0) parts.push(`${b.sessions} sessões`)
  return parts.join(" · ")
}

export { MONTH_NAMES }
