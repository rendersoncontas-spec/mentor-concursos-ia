"use client"

import { useState, useEffect } from "react"
import {
  Trophy,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Crown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getGlobalRankingAction } from "@/application/study-analytics/study-analytics.actions"
import { toast } from "sonner"
import { Loader2, Users } from "lucide-react"

export interface RankingStudent {
  rank: number
  name: string
  avatar: string
  targetContest: string
  hours: string
  questions: number
  pages: number
  initials: string
  bgColor: string
}

export function EstudeiRankingView() {
  const [activeTab, setActiveTab] = useState<"TEMPO" | "QUESTOES" | "PAGINAS">("TEMPO")
  const [selectedCargo, setSelectedCargo] = useState<string>("Cargo Alvo")
  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState<RankingStudent[]>([])

  useEffect(() => {
    async function loadRanking() {
      setLoading(true)
      const { data, error } = await getGlobalRankingAction()
      if (error) {
        toast.error("Erro ao carregar ranking: " + error)
      } else {
        setStudents(data || [])
      }
      setLoading(false)
    }
    loadRanking()
  }, [])

  return (
    <div className="space-y-6">
      {/* Top Header Actions — Mantendo Cargo Alvo Ativo */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground">Ranking</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Comparativo entre alunos concorrendo para o mesmo cargo alvo
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Button variant="outline" className="border-[#2563EB] text-[#2563EB] font-bold text-xs gap-2 shadow-2xs">
            <Trophy className="h-3.5 w-3.5" />
            {selectedCargo}
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Seção NA SEMANA PASSADA (4 Cards Métricos 100% Estudei) */}
      <div className="space-y-2">
        <span className="text-xs font-extrabold uppercase text-muted-foreground tracking-wider block">
          NA SEMANA PASSADA
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Estudou */}
          <div className="rounded-xl border bg-card p-4 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase text-muted-foreground block">ESTUDOU</span>
              <span className="text-xl font-black text-foreground">0 horas</span>
            </div>
            <div className="text-right border-l pl-4 space-y-1">
              <span className="text-[10px] font-bold uppercase text-muted-foreground block">FICOU EM</span>
              <span className="text-xl font-black text-[#2563EB]">--</span>
            </div>
          </div>

          {/* Card 2: Fez */}
          <div className="rounded-xl border bg-card p-4 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase text-muted-foreground block">FEZ</span>
              <span className="text-xl font-black text-foreground">0 questões</span>
            </div>
            <div className="text-right border-l pl-4 space-y-1">
              <span className="text-[10px] font-bold uppercase text-muted-foreground block">FICOU EM</span>
              <span className="text-xl font-black text-[#2563EB]">--</span>
            </div>
          </div>

          {/* Card 3: Leu */}
          <div className="rounded-xl border bg-card p-4 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase text-muted-foreground block">LEU</span>
              <span className="text-xl font-black text-foreground">0 páginas</span>
            </div>
            <div className="text-right border-l pl-4 space-y-1">
              <span className="text-[10px] font-bold uppercase text-muted-foreground block">FICOU EM</span>
              <span className="text-xl font-black text-[#2563EB]">--</span>
            </div>
          </div>

          {/* Card 4: Alunos no Cargo */}
          <div className="rounded-xl border bg-card p-4 shadow-sm flex flex-col justify-between space-y-1">
            <span className="text-[10px] font-bold uppercase text-muted-foreground block">
              ALUNOS NO CARGO ({selectedCargo})
            </span>
            <div className="text-right pt-1">
              <span className="text-2xl font-black text-foreground">1</span>
            </div>
          </div>
        </div>
      </div>

      {/* Layout de Duas Colunas Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna Esquerda: RANKING DESTA SEMANA (2/3 da largura) */}
        <div className="lg:col-span-2 rounded-xl border bg-card p-6 shadow-sm flex flex-col space-y-5">
          <div className="space-y-1 border-b pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <h2 className="text-xs font-extrabold uppercase text-muted-foreground tracking-wider">
                  RANKING DESTA SEMANA
                </h2>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <Badge variant="outline" className="text-[10px] border-[#2563EB] text-[#2563EB] font-bold">
                Cargo: {selectedCargo}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium">
              Compare seu desempenho com outros alunos estudando para o cargo de <strong className="text-foreground">{selectedCargo}</strong> esta semana. O Ranking é em tempo real.
            </p>

            {/* Abas: Tempo de Estudo | Questões | Páginas Lidas */}
            <div className="flex items-center gap-6 pt-3 text-xs font-bold">
              <button
                onClick={() => setActiveTab("TEMPO")}
                className={`pb-2 transition-all border-b-2 ${
                  activeTab === "TEMPO"
                    ? "border-[#2563EB] text-[#2563EB]"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Tempo de Estudo
              </button>

              <button
                onClick={() => setActiveTab("QUESTOES")}
                className={`pb-2 transition-all border-b-2 ${
                  activeTab === "QUESTOES"
                    ? "border-[#2563EB] text-[#2563EB]"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Questões
              </button>

              <button
                onClick={() => setActiveTab("PAGINAS")}
                className={`pb-2 transition-all border-b-2 ${
                  activeTab === "PAGINAS"
                    ? "border-[#2563EB] text-[#2563EB]"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Páginas Lidas
              </button>
            </div>
          </div>

          {/* Banner Posição Atual do Usuário */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl font-black text-[#2563EB]"># --</span>
              <div className="space-y-0.5">
                <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
                  POSIÇÃO ATUAL
                </span>
                <span className="text-xs text-muted-foreground font-medium">
                  Cargo Alvo: <strong className="text-foreground">{selectedCargo}</strong>
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                TEMPO DE ESTUDO
              </span>
              <span className="text-lg font-black text-foreground">--</span>
            </div>
          </div>

          {/* Lista de Alunos Ranqueados */}
          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
            {loading ? (
               <div className="flex items-center justify-center py-10">
                 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
               </div>
            ) : students.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg bg-card/50">
                 <Users className="h-10 w-10 text-muted-foreground/30 mb-4" />
                 <span className="text-sm font-bold text-foreground">Ainda não há dados suficientes</span>
                 <span className="text-xs text-muted-foreground mt-1">Nenhum aluno registrou atividades esta semana para o seu cargo.</span>
               </div>
            ) : (
              students.map((student) => (
                <div
                  key={student.rank}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/20 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 flex items-center justify-center shrink-0">
                      {student.rank === 1 && <span className="text-xl">🏆</span>}
                      {student.rank === 2 && <span className="text-xl">🥈</span>}
                      {student.rank === 3 && <span className="text-xl">🥉</span>}
                      {student.rank > 3 && (
                        <span className="text-xs font-bold text-muted-foreground font-mono">
                          {student.rank}º
                        </span>
                      )}
                    </div>

                    <div className={`w-8 h-8 rounded-full ${student.bgColor} text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs`}>
                      {student.initials}
                    </div>

                    <div>
                      <span className="font-bold text-sm text-foreground block leading-none">{student.name}</span>
                      <span className="text-[10px] text-muted-foreground font-medium">{student.targetContest}</span>
                    </div>
                  </div>

                  <span className="text-xs font-mono font-bold text-foreground">
                    {activeTab === "TEMPO" && student.hours}
                    {activeTab === "QUESTOES" && `${student.questions} questões`}
                    {activeTab === "PAGINAS" && `${student.pages} pág.`}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Coluna Direita: VENCEDORES DAS SEMANAS ANTERIORES (Pódio Gráfico 100% Estudei) */}
        <div className="rounded-xl border bg-card p-6 shadow-sm flex flex-col justify-between space-y-6">
          <div className="flex items-center justify-between border-b pb-3">
            <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider">
              VENCEDORES DAS SEMANAS ANTERIORES
            </span>

            <div className="flex items-center gap-1 text-xs font-mono font-bold text-muted-foreground">
              <button className="p-0.5 hover:text-foreground">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-[10px] text-[#2563EB]">27/07 ~ 02/08</span>
              <button className="p-0.5 hover:text-foreground">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="pt-10 flex flex-col items-center justify-center text-center opacity-70">
            <Trophy className="h-12 w-12 text-muted-foreground mb-4 opacity-30" />
            <span className="text-sm font-bold text-foreground">Sem dados anteriores</span>
            <span className="text-xs text-muted-foreground mt-1">O ranking começou a ser computado esta semana.</span>
          </div>
        </div>
      </div>
    </div>
  )
}

