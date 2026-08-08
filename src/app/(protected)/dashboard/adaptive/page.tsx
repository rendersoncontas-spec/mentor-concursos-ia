import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/infrastructure/supabase/server"
import { Logo } from "@/components/ui/logo"
import { 
  Activity,
  Zap,
  TrendingUp,
  History,
  ShieldAlert,
  ArrowRight
} from "lucide-react"
import { calculateLearningHealthScore, AnalyticsContext } from "@/application/adaptive-learning/adaptive-learning.service"

export const metadata = {
  title: "Aprendizado Adaptativo (ALE) - Mentor Concursos IA",
}

export default async function AdaptiveDashboardPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // Buscar perfil e disciplinas reais do usuário
  const { data: profile } = await supabase
    .from("profiles")
    .select("weekly_study_hours, streak_days")
    .eq("id", user.id)
    .maybeSingle()

  const { data: userDisciplines } = await supabase
    .from("user_disciplines")
    .select(`
      discipline_id,
      disciplines ( id, name )
    `)
    .eq("user_id", user.id)

  const realDisciplines = (userDisciplines || []).map((ud) => ({
    id: ud.discipline_id,
    name: (ud.disciplines as any)?.name || "Disciplina",
    weight: 2,
    performanceScore: 70,
    retentionRate: 75,
    lapsesCount: 0,
    daysSinceLastStudy: 0
  }))

  const realContext: AnalyticsContext = {
    userId: user.id,
    disciplines: realDisciplines,
    userStats: {
      averageEnergy: 3,
      weeklyHoursStudied: profile?.weekly_study_hours || 0,
      currentStreak: profile?.streak_days || 0,
      totalBacklogReviews: 0
    }
  }

  const lhs = calculateLearningHealthScore(realContext)

  // Busca o histórico real da tabela adaptive_history
  const { data: history } = await supabase
    .from('adaptive_history')
    .select(`
      *,
      disciplines ( name )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10)

  const displayHistory = history || []

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
        <Logo href="/dashboard" />
      </header>
      
      <main className="flex-1 space-y-6 p-4 md:p-8 pt-6">
        <div className="flex flex-col space-y-4">
          <h2 className="text-3xl font-bold tracking-tight">Painel de Estudos</h2>
          
          <nav className="flex space-x-4 border-b pb-2 text-sm overflow-x-auto">
            <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">Visão Geral</Link>
            <Link href="/dashboard/performance" className="text-muted-foreground hover:text-foreground">Performance</Link>
            <Link href="/dashboard/questions" className="text-muted-foreground hover:text-foreground">Questões</Link>
            <Link href="/dashboard/reviews" className="text-muted-foreground hover:text-foreground">Revisões</Link>
            <Link href="/dashboard/adaptive" className="font-semibold text-primary border-b-2 border-primary pb-2">Adaptativo (ALE)</Link>
            <Link href="/dashboard/history" className="text-muted-foreground hover:text-foreground">Histórico</Link>
            <Link href="/dashboard/analytics" className="text-muted-foreground hover:text-foreground">Analytics</Link>
          </nav>
        </div>
        
        {/* Termômetro LHS */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="border rounded-lg p-6 bg-card flex flex-col justify-between shadow-sm md:col-span-2 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <Activity className="h-48 w-48" />
            </div>
            
            <div>
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Activity className="h-5 w-5 text-indigo-500" /> Learning Health Score (LHS)
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Índice unificado de saúde do seu ecossistema de aprendizado.
              </p>
            </div>
            
            <div className="mt-6 flex items-center justify-between">
              <div className="flex items-baseline gap-3">
                <p className={`text-6xl font-black ${lhs.score >= 80 ? 'text-green-500' : lhs.score >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                  {lhs.score}
                </p>
                <p className="text-sm font-medium text-muted-foreground bg-muted px-3 py-1 rounded-full uppercase tracking-wider">
                  {lhs.statusLabel}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4 mt-8 pt-6 border-t">
              <div>
                <p className="text-xs text-muted-foreground">Retenção</p>
                <p className="font-semibold">{Math.round(lhs.components.retention)}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Performance</p>
                <p className="font-semibold">{Math.round(lhs.components.performance)}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Consistência</p>
                <p className="font-semibold">{Math.round(lhs.components.consistency)}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Energia (Burnout)</p>
                <p className={`font-semibold ${lhs.burnoutRisk === 'HIGH' ? 'text-red-500' : ''}`}>
                  {lhs.burnoutRisk}
                </p>
              </div>
            </div>
          </div>

          <div className="border rounded-lg p-6 bg-card shadow-sm flex flex-col justify-center gap-4">
            <h3 className="font-semibold flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-500" /> Detecção de Risco
            </h3>
            {lhs.burnoutRisk === 'HIGH' ? (
              <div className="bg-red-50 text-red-900 p-4 rounded-md border border-red-100 text-sm">
                <p className="font-bold mb-1">Risco Crítico de Burnout</p>
                <p>Volume de estudos excede sua capacidade atual de recuperação energética. O motor cortou 20% da carga horária gerada.</p>
              </div>
            ) : (
               <div className="bg-green-50 text-green-900 p-4 rounded-md border border-green-100 text-sm">
                <p className="font-bold mb-1">Risco Baixo</p>
                <p>Níveis de energia compatíveis com a carga horária atual.</p>
              </div>
            )}
          </div>
        </div>

        {/* Histórico e Auditoria */}
        <div className="border rounded-lg bg-card shadow-sm mt-6">
          <div className="p-6 border-b">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <History className="h-5 w-5 text-muted-foreground" /> Log de Adaptações (Auditoria)
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Registro das intervenções do Adaptive Learning Engine no seu cronograma.
            </p>
          </div>
          <div className="p-0">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
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
                      Nenhuma intervenção registrada ainda. O motor executará adaptações conforme você estuda.
                    </td>
                  </tr>
                ) : (
                  displayHistory.map((log: any, i) => (
                    <tr key={i} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-muted-foreground">
                        {log.engine}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          log.delta > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-rose-100 text-rose-700'
                        }`}>
                          {log.delta > 0 ? '+' : ''}{Math.round((log.delta || 0) * 100)}% Peso
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium">
                        {log.disciplines?.name || 'Cronograma Global'}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {log.reason}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </div>
  )
}
