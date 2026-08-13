import { EstudeiRankingView } from "@/features/ranking/components/estudei-ranking-view"

export const metadata = {
  title: "Ranking - Mentor Concursos IA",
  description: "Compare seu desempenho com todos os alunos do Mentor IA.",
}

export default function RankingPage() {
  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 p-4 md:p-6 lg:px-8 max-w-[1600px] mx-auto w-full">
        <EstudeiRankingView />
      </div>
    </div>
  )
}