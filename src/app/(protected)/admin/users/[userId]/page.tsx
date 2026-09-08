import { redirect } from "next/navigation"
import { createClient } from "@/infrastructure/supabase/server"
import { getUserRole } from "@/application/admin/auth-guard"
import { AdminUserDetailsView } from "@/features/admin/components/admin-user-details-view"

export const metadata = {
  title: "Diagnóstico do Estudante | Mentor Concursos IA",
}

interface UserDetailPageProps {
  params: Promise<{
    userId: string
  }>
}

export default async function UserDetailPage({ params }: UserDetailPageProps) {
  const { userId } = await params
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
    <AdminUserDetailsView
      userId={userId}
      currentOperatorRole={role}
      currentOperatorId={user.id}
    />
  )
}
