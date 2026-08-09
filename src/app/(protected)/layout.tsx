import { redirect } from "next/navigation"
import { createClient } from "@/infrastructure/supabase/server"
import { logoutAction } from "@/application/auth/logout.action"
import { AppSidebar } from "@/components/layout/sidebar"
import { AppHeader } from "@/components/layout/header"
import { FloatingActionButton } from "@/components/layout/floating-action-button"

import { ProtectedLayoutClient } from "@/components/layout/protected-layout-client"

async function handleLogout() {
  "use server"
  await logoutAction()
}

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  let user = null

  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    user = data?.user || null
  } catch (error) {
    console.warn("Conexão Supabase indisponível no ProtectedLayout. Modo de desenvolvimento/contingência ativado.")
  }

  // @ts-expect-error: TS4111 prevents dot notation, but Next.js requires it for build-time inline replacement
  const isDevMode = process.env.NEXT_PUBLIC_APP_MODE === 'development' || process.env.NODE_ENV === 'development'

  if (!user && !isDevMode) {
    redirect("/login")
  }

  const userEmail = user?.email || "usuario@mentorconcursos.ia"
  const userName = user?.user_metadata?.['full_name'] || userEmail.split("@")[0] || "Renders"

  return (
    <ProtectedLayoutClient
      userEmail={userEmail}
      userName={userName}
      logoutAction={handleLogout}
    >
      {children}
    </ProtectedLayoutClient>
  )
}
