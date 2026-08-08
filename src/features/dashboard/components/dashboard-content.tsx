import * as React from "react"
import { type DashboardSnapshot } from "@/domain/dashboard/dashboard.types"
import { DashboardGrid } from "./dashboard-grid"

export interface DashboardContentProps {
  snapshot: DashboardSnapshot
}

export function DashboardContent({ snapshot }: DashboardContentProps) {
  return (
    <div className="flex-1 p-4 md:p-6 space-y-6 max-w-7xl mx-auto w-full">
      <DashboardGrid snapshot={snapshot} />
    </div>
  )
}
