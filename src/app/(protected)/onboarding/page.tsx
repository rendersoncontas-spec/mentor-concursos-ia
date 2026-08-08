import { createClient } from "@/infrastructure/supabase/server"
import { getGlobalExams } from "@/application/disciplines/disciplines.service"
import { OnboardingWizard } from "@/features/onboarding/components/onboarding-wizard"
import { Logo } from "@/components/ui/logo"

export const metadata = {
  title: "Onboarding - Mentor Concursos IA",
}

export default async function OnboardingPage() {
  const supabase = await createClient()
  const exams = await getGlobalExams(supabase)

  return (
    <div className="flex min-h-screen flex-col items-center bg-muted/40 p-4 md:p-8">
      <header className="mb-8 flex w-full max-w-3xl items-center justify-between">
        <Logo href="/dashboard" />
      </header>
      
      <main className="w-full max-w-3xl flex-1">
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="p-6 md:p-10">
            <h1 className="text-2xl font-bold tracking-tight mb-2">Configure seu Plano de Estudos</h1>
            <p className="text-muted-foreground mb-8">
              Precisamos de algumas informações para personalizar a Inteligência Artificial exclusivamente para o seu objetivo.
            </p>
            <OnboardingWizard exams={exams} />
          </div>
        </div>
      </main>
    </div>
  )
}

