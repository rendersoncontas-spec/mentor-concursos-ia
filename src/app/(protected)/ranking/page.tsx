import { Trophy } from "lucide-react"
import { EstudeiRankingView } from "@/features/ranking/components/estudei-ranking-view"

export const metadata = {
  title: "Ranking Global - Mentor Concursos IA",
  description: "Compare seu desempenho com todos os estudantes do Mentor IA.",
}

export default function RankingPage() {
  return (
    <div className="flex flex-col min-h-full">
      {/* Page Header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-sm border-b px-6 py-3 flex items-center gap-3">
        <Trophy className="h-5 w-5 text-amber-500" />
        <div>
          <h1 className="text-lg font-bold leading-none">Ranking Global</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Compare seu desempenho com todos os estudantes do Mentor IA</p>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
        <EstudeiRankingView />
      </div>
    </div>
  )
}
