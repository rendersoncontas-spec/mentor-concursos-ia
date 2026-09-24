import * as React from "react"

import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Redesign 2.0 — estado vazio sóbrio: ícone pequeno opcional, uma frase
 * de título, uma frase de orientação e no máximo uma ação. Sem ilustração,
 * sem gradiente, sem emoji.
 */
export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: LucideIcon
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  compact?: boolean
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-1.5 px-4 py-6" : "gap-2 px-6 py-12",
        className,
      )}
      {...props}
    >
      {Icon && <Icon aria-hidden className="mb-1 h-5 w-5 text-muted-foreground/70" />}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm text-[13px] leading-5 text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
