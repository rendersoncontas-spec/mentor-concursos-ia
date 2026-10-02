import type { Metadata } from "next"
import { Suspense } from "react"
import { redirect } from "next/navigation"

import { getDashboardLayoutAction } from "@/application/dashboard/dashboard-layout.action"
import { getDashboardData } from "@/application/dashboard/dashboard.service"
import { getEffectiveSessionUser } from "@/application/admin/auth-guard"
import { DashboardLayout } from "@/features/dashboard/components/dashboard-layout"
import { DashboardWidgetsSection } from "@/features/dashboard/components/dashboard-widgets-section"
import { DashboardWidgetsSkeleton } from "@/features/dashboard/components/dashboard-widgets-skeleton"
import { createClient } from "@/infrastructure/supabase/server"
import { startPagePerf, timed } from "@/lib/perf/server-perf"
import { getDayInSaoPaulo } from "@/lib/sao-paulo"

export const metadata: Metadata = {
  title: {
    absolute: "NomeIA",
  },
  description: "Acompanhe seu progresso e planejamento de estudos no NomeIA.",
}

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  startPagePerf()
  const supabase = await createClient()

  const effectiveUser = await timed("auth.usuario", () => getEffectiveSessionUser(supabase))

  if (!effectiveUser) {
    redirect("/login")
  }

  const todayKey = getDayInSaoPaulo(new Date())
  const calendarYear = Number(todayKey.slice(0, 4))
  const calendarMonth = Number(todayKey.slice(5, 7))

  // Fase F.3 (performance): snapshot e layout decidem a estrutura da página
  // (cabeçalho, quais widgets aparecem e em que ordem) e, na prática, são
  // bem mais rápidos que os outros 4 loaders — mas antes todos os 6 entravam
  // no mesmo Promise.all, então o cabeçalho esperava pelo mais lento deles.
  // Agora só estes dois são aguardados aqui; o cabeçalho (DashboardLayout)
  // aparece em seguida, e a área de widgets vem atrás de um <Suspense>
  // (DashboardWidgetsSection), que faz o Promise.all dos outros 4 e aparece
  // quando eles terminarem — streaming por seção, em vez de tudo esperar
  // junto. Mesmas queries, mesmos dados, nenhum número muda.
  const [snapshot, layoutResult] = await Promise.all([
    timed("dashboard.snapshot", () => getDashboardData(supabase, effectiveUser.id)),
    timed("dashboard.layout", () => getDashboardLayoutAction()),
  ])
  const serverDate = new Date().toISOString()

  return (
    <DashboardLayout snapshot={snapshot} serverDate={serverDate}>
      <Suspense fallback={<DashboardWidgetsSkeleton />}>
        <DashboardWidgetsSection
          snapshot={snapshot}
          initialLayout={layoutResult.data}
          calendarYear={calendarYear}
          calendarMonth={calendarMonth}
        />
      </Suspense>
    </DashboardLayout>
  )
}
