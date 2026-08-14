import type { Metadata } from "next"

import { RankingView } from "@/features/ranking/components/estudei-ranking-view"

export const metadata: Metadata = {
  title: "Ranking",
  description: "Compare seu desempenho e evolução com os estudantes no NomeIA.",
}

export default function RankingPage() {
  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
        <RankingView />
      </div>
    </div>
  )
}
