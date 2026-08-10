import { redirect } from "next/navigation"
import { createClient } from "@/infrastructure/supabase/server"
import { logoutAction } from "@/application/auth/logout.action"

import { ProtectedLayoutClient } from "@/components/layout/protected-layout-client"

async function handleLogout() {
  "use server"
  await logoutAction()
}

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  let user = null
  let profileName: string | null = null

  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    user = data?.user || null

    if (user) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("name, full_name")
        .eq("id", user.id)
        .maybeSingle()

      profileName = profileData?.name ?? profileData?.full_name ?? null
    }
  } catch {
    console.warn("Conexão Supabase indisponível no ProtectedLayout. Modo de desenvolvimento/contingência ativado.")
  }

  // @ts-expect-error: TS4111 prevents dot notation, but Next.js requires it for build-time inline replacement
  const isDevMode = process.env.NEXT_PUBLIC_APP_MODE === 'development' || process.env.NODE_ENV === 'development'

  if (!user && !isDevMode) {
    redirect("/login")
  }

  const userEmail = user?.email ?? ""
  const userName = profileName ?? user?.user_metadata?.['full_name'] ?? (userEmail ? userEmail.split("@")[0] : "Estudante")
  const userId = user?.id ?? ""

  return (
    <ProtectedLayoutClient
      userEmail={userEmail}
      userName={userName}
      userId={userId}
      logoutAction={handleLogout}
    >
      {children}
    </ProtectedLayoutClient>
  )
}
