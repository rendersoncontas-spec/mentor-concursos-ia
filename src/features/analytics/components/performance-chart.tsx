"use client"

import { useState } from "react"

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

type Period = "7d" | "30d" | "60d" | "6m" | "12m"

export interface PerformancePoint {
  label: string
  acertos: number
  erros: number
  aproveitamento: number
}

// ─── Period Filter ────────────────────────────────────────────────────────────

const PERIODS: { id: Period; label: string }[] = [
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "60d", label: "60 dias" },
  { id: "6m", label: "6 meses" },
  { id: "12m", label: "12 meses" },
]

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

type TooltipEntry = {
  dataKey: string
  name: string
  color: string
  value: number
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-card p-3 shadow-lg text-xs space-y-1">
      <p className="font-semibold text-foreground mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-semibold">
            {entry.dataKey === "aproveitamento" ? `${entry.value}%` : entry.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Main Chart ───────────────────────────────────────────────────────────────

export function PerformanceChart({ initialData = [] }: { initialData?: PerformancePoint[] }) {
  const [period, setPeriod] = useState<Period>("30d")
  const [minRendimento, setMinRendimento] = useState(0)

  const data = initialData.filter((d) => d.aproveitamento >= minRendimento)

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-semibold text-sm">Evolução de Desempenho</h3>
          <p className="text-xs text-muted-foreground">
            Aproveitamento e volume de questões ao longo do tempo
          </p>
        </div>

        {/* Period filter */}
        <div className="flex gap-1 bg-muted/50 p-1 rounded-lg flex-wrap">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                period === p.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Rendimento filter */}
      <div className="flex items-center gap-3 text-xs flex-wrap">
        <span className="text-muted-foreground font-medium">% Mínimo:</span>
        <div className="flex gap-1">
          {[0, 40, 60, 70, 80].map((v) => (
            <button
              key={v}
              onClick={() => setMinRendimento(v)}
              className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                minRendimento === v
                  ? "bg-primary text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {v === 0 ? "Todos" : `≥ ${v}%`}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="h-64">
        {data.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-xs text-muted-foreground border rounded-lg bg-muted/10">
            Nenhum histórico de performance registrado no período selecionado.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                width={30}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }}
                formatter={(value) => (
                  <span style={{ color: "hsl(var(--muted-foreground))" }}>{value}</span>
                )}
              />
              <Line
                type="monotone"
                dataKey="aproveitamento"
                name="Aproveitamento %"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="acertos"
                name="Acertos"
                stroke="#22c55e"
                strokeWidth={1.5}
                dot={false}
                strokeDasharray="4 2"
              />
              <Line
                type="monotone"
                dataKey="erros"
                name="Erros"
                stroke="#ef4444"
                strokeWidth={1.5}
                dot={false}
                strokeDasharray="4 2"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
