import { Settings2 } from "lucide-react"

import { PageHeader } from "@/components/ui/page-header"
import { OnboardingWizard } from "@/features/onboarding/components/onboarding-wizard"

export const metadata = {
  title: "Onboarding",
  description: "Configure seu plano de estudos no NomeIA.",
}

// Fase E — a página roda dentro do layout protegido (sidebar + header), então
// não repete o logotipo nem abre um segundo <main>. O formulário ocupa a
// coluna principal; a lateral explica o que está sendo configurado.
export default async function OnboardingPage() {
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        icon={Settings2}
        title="Configurar plano de estudos"
        description="Algumas informações para adaptar o planejamento ao seu objetivo"
      />

      <div className="flex-1 page-container py-5">
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section aria-label="Configuração" className="rounded-lg border border-border bg-card p-5 md:p-8">
            <OnboardingWizard />
          </section>

          <aside className="space-y-4 rounded-lg border border-border p-5 text-[13px] text-muted-foreground">
            <h2 className="text-[13px] font-semibold text-foreground">O que é configurado aqui</h2>
            <ol className="space-y-3">
              <li>
                <span className="block font-medium text-foreground">1. Objetivo</span>
                Concurso, cargo desejado e principal material de estudo.
              </li>
              <li>
                <span className="block font-medium text-foreground">2. Ritmo</span>
                Horas semanais disponíveis e seu regime de trabalho.
              </li>
              <li>
                <span className="block font-medium text-foreground">3. Bagagem</span>
                Sua experiência anterior com concursos.
              </li>
            </ol>
            <p className="border-t border-border pt-3">
              Tudo pode ser ajustado depois em Planejamento e em Minha conta.
            </p>
          </aside>
        </div>
      </div>
    </div>
  )
}
