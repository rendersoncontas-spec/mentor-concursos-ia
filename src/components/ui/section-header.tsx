import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Redesign 2.0 — título de seção dentro de uma página: H3 da escala, com
 * ação opcional (link/ghost button) alinhada à direita. Substitui cards
 * quando o que se precisa é só agrupar conteúdo.
 */
export interface SectionHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  as?: "h2" | "h3"
}

export function SectionHeader({
  title,
  description,
  action,
  as: Heading = "h2",
  className,
  ...props
}: SectionHeaderProps) {
  return (
    <div className={cn("flex items-end justify-between gap-3", className)} {...props}>
      <div className="min-w-0">
        <Heading className="type-h3 text-foreground">{title}</Heading>
        {description && <p className="type-secondary mt-0.5">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
