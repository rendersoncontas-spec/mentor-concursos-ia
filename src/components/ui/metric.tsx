import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Faixa de métricas: uma única superfície dividida por linhas finas, em vez
 * de N cards de KPI iguais. 2 colunas no mobile; no desktop (lg) todas as
 * métricas ficam lado a lado, dividindo a largura disponível por igual.
 */
export function MetricStrip({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 border-y border-border [&>*]:border-border [&>*]:px-4 [&>*]:py-3",
        "max-lg:[&>*:nth-child(even)]:border-l max-lg:[&>*:nth-child(n+3)]:border-t",
        "lg:grid-flow-col lg:grid-cols-none lg:auto-cols-fr lg:divide-x lg:divide-border",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/**
 * Redesign 2.0 — métrica compacta (rótulo + valor + contexto). Números
 * tabulares, peso semibold, sem "número gigante". Pensada para ser usada
 * em linha, separada por divisórias, e não cada uma dentro de um card.
 */
export interface MetricProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode
  value: React.ReactNode
  hint?: React.ReactNode
  size?: "sm" | "md" | "lg"
  tone?: "default" | "primary" | "muted"
}

export function Metric({ label, value, hint, size = "md", tone = "default", className, ...props }: MetricProps) {
  return (
    <div className={cn("min-w-0", className)} {...props}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "num font-semibold leading-tight",
          size === "sm" && "text-base",
          size === "md" && "text-lg",
          size === "lg" && "text-2xl",
          tone === "default" && "text-foreground",
          tone === "primary" && "text-primary",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
