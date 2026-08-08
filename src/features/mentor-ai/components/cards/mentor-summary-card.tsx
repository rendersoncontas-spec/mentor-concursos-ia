import Link from "next/link"
import { ArrowRight, Brain, Play } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { MentorResponse } from "@/domain/mentor-ai/mentor-ai.types"

interface MentorSummaryCardProps {
  response: MentorResponse
}

export function MentorSummaryCard({ response }: MentorSummaryCardProps) {
  const { globalScore, feed } = response
  
  // A ação mais crítica
  const topAction = feed.now.length > 0 ? feed.now[0] : (feed.today.length > 0 ? feed.today[0] : null)

  return (
    <Card className="bg-gradient-to-r from-blue-600/10 to-indigo-700/10 border-blue-200 shadow-sm overflow-hidden relative">
      <div className="absolute top-0 left-0 w-1 h-full bg-blue-600" />
      <CardContent className="p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        
        {/* Lado Esquerdo: IGA e Info Básica */}
        <div className="flex items-start gap-4">
          <div className="bg-blue-100 text-blue-700 p-3 rounded-xl">
            <Brain className="h-8 w-8" />
          </div>
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              Mentor IA
            </h2>
            <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
              <span>Índice de Aprendizado: <strong className="text-foreground text-lg">{globalScore.score}</strong></span>
              {globalScore.trend === "UP" && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold flex items-center">
                  ↑ +3 pts (Subindo)
                </span>
              )}
              {globalScore.trend === "DOWN" && (
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold flex items-center">
                  ↓ -2 pts (Atenção)
                </span>
              )}
            </div>
            
            {topAction && (
              <div className="mt-4">
                <div className="text-sm font-semibold uppercase text-blue-700 tracking-wider mb-1">
                  🎯 Principal Prioridade Hoje
                </div>
                <div className="text-lg font-medium text-foreground">
                  {topAction.message}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Lado Direito: Actions */}
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto mt-4 md:mt-0">
          <Button size="lg" className="gap-2" asChild>
            <Link href="/study-plan">
              <Play className="w-4 h-4" /> Iniciar Sessão
            </Link>
          </Button>
          <Button size="lg" variant="outline" className="gap-2 border-blue-200 hover:bg-blue-50" asChild>
            <Link href="/dashboard/mentor">
              Abrir Análise Detalhada <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>

      </CardContent>
    </Card>
  )
}
