import * as React from "react"
import { cn } from "@/lib/utils"

export interface DashboardSectionProps {
  title?: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function DashboardSection({
  title,
  description,
  action,
  children,
  className,
}: DashboardSectionProps) {
  return (
    <section className={cn("space-y-3", className)}>
      {(title || description || action) && (
        <div className="flex items-center justify-between px-1">
          <div>
            {title && (
              <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
            )}
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </section>
  )
}
