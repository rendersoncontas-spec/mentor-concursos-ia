import type { Metadata } from "next"
import { Suspense } from "react"

import { DashboardLayout } from "@/features/dashboard/components/dashboard-layout"
import { DashboardWidgetsGrid } from "@/features/dashboard/components/dashboard-widgets-grid"
import { DashboardWidgetsSkeleton } from "@/features/dashboard/components/dashboard-widgets-skeleton"
import { InitialServerDataProvider } from "@/hooks/use-cached-server-action"
import { getDayInSaoPaulo } from "@/lib/sao-paulo"
import { buildDashboardFixture, replanInfoCacheFixture, type DashboardFixture } from "@/lib/testing/dashboard-fixtures"

import { ReplanCacheSeed } from "./replan-cache-seed"
import { DASHBOARD_HARNESS_STATES, type DashboardHarnessState } from "./states"

// G2.21 — harness E2E do /dashboard: a MESMA composição de page.tsx
// (DashboardLayout + Suspense + grade de widgets semeada por
// InitialServerDataProvider) com snapshot/layout SINTÉTICOS no lugar de
// getDashboardData/getDashboardLayoutAction. Só existe com NOMEIA_E2E_HARNESS=1.
// Nenhuma sessão, banco real ou dado pessoal.
export const metadata: Metadata = { title: "E2E · dashboard", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

/** Seção de widgets como DashboardWidgetsSection, com atraso opcional (estado "carregando"). */
async function HarnessWidgetsSection({ fixture, delayMs }: { fixture: DashboardFixture; delayMs: number }) {
  if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
  return (
    <InitialServerDataProvider data={fixture.initialWidgetData}>
      <DashboardWidgetsGrid snapshot={fixture.snapshot} initialLayout={fixture.layout} />
    </InitialServerDataProvider>
  )
}

export default async function DashboardHarnessPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams
  const s: DashboardHarnessState = (DASHBOARD_HARNESS_STATES as readonly string[]).includes(state ?? "")
    ? (state as DashboardHarnessState)
    : "data"
  const todayKey = getDayInSaoPaulo(new Date())
  const fixture = buildDashboardFixture(s === "loading" ? "data" : s, todayKey)
  // "Últimos dados salvos" do cronograma do dia, gravados antes de o widget
  // hidratar (ele lê esse cache no primeiro render). Só no navegador do teste.
  const replanCache = s === "data" || s === "loading" ? JSON.stringify(replanInfoCacheFixture(todayKey)) : null
  return (
    <DashboardLayout snapshot={fixture.snapshot} serverDate={new Date().toISOString()}>
      <ReplanCacheSeed value={replanCache} />
      <Suspense fallback={<DashboardWidgetsSkeleton />}>
        <HarnessWidgetsSection fixture={fixture} delayMs={s === "loading" ? 2500 : 0} />
      </Suspense>
    </DashboardLayout>
  )
}
