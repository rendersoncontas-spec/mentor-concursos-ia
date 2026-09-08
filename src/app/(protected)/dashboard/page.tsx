import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getDashboardLayoutAction } from "@/application/dashboard/dashboard-layout.action"
import { getDashboardData } from "@/application/dashboard/dashboard.service"
import { getEffectiveSessionUser } from "@/application/admin/auth-guard"
import { DashboardLayout } from "@/features/dashboard/components/dashboard-layout"
import { createClient } from "@/infrastructure/supabase/server"

export const metadata: Metadata = {
  title: {
    absolute: "NomeIA",
  },
  description: "Acompanhe seu progresso e planejamento de estudos no NomeIA.",
}

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const supabase = await createClient()

  const effectiveUser = await getEffectiveSessionUser(supabase)

  if (!effectiveUser) {
    redirect("/login")
  }

  const snapshot = await getDashboardData(supabase, effectiveUser.id)
  const layoutResult = await getDashboardLayoutAction()

  return <DashboardLayout snapshot={snapshot} initialLayout={layoutResult.data} />
}
