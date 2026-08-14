import Link from "next/link"
import { redirect } from "next/navigation"

import { getAccuracyByDiscipline } from "@/application/question-analytics/accuracy"
import { getPerformanceRadar } from "@/application/question-analytics/radar"
import { Logo } from "@/components/ui/logo"
import { createClient } from "@/infrastructure/supabase/server"

export const metadata = {
  title: "Performance",
  description: "Análise de performance e radar de competências no NomeIA.",
}

export default async function PerformancePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const radarData = await getPerformanceRadar(supabase, user.id, 30)
  const accuracyData = await getAccuracyByDiscipline(supabase, user.id, 30)

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
        <Logo href="/dashboard" />
      </header>

      <main className="flex-1 space-y-6 p-4 md:p-8 pt-6">
        <div className="flex flex-col space-y-4">
          <h2 className="text-3xl font-bold tracking-tight">Performance e Questões</h2>

          <nav className="flex space-x-4 border-b pb-2 text-sm overflow-x-auto">
            <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
              Visão Geral
            </Link>
            <Link
              href="/dashboard/performance"
              className="font-semibold text-primary border-b-2 border-primary pb-2"
            >
              Performance
            </Link>
            <Link
              href="/dashboard/questions"
              className="text-muted-foreground hover:text-foreground"
            >
              Questões
            </Link>
            <Link href="/dashboard/reviews" className="text-muted-foreground hover:text-foreground">
              Revisões
            </Link>
            <Link
              href="/dashboard/adaptive"
              className="text-muted-foreground hover:text-foreground"
            >
              Adaptativo (ALE)
            </Link>
            <Link href="/dashboard/history" className="text-muted-foreground hover:text-foreground">
              Histórico
            </Link>
            <Link
              href="/dashboard/analytics"
              className="text-muted-foreground hover:text-foreground"
            >
              Analytics
            </Link>
          </nav>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Radar Real */}
          <div className="border rounded-lg p-4 bg-card col-span-full md:col-span-1">
            <h3 className="font-semibold text-sm text-muted-foreground mb-4">
              Radar de Desempenho
            </h3>
            {radarData.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Nenhuma questão respondida nos últimos 30 dias.
              </div>
            ) : (
              <div className="space-y-4">
                {radarData.map((item) => (
                  <div key={item.subject}>
                    <div className="flex justify-between text-xs mb-1">
                      <span>{item.subject}</span>
                      <span className="font-bold">{item.score}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${item.score}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-4 italic">
              Baseado nas tentativas de questões dos últimos 30 dias.
            </p>
          </div>

          {/* Acertos Reais */}
          <div className="border rounded-lg p-4 bg-card col-span-full md:col-span-2">
            <h3 className="font-semibold text-sm text-muted-foreground mb-4">Métricas de Acerto</h3>
            {accuracyData.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Responda questões para visualizar métricas por disciplina.
              </div>
            ) : (
              <div className="space-y-4">
                {accuracyData.map((acc) => (
                  <div
                    key={acc.id}
                    className="flex items-center justify-between p-3 border rounded-md"
                  >
                    <div>
                      <p className="font-medium">{acc.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {acc.correctAttempts} acertos de {acc.totalAttempts} tentativas
                      </p>
                    </div>
                    <div className="text-2xl font-bold text-green-600">{acc.accuracyPercent}%</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Alerta Mock */}
          <div className="border rounded-lg p-4 bg-amber-500/10 border-amber-500/20 col-span-full">
            <h3 className="font-semibold text-amber-700 flex items-center gap-2">
              ⚠️ Assunto Crítico Detectado
            </h3>
            <p className="text-sm mt-2 text-amber-800/80">
              Você errou as últimas 5 questões de &quot;Remédios Constitucionais&quot; mesmo
              marcando Nível de Confiança Alto. Sugerimos revisar este tópico imediatamente, pois o
              Performance Score dele caiu para 25/100.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
