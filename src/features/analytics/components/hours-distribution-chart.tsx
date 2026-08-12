"use client"

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

const CATEGORY_DATA = [
  { name: "Teoria", value: 38, color: "#3b9edd", icon: "📖" },
  { name: "Questões", value: 32, color: "#22c55e", icon: "✏️" },
  { name: "Revisão", value: 20, color: "#a855f7", icon: "🔁" },
  { name: "Videoaula", value: 6, color: "#f59e0b", icon: "🎥" },
  { name: "Simulado", value: 4, color: "#ec4899", icon: "🏆" },
]

type TooltipData = { name: string; value: number; color: string; icon: string }

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: TooltipData }[]
}) {
  if (!active || !payload?.length) return null
  const raw = payload[0]
  if (!raw) return null
  const d = raw.payload
  return (
    <div className="rounded-lg border bg-card p-3 shadow-lg text-xs">
      <p className="font-semibold">
        {d.icon} {d.name}
      </p>
      <p className="text-muted-foreground mt-1">{d.value}% do tempo total</p>
    </div>
  )
}

function CustomLegend() {
  return (
    <div className="flex flex-col gap-2">
      {CATEGORY_DATA.map((d) => (
        <div key={d.name} className="flex items-center gap-2 text-xs">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
          <span className="text-muted-foreground">{d.icon} {d.name}</span>
          <span className="ml-auto font-bold">{d.value}%</span>
        </div>
      ))}
    </div>
  )
}

export function HoursDistributionChart() {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="font-semibold text-sm">Distribuição de Horas por Categoria</h3>
        <p className="text-xs text-muted-foreground">Como você divide seu tempo de estudo</p>
      </div>

      <div className="flex gap-6 items-center flex-wrap">
        {/* Pie */}
        <div className="h-52 flex-1 min-w-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={CATEGORY_DATA}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={3}
                dataKey="value"
              >
                {CATEGORY_DATA.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="min-w-[150px]">
          <CustomLegend />
        </div>
      </div>
    </div>
  )
}
