import { redirect } from "next/navigation"
import { createClient } from "@/infrastructure/supabase/server"
import { logoutAction } from "@/application/auth/logout.action"
import { AppSidebar } from "@/components/layout/sidebar"
import { AppHeader } from "@/components/layout/header"
import { FloatingActionButton } from "@/components/layout/floating-action-button"

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

  const isDevMode = process.env['NEXT_PUBLIC_APP_MODE'] === 'development' || process.env.NODE_ENV === 'development'

  if (!user && !isDevMode) {
    redirect("/login")
  }

  const userEmail = user?.email || "usuario@mentorconcursos.ia"
  const userName = user?.user_metadata?.['full_name'] || userEmail.split("@")[0] || "Renders"

  return (
    <div className="flex h-screen overflow-hidden bg-muted/30">
      {/* Sidebar fixa */}
      <AppSidebar logoutAction={handleLogout} className="hidden md:flex shrink-0" />

      {/* Área de conteúdo */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* App Header Superior com Avatar do Usuário e Dropdown Menu (100% Estudei) */}
        <AppHeader
          userEmail={userEmail}
          userName={userName}
          logoutAction={handleLogout}
        />

        {/* Conteúdo scrollável */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>

      {/* FAB global (Botão de Notas + Registrar Estudo Circulares Empilhados) */}
      <FloatingActionButton />
    </div>
  )
}
