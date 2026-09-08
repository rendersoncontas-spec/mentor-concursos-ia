import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createClient } from "@/infrastructure/supabase/server"
import { logoutAction } from "@/application/auth/logout.action"
import {
  type ActiveSupportSession,
  type UserRole,
  SUPPORT_SESSION_COOKIE_NAME,
  getActiveSupportSession,
  getEffectiveSessionUser,
  getUserRole,
} from "@/application/admin/auth-guard"

import { ProtectedLayoutClient } from "@/components/layout/protected-layout-client"

async function handleLogout() {
  "use server"
  await logoutAction()
}

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  let effectiveUser = null

  try {
    const supabase = await createClient()
    effectiveUser = await getEffectiveSessionUser(supabase)
  } catch {
    console.warn("Conexão Supabase indisponível no ProtectedLayout. Modo de desenvolvimento/contingência ativado.")
  }

  const isDevMode = process.env.NODE_ENV === "development"

  if (!effectiveUser && !isDevMode) {
    redirect("/login")
  }

  const userEmail: string = effectiveUser?.email || ""
  const userName: string = effectiveUser?.name || (userEmail ? userEmail.split("@")[0]! : "Estudante")
  const userId: string = effectiveUser?.id || ""
  const avatarUrl: string | null = effectiveUser?.avatarUrl || null
  const userRole: UserRole = effectiveUser?.role || "user"
  const supportSession: ActiveSupportSession | null = effectiveUser?.supportSession || null

  return (
    <ProtectedLayoutClient
      userEmail={userEmail}
      userName={userName}
      userId={userId}
      avatarUrl={avatarUrl}
      userRole={userRole}
      supportSession={supportSession}
      logoutAction={handleLogout}
    >
      {children}
    </ProtectedLayoutClient>
  )
}

