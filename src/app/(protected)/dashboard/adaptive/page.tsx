import Link from "next/link"
import { redirect } from "next/navigation"

import { Activity, History } from "lucide-react"

import { getEffectiveSessionUser } from "@/application/admin/auth-guard"
import { Logo } from "@/components/ui/logo"
import { createClient } from "@/infrastructure/supabase/server"

export const metadata = {
  title: "Aprendizado Adaptativo",
  description: "Sistema de aprendizado adaptativo no NomeIA.",
}

export default async function AdaptiveDashboardPage() {
  const supabase = await createClient()

  const effectiveUser = await getEffectiveSessionUser(supabase)
  if (!effectiveUser) redirect("/login")

  // Fase H: o "Learning Health Score" desta página era calculado com valores
  // FIXOS (desempenho 70 e retenção 75 para toda disciplina, energia 3, sem
  // backlog nem lapsos) — só a sequência e a meta semanal vinham do perfil. O
  // número parecia personalizado sem ser. Não existe hoje fonte real de
  // retenção (não há revisões registradas: review_items/review_history vazios),
  // então a métrica fica oculta até existir cálculo real. O log abaixo é real.

  // Busca o histórico real da tabela adaptive_history
  const { data: history } = await supabase
    .from("adaptive_history")
    .select(
      `
      *,
      disciplines ( name )
    `,
    )
    .eq("user_id", effectiveUser.id)
    .order("created_at", { ascending: false })
    .limit(10)

  const displayHistory = history || []

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
        <Logo href="/dashboard" />
      </header>

      <main className="flex-1 space-y-6 p-4 md:p-8 pt-6">
        <div className="flex flex-col space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">Painel de Estudos</h2>

          <nav className="flex space-x-4 border-b pb-2 text-sm overflow-x-auto">
            {/* Fase G.1: Performance, Questões e Analytics saíram desta barra —
                as três rotas agora redirecionam para /estatisticas. */}
            <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
              Visão Geral
            </Link>
            <Link href="/dashboard/reviews" className="text-muted-foreground hover:text-foreground">
              Revisões
            </Link>
            <Link
              href="/dashboard/adaptive"
              className="font-semibold text-primary border-b-2 border-primary pb-2"
            >
              Adaptativo (ALE)
            </Link>
            <Link href="/dashboard/history" className="text-muted-foreground hover:text-foreground">
              Histórico
            </Link>
            <Link href="/estatisticas" className="text-muted-foreground hover:text-foreground">
              Estatísticas
            </Link>
          </nav>
        </div>

        {/* Fase H: o antigo termômetro "Learning Health Score" e o painel
            "Detecção de Risco" usavam valores fixos (ver comentário acima) e
            foram substituídos por este aviso até existir cálculo real. */}
        <div className="border rounded-lg p-6 bg-card">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Activity className="h-5 w-5 text-muted-foreground" /> Saúde de aprendizado
          </h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            Indisponível. Este índice dependia de medições de retenção por revisão que ainda não
            existem para a sua conta, e por isso não é exibido. Nenhum número é mostrado aqui até
            haver um cálculo feito com os seus dados.
          </p>
        </div>

        {/* Histórico e Auditoria */}
        <div className="border rounded-lg bg-card mt-6">
          <div className="p-6 border-b">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <History className="h-5 w-5 text-muted-foreground" /> Log de Adaptações (Auditoria)
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Registro das intervenções do Adaptive Learning Engine no seu cronograma.
            </p>
            <p className="text-xs text-muted-foreground mt-2 max-w-3xl">
              Nesses registros, &quot;retenção&quot; foi a taxa de acerto das suas sessões nos 90
              dias anteriores à geração do cronograma; quando uma disciplina não tinha questões
              registradas, o motor usou um valor padrão (50% ou 60%). A geração de cronograma
              atual não registra novas intervenções.
            </p>
          </div>
          <div className="p-0">
            <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[500px]">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-6 py-4 font-medium">Motor</th>
                  <th className="px-6 py-4 font-medium">Ação</th>
                  <th className="px-6 py-4 font-medium">Alvo</th>
                  <th className="px-6 py-4 font-medium">Motivo Algorítmico</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {displayHistory.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-xs text-muted-foreground">
                      Nenhuma intervenção registrada.
                    </td>
                  </tr>
                ) : (
                  displayHistory.map((log, i) => (
                    <tr key={i} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap tabular-nums text-xs text-muted-foreground">
                        {log.engine}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            log.delta > 0
                              ? "bg-indigo-100 text-indigo-700"
                              : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {log.delta > 0 ? "+" : ""}
                          {Math.round((log.delta || 0) * 100)}% Peso
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium">
                        {log.disciplines?.name || "Cronograma Global"}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{log.reason}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
