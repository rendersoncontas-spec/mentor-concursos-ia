import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getDashboardLayoutAction } from "@/application/dashboard/dashboard-layout.action"
import { getDashboardData } from "@/application/dashboard/dashboard.service"
import { DashboardLayout } from "@/features/dashboard/components/dashboard-layout"
import { createClient } from "@/infrastructure/supabase/server"

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Acompanhe seu progresso e planejamento de estudos no NomeIA.",
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const snapshot = await getDashboardData(supabase, user.id)
  const layoutResult = await getDashboardLayoutAction()

  return <DashboardLayout snapshot={snapshot} initialLayout={layoutResult.data} />
}
