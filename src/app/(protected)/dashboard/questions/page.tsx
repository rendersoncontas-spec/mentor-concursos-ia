import Link from "next/link"
import { redirect } from "next/navigation"

import { Logo } from "@/components/ui/logo"
import { createClient } from "@/infrastructure/supabase/server"

export const metadata = {
  title: "Questões",
  description: "Acompanhe seu rendimento em questões no NomeIA.",
}

export default async function QuestionsDashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
        <Logo href="/dashboard" />
      </header>

      <main className="flex-1 space-y-6 p-4 md:p-8 pt-6">
        <div className="flex flex-col space-y-4">
          <h2 className="text-3xl font-bold tracking-tight">Painel de Estudos</h2>

          <nav className="flex space-x-4 border-b pb-2 text-sm overflow-x-auto">
            <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
              Visão Geral
            </Link>
            <Link
              href="/dashboard/performance"
              className="text-muted-foreground hover:text-foreground"
            >
              Performance
            </Link>
            <Link
              href="/dashboard/questions"
              className="font-semibold text-primary border-b-2 border-primary pb-2"
            >
              Questões
            </Link>
            <Link href="/dashboard/reviews" className="text-muted-foreground hover:text-foreground">
              Revisões
            </Link>
            <Link
              href="/dashboard/adaptive"
              className="text-muted-foreground hover:text-foreground"
            >
              Adaptativo (ALE)
            </Link>
            <Link href="/dashboard/history" className="text-muted-foreground hover:text-foreground">
              Histórico
            </Link>
            <Link
              href="/dashboard/analytics"
              className="text-muted-foreground hover:text-foreground"
            >
              Analytics
            </Link>
          </nav>
        </div>

        <div className="flex flex-col items-center justify-center py-24 text-center border rounded-lg bg-card">
          <h3 className="text-xl font-semibold mb-2">Módulo de Questões</h3>
          <p className="text-muted-foreground max-w-md">
            Esta funcionalidade está em construção. Em breve você poderá resolver e revisar suas
            questões diretamente por aqui.
          </p>
        </div>
      </main>
    </div>
  )
}
