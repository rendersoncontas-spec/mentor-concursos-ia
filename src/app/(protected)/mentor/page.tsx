import type { Metadata } from "next"

import { Compass } from "lucide-react"

import { getStudentMentorContextAction } from "@/application/mentor/student-context.action"
import { isMentorAIAvailableForSessionUser } from "@/application/mentor-llm/mentor-ai-availability"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { MentorAnalysisPanel } from "@/features/mentor/components/mentor-analysis-panel"
import { MentorOverview } from "@/features/mentor/components/mentor-overview"

export const metadata: Metadata = {
  title: "Mentor de estudos",
  description: "Visão determinística do seu momento de estudo no NomeIA.",
}

export const dynamic = "force-dynamic"

export default async function MentorPage() {
  // G2.15: aluno resolvido no servidor; nenhum parâmetro do cliente.
  // G2.17: piloto — o bloco de IA só aparece para alunos da allowlist (sessão
  // resolvida no servidor). Os demais veem o Mentor determinístico normal.
  // A tela só recebe um booleano: nenhum segredo, modelo ou endpoint chega ao
  // navegador. Nenhuma chamada ao LLM no render.
  const [result, aiAvailable] = await Promise.all([getStudentMentorContextAction(), isMentorAIAvailableForSessionUser()])

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        icon={Compass}
        title="Mentor de estudos"
        description="Seu momento atual, a partir dos dados que você registrou"
      />
      <div className="flex-1 page-container py-5 max-w-4xl">
        {result.data ? (
          <MentorOverview
            context={result.data}
            analysisSlot={aiAvailable ? <MentorAnalysisPanel quality={result.data.contextQuality.level} /> : undefined}
          />
        ) : (
          <section className="rounded-lg border bg-card">
            <EmptyState
              icon={Compass}
              title="Não foi possível montar sua visão agora."
              description={result.error ?? "Tente novamente em instantes."}
            />
          </section>
        )}
      </div>
    </div>
  )
}
