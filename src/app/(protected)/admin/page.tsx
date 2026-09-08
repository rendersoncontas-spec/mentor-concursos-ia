import { redirect } from "next/navigation"
import { createClient } from "@/infrastructure/supabase/server"
import { getUserRole } from "@/application/admin/auth-guard"
import { AdminDashboardView } from "@/features/admin/components/admin-dashboard-view"

export const metadata = {
  title: "Administração e Suporte | Mentor Concursos IA",
  description: "Painel administrativo e suporte ao estudante.",
}

export default async function AdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || user.email?.toLowerCase() !== "rendersonluan@gmail.com") {
    redirect("/dashboard")
  }

  const role = await getUserRole(supabase, user.id)

  if (role !== "admin" && role !== "moderator") {
    redirect("/dashboard")
  }

  return (
    <AdminDashboardView
      currentOperatorRole={role}
      currentOperatorId={user.id}
    />
  )
}
