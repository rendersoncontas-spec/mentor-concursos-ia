import { redirect } from "next/navigation"

import { RefreshCcw } from "lucide-react"

import { getEffectiveSessionUser } from "@/application/admin/auth-guard"
import { getReviewsOverview } from "@/application/review-engine/review.service"
import { PageHeader } from "@/components/ui/page-header"
import { ReviewsView } from "@/features/reviews/components/reviews-view"
import { createClient } from "@/infrastructure/supabase/server"

export const metadata = {
  title: "Revisões",
  description: "Revisões espaçadas dos tópicos do seu edital no NomeIA.",
}

export default async function ReviewsPage() {
  const supabase = await createClient()

  const effectiveUser = await getEffectiveSessionUser(supabase)
  if (!effectiveUser) redirect("/login")

  // Leituras com limite explícito e contagens sem carregar linhas (ver
  // review.repository.ts) — nada aqui pode trazer milhares de itens.
  const overview = await getReviewsOverview(supabase, effectiveUser.id, new Date().toISOString())

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        icon={RefreshCcw}
        title="Revisões"
        description="Repetição espaçada: o intervalo de cada tópico é calculado pelas suas respostas"
      />

      <div className="flex-1 page-container py-5">
        <ReviewsView initialOverview={overview} />
      </div>
    </div>
  )
}
