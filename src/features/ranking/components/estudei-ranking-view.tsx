"use client"

import { useState, useEffect, useMemo } from "react"
import {
  Trophy,
  HelpCircle,
  Users,
  Loader2,
  Medal,
  Bug,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { getGlobalRankingAction, testGlobalRankingRpc } from "@/application/study-analytics/study-analytics.actions"
import { toast } from "sonner"

export interface RankingStudent {
  rank: number
  id: string
  name: string
  avatar: string
  targetContest: string
  hours: string
  questions: number
  pages: number
  initials: string
  bgColor: string
  hasActivity: boolean
}

type RankingPeriod = 'this_week' | 'last_week' | 'general'

export function EstudeiRankingView() {
  const [activeTab, setActiveTab] = useState<"TEMPO" | "QUESTOES" | "PAGINAS">("TEMPO")
  const [period, setPeriod] = useState<RankingPeriod>("this_week")
  const [loading, setLoading] = useState(true)
  const [debugInfo, setDebugInfo] = useState<string>("")
  const [data, setData] = useState<{
    totalParticipants: number
    rankingTempo: RankingStudent[]
    rankingQuestions: RankingStudent[]
    rankingPages: RankingStudent[]
    userStats: {
      tempo: RankingStudent | null
      questoes: RankingStudent | null
      paginas: RankingStudent | null
    }
  } | null>(null)

  useEffect(() => {
    async function loadRanking() {
      setLoading(true)
      const res = await getGlobalRankingAction(period)
      if (res.error) {
        toast.error("Erro ao carregar ranking: " + res.error)
      } else {
        setData(res.data as any)
      }
      setLoading(false)
    }
    loadRanking()
  }, [period])

  const currentRanking = useMemo(() => {
    if (!data) return []
    if (activeTab === "TEMPO") return data.rankingTempo
    if (activeTab === "QUESTOES") return data.rankingQuestions
    return data.rankingPages
  }, [data, activeTab])

  const currentUserStats = useMemo(() => {
    if (!data) return null
    if (activeTab === "TEMPO") return data.userStats.tempo
    if (activeTab === "QUESTOES") return data.userStats.questoes
    return data.userStats.paginas
  }, [data, activeTab])

  const top3 = useMemo(() => {
    return currentRanking.filter(s => s.hasActivity).slice(0, 3)
  }, [currentRanking])

  const others = useMemo(() => {
    return currentRanking.filter(s => s.hasActivity).slice(3)
  }, [currentRanking])

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground font-medium">Carregando ranking global...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Top Header Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl font-black text-foreground">Ranking Global</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Compare seu desempenho com todos os estudantes do Mentor IA.
          </p>
        </div>

        <div className="flex items-center gap-2 p-1 bg-muted rounded-xl border">
          <button
            onClick={() => setPeriod('this_week')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${period === 'this_week' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Esta semana
          </button>
          <button
            onClick={() => setPeriod('last_week')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${period === 'last_week' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Semana passada
          </button>
          <button
            onClick={() => setPeriod('general')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${period === 'general' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Geral
          </button>
          <button
            onClick={async () => {
              setDebugInfo("Testando RPC...")
              const res = await testGlobalRankingRpc()
              setDebugInfo(res.success ? "OK - veja console do servidor" : `Erro: ${res.error}`)
            }}
            className="px-3 py-2 text-xs font-bold rounded-lg text-amber-600 hover:bg-amber-50 border border-amber-200"
            title="Testar RPC do Ranking"
          >
            <Bug className="h-4 w-4 inline mr-1" /> Debug RPC
          </button>
        </div>
      </div>

      {debugInfo && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 font-mono animate-in fade-in">
          <span className="font-bold">Debug RPC: </span> {debugInfo}
        </div>
      )}

      {/* Seção de Métricas do Usuário (4 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border bg-card p-5 shadow-sm hover:shadow-md transition-all flex items-center justify-between group">
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-widest block group-hover:text-primary transition-colors">MINHA POSIÇÃO</span>
            <span className="text-3xl font-black text-foreground">#{currentUserStats?.rank || '--'}</span>
          </div>
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
            <Trophy className="h-6 w-6" />
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-sm hover:shadow-md transition-all flex items-center justify-between group">
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-widest block">PARTICIPANTES</span>
            <span className="text-3xl font-black text-foreground">{data?.totalParticipants || 0}</span>
          </div>
          <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
            <Users className="h-6 w-6" />
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-sm hover:shadow-md transition-all flex items-center justify-between group">
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-widest block">ESTUDADO</span>
            <span className="text-3xl font-black text-foreground">{currentUserStats?.hours || '0min'}</span>
          </div>
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
            <Medal className="h-6 w-6" />
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-sm hover:shadow-md transition-all flex items-center justify-between group">
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-widest block">QUESTÕES</span>
            <span className="text-3xl font-black text-foreground">{currentUserStats?.questions || 0}</span>
          </div>
          <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-500">
            <Medal className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Main Ranking Content */}
      <div className="rounded-3xl border bg-card shadow-sm overflow-hidden">
        <div className="p-8 border-b bg-muted/30">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black uppercase tracking-tighter">Ranking Global</h2>
                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[10px] font-bold">TEMPO REAL</Badge>
              </div>
              <p className="text-xs text-muted-foreground font-medium">
                {period === 'this_week' && "Resultados parciais da semana atual (Segunda a Domingo)."}
                {period === 'last_week' && "Consolidado da semana passada."}
                {period === 'general' && "Ranking histórico desde o início."}
              </p>
            </div>

            <div className="flex items-center gap-4 bg-muted p-1 rounded-xl border self-start md:self-auto">
              <button
                onClick={() => setActiveTab("TEMPO")}
                className={`px-4 py-2 text-xs font-black rounded-lg transition-all ${activeTab === "TEMPO" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Tempo
              </button>
              <button
                onClick={() => setActiveTab("QUESTOES")}
                className={`px-4 py-2 text-xs font-black rounded-lg transition-all ${activeTab === "QUESTOES" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Questões
              </button>
              <button
                onClick={() => setActiveTab("PAGINAS")}
                className={`px-4 py-2 text-xs font-black rounded-lg transition-all ${activeTab === "PAGINAS" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Páginas
              </button>
            </div>
          </div>
        </div>

        <div className="p-8">
          {/* Status do Usuário Atual (Se zerado) */}
          {currentUserStats && !currentUserStats.hasActivity && (
            <div className="mb-10 p-5 rounded-2xl bg-amber-500/5 border border-amber-500/20 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="flex items-center gap-3 text-amber-600">
                <HelpCircle className="h-5 w-5" />
                <span className="text-sm font-bold">Você ainda não possui atividade {period === 'general' ? 'no histórico' : 'nesta semana'}.</span>
              </div>
              <p className="text-xs text-muted-foreground max-w-sm">Comece a estudar hoje mesmo para aparecer no ranking global e ganhar seu lugar no pódio!</p>
            </div>
          )}

          {/* Podium for Top 3 */}
          {top3.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
              {/* Order: 2, 1, 3 for visual podium feel */}
              {[top3[1], top3[0], top3[2]].map((student, idx) => {
                if (!student) return <div key={idx} className="hidden md:block" />
                const isFirst = student.rank === 1
                return (
                  <div key={student.id} className={`flex flex-col items-center p-6 rounded-3xl border transition-all hover:scale-105 duration-300 ${isFirst ? 'bg-primary/5 border-primary/30 shadow-lg md:-mt-4' : 'bg-card border-border shadow-sm'} ${idx === 0 ? 'md:order-1' : idx === 1 ? 'md:order-2' : 'md:order-3'}`}>
                    <div className="relative mb-6">
                      <div className={`w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-black shadow-xl ring-4 ring-background ${student.bgColor}`}>
                        {student.avatar ? (
                          <img src={student.avatar} alt={student.name} className="w-full h-full rounded-full object-cover" />
                        ) : student.initials}
                      </div>
                      <div className={`absolute -bottom-2 -right-2 w-10 h-10 rounded-full flex items-center justify-center text-white font-black border-4 border-background shadow-lg ${isFirst ? 'bg-amber-400 scale-125' : student.rank === 2 ? 'bg-slate-300' : 'bg-amber-700'}`}>
                        {student.rank}
                      </div>
                    </div>
                    <span className="text-lg font-black text-foreground text-center line-clamp-1 mb-1">{student.name}</span>
                    <span className="text-xs text-muted-foreground font-bold uppercase tracking-widest mb-4">Membro Mentor IA</span>
                    <Badge className={`font-mono font-black text-sm px-4 py-1.5 rounded-full ${isFirst ? 'bg-primary text-white' : 'bg-muted text-foreground'}`}>
                      {activeTab === "TEMPO" ? student.hours : activeTab === "QUESTOES" ? `${student.questions} QUESTÕES` : `${student.pages} PÁGINAS`}
                    </Badge>
                  </div>
                )
              })}
            </div>
          ) : !loading && (
             <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 bg-muted/20 rounded-3xl border border-dashed">
               <Users className="h-16 w-12 text-muted-foreground opacity-20" />
               <div className="space-y-1">
                 <h3 className="text-lg font-bold text-foreground">Sem participantes ainda</h3>
                 <p className="text-xs text-muted-foreground max-w-xs mx-auto">Nenhum aluno registrou atividades para os critérios selecionados neste período.</p>
               </div>
             </div>
          )}

          {/* Others list */}
          {others.length > 0 && (
            <div className="space-y-3">
              <div className="grid grid-cols-12 px-6 py-2 text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">
                <div className="col-span-1">Pos.</div>
                <div className="col-span-8">Estudante</div>
                <div className="col-span-3 text-right">Desempenho</div>
              </div>
              {others.map((student) => (
                <div
                  key={student.id}
                  className={`grid grid-cols-12 items-center p-4 rounded-2xl border transition-all hover:bg-muted/30 group ${student.id === currentUserStats?.id ? 'bg-primary/5 border-primary/20' : 'bg-card border-border'}`}
                >
                  <div className="col-span-1 text-sm font-black text-muted-foreground group-hover:text-primary transition-colors">
                    #{student.rank}
                  </div>
                  <div className="col-span-8 flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm ${student.bgColor}`}>
                      {student.avatar ? (
                        <img src={student.avatar} alt={student.name} className="w-full h-full rounded-xl object-cover" />
                      ) : student.initials}
                    </div>
                    <div>
                      <span className="font-bold text-sm text-foreground block leading-tight">{student.name}</span>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">Estudante Oficial</span>
                    </div>
                  </div>
                  <div className="col-span-3 text-right">
                    <span className="text-sm font-black text-foreground font-mono">
                      {activeTab === "TEMPO" && student.hours}
                      {activeTab === "QUESTOES" && `${student.questions} q.`}
                      {activeTab === "PAGINAS" && `${student.pages} pág.`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

