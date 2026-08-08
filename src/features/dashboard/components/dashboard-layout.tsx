import * as React from "react"
import { type DashboardSnapshot } from "@/domain/dashboard/dashboard.types"
import { DashboardContent } from "./dashboard-content"

export interface DashboardLayoutProps {
  snapshot: DashboardSnapshot
}

export function DashboardLayout({ snapshot }: DashboardLayoutProps) {
  return (
    <div className="flex flex-col min-h-full bg-background/50">
      <DashboardContent snapshot={snapshot} />
    </div>
  )
}
