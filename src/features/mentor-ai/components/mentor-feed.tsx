import { AlertCircle, Clock, Target, TrendingUp } from "lucide-react"

import type { MentorResponse } from "@/domain/mentor-ai/mentor-ai.types"

interface MentorFeedProps {
  response: MentorResponse
}

export function MentorFeed({ response }: MentorFeedProps) {
  // Fase H: o "Índice Geral de Aprendizado" e a tendência deixaram de ser
  // exibidos — o índice era a média de 5 componentes em que 3 (desempenho,
  // retenção e questões) vinham de `overallAccuracy`, fixo em 0, e a tendência
  // era sempre "STABLE".
  //
  // Fase I.6 (M1): eles também deixaram de EXISTIR. O Global Score saiu do
  // contrato do Mentor e não é mais gravado em `mentor_history`. Só as
  // observações abaixo, vindas de dado real, chegam aqui.
  const { feed } = response
  const isEmpty =
    feed.now.length === 0 &&
    feed.today.length === 0 &&
    feed.week.length === 0 &&
    feed.longTerm.length === 0

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6">
      {/* Header Estilo Documento */}
      <div className="flex items-center gap-4 mb-10">
        <div>
          <h1 className="type-h1 text-foreground">
            Análise de desempenho
          </h1>
          <p className="text-muted-foreground mt-1">
            Observações calculadas a partir das suas sessões dos últimos 30 dias.
          </p>
        </div>
      </div>

      <div className="space-y-12">
        {isEmpty && (
          <p className="text-muted-foreground">
            Nenhuma observação no momento. Elas aparecem quando os seus registros indicam algo
            relevante (por exemplo, a energia média informada nas sessões).
          </p>
        )}

        {/* AGORA */}
        {feed.now.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold flex items-center gap-2 mb-4 text-red-600 dark:text-red-400">
              <AlertCircle className="h-5 w-5" /> Agora
            </h2>
            <div className="space-y-4">
              {feed.now.map((item, i) => (
                <div
                  key={i}
                  className="text-lg font-medium text-foreground leading-relaxed pl-7 border-l-2 border-red-500/30"
                >
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
            <h2 className="text-xl font-semibold flex items-center gap-2 mb-4 text-orange-600 dark:text-orange-400">
              <Target className="h-5 w-5" /> Hoje
            </h2>
            <div className="space-y-4">
              {feed.today.map((item, i) => (
                <div
                  key={i}
                  className="text-lg text-foreground leading-relaxed pl-7 border-l-2 border-orange-500/30"
                >
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
            <h2 className="text-xl font-semibold flex items-center gap-2 mb-4 text-info">
              <Clock className="h-5 w-5" /> Estratégia da Semana
            </h2>
            <ul className="space-y-3 pl-7 list-disc marker:text-info/60">
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
            <h2 className="text-xl font-semibold flex items-center gap-2 mb-4 text-green-600 dark:text-green-400">
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
