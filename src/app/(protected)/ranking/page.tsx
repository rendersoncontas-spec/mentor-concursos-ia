import type { Metadata } from "next"

import { Trophy } from "lucide-react"

import { PageHeader } from "@/components/ui/page-header"
import { RankingView } from "@/features/ranking/components/ranking-view"

export const metadata: Metadata = {
  title: "Ranking",
  description: "Compare seu desempenho e evolução com os estudantes no NomeIA.",
}

export default function RankingPage() {
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        icon={Trophy}
        title="Ranking"
        description="Compare sua evolução com a de outros estudantes no mesmo período"
      />
      <div className="flex-1 page-container py-5">
        <RankingView />
      </div>
    </div>
  )
}
