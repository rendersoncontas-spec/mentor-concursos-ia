"use client"

import * as React from "react"
import { type DashboardSnapshot } from "@/domain/dashboard/dashboard.types"
import { EstudeiHomeView } from "./estudei-home-view"

export interface DashboardGridProps {
  snapshot: DashboardSnapshot
}

export function DashboardGrid({ snapshot }: DashboardGridProps) {
  return <EstudeiHomeView snapshot={snapshot} />
}
