import { redirect } from "next/navigation"
import { createClient } from "@/infrastructure/supabase/server"
import { getDashboardData } from "@/application/dashboard/dashboard.service"
import { DashboardLayout } from "@/features/dashboard/components/dashboard-layout"
import { getDashboardLayoutAction } from "@/application/dashboard/dashboard-layout.action"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Home - Mentor Concursos IA",
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
