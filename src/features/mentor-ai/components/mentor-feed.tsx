import { MentorResponse } from "@/domain/mentor-ai/mentor-ai.types"
import { Brain, Flame, Target, TrendingUp, AlertCircle, Clock } from "lucide-react"

interface MentorFeedProps {
  response: MentorResponse
}

export function MentorFeed({ response }: MentorFeedProps) {
  const { globalScore, feed } = response

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6">
      
      {/* Header Estilo Documento */}
      <div className="flex items-center gap-4 mb-10">
        <div className="bg-primary/10 text-primary p-4 rounded-2xl">
          <Brain className="h-10 w-10" />
        </div>
        <div>
          <h1 className="text-4xl font-black tracking-tight text-foreground">Mentor IA</h1>
          <p className="text-muted-foreground text-lg mt-1 flex items-center gap-2">
            Índice Geral de Aprendizado: <strong className="text-foreground">{globalScore.score}</strong>
            <span className="text-sm font-medium bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">
              {globalScore.trend === "UP" ? "↑ Melhorando" : globalScore.trend === "DOWN" ? "↓ Caindo" : "➖ Estável"}
            </span>
          </p>
        </div>
      </div>

      <div className="space-y-12">
        {/* AGORA */}
        {feed.now.length > 0 && (
          <section>
            <h2 className="text-xl font-bold flex items-center gap-2 mb-4 text-red-600 dark:text-red-400">
              <AlertCircle className="h-5 w-5" /> Agora
            </h2>
            <div className="space-y-4">
              {feed.now.map((item, i) => (
                <div key={i} className="text-lg font-medium text-foreground leading-relaxed pl-7 border-l-2 border-red-500/30">
                  {item.message}
                </div>
              ))}
            </div>
            <hr className="mt-8 border-muted" />
          </section>
        )}

        {/* HOJE */}
        {feed.today.length > 0 && (
          <section>
            <h2 className="text-xl font-bold flex items-center gap-2 mb-4 text-orange-600 dark:text-orange-400">
              <Target className="h-5 w-5" /> Hoje
            </h2>
            <div className="space-y-4">
              {feed.today.map((item, i) => (
                <div key={i} className="text-lg text-foreground leading-relaxed pl-7 border-l-2 border-orange-500/30">
                  {item.message}
                </div>
              ))}
            </div>
            <hr className="mt-8 border-muted" />
          </section>
        )}

        {/* ESTA SEMANA */}
        {feed.week.length > 0 && (
          <section>
            <h2 className="text-xl font-bold flex items-center gap-2 mb-4 text-blue-600 dark:text-blue-400">
              <Clock className="h-5 w-5" /> Estratégia da Semana
            </h2>
            <ul className="space-y-3 pl-7 list-disc marker:text-blue-500/50">
              {feed.week.map((item, i) => (
                <li key={i} className="text-base text-foreground/90 leading-relaxed">
                  {item.message}
                </li>
              ))}
            </ul>
            <hr className="mt-8 border-muted" />
          </section>
        )}

        {/* LONGO PRAZO */}
        {feed.longTerm.length > 0 && (
          <section>
            <h2 className="text-xl font-bold flex items-center gap-2 mb-4 text-green-600 dark:text-green-400">
              <TrendingUp className="h-5 w-5" /> Visão de Longo Prazo
            </h2>
            <ul className="space-y-3 pl-7 list-disc marker:text-green-500/50">
              {feed.longTerm.map((item, i) => (
                <li key={i} className="text-base text-foreground/90 leading-relaxed">
                  {item.message}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
