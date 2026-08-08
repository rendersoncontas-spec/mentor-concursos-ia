"use client"

import { useState } from "react"
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

const TARGET_CARGO = "Analista Tributário"

const TOP_STUDENTS_LIST: RankingStudent[] = [
  { rank: 1, name: "Kethly Furquim", avatar: "KF", targetContest: TARGET_CARGO, hours: "24h 12min", questions: 320, pages: 140, initials: "KF", bgColor: "bg-emerald-500" },
  { rank: 2, name: "Erika Amaral", avatar: "EA", targetContest: TARGET_CARGO, hours: "24h 00min", questions: 310, pages: 125, initials: "EA", bgColor: "bg-sky-500" },
  { rank: 3, name: "Mateus Ribeiro", avatar: "MR", targetContest: TARGET_CARGO, hours: "22h 45min", questions: 290, pages: 110, initials: "MR", bgColor: "bg-purple-500" },
  { rank: 4, name: "Isabel Sampaio", avatar: "IS", targetContest: TARGET_CARGO, hours: "21h 30min", questions: 275, pages: 95, initials: "IS", bgColor: "bg-amber-500" },
  { rank: 5, name: "Eduardo Nogueira", avatar: "EN", targetContest: TARGET_CARGO, hours: "19h 15min", questions: 240, pages: 80, initials: "EN", bgColor: "bg-rose-500" },
  { rank: 6, name: "Yuri Maeda", avatar: "YM", targetContest: TARGET_CARGO, hours: "18h 50min", questions: 220, pages: 75, initials: "YM", bgColor: "bg-teal-500" },
  { rank: 7, name: "Anderson Filho", avatar: "AF", targetContest: TARGET_CARGO, hours: "17h 40min", questions: 200, pages: 60, initials: "AF", bgColor: "bg-indigo-500" },
]

const PAST_WINNERS_PODIUM = {
  first: { rank: 1, username: "gssm", hours: "35h 24min", initials: "GS", avatarBg: "bg-[#2563EB]" },
  second: { rank: 2, username: "sbbernardo9", hours: "34h 34min", initials: "SB", avatarBg: "bg-amber-500" },
  third: { rank: 3, username: "danieljng", hours: "32h 45min", initials: "DA", avatarBg: "bg-orange-500" },
}

export function EstudeiRankingView() {
  const [activeTab, setActiveTab] = useState<"TEMPO" | "QUESTOES" | "PAGINAS">("TEMPO")
  const [selectedCargo, setSelectedCargo] = useState<string>(TARGET_CARGO)

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
              <span className="text-2xl font-black text-foreground">809</span>
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
            {TOP_STUDENTS_LIST.map((student) => (
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
            ))}
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

          {/* Desenho do Pódio Gráfico Verde-Água (100% Paridade Estudei) */}
          <div className="pt-4 pb-2 flex items-end justify-center gap-2 h-48">
            {/* 2º Lugar (Esquerda) */}
            <div className="flex-1 flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-amber-500 text-white font-bold text-xs flex items-center justify-center shadow-md mb-1">
                {PAST_WINNERS_PODIUM.second.initials}
              </div>
              <div className="w-full bg-[#1b9a80] text-white rounded-t-lg h-24 flex flex-col items-center justify-center p-2 text-center shadow-sm">
                <span className="text-xs font-black">2º</span>
                <span className="text-[10px] font-bold truncate max-w-full">
                  {PAST_WINNERS_PODIUM.second.username}
                </span>
                <span className="text-[9px] opacity-80 mt-0.5 font-mono">
                  {PAST_WINNERS_PODIUM.second.hours}
                </span>
              </div>
            </div>

            {/* 1º Lugar (Centro - Mais alto com coroa) */}
            <div className="flex-1 flex flex-col items-center z-10">
              <div className="relative mb-1">
                <Crown className="h-5 w-5 text-amber-400 absolute -top-3 left-1/2 -translate-x-1/2 drop-shadow-xs" />
                <div className="w-12 h-12 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center shadow-lg border-2 border-amber-400">
                  👑
                </div>
              </div>
              <div className="w-full bg-[#2563EB] text-white rounded-t-lg h-32 flex flex-col items-center justify-center p-2 text-center shadow-md">
                <span className="text-sm font-black">1º</span>
                <span className="text-[11px] font-bold truncate max-w-full">
                  {PAST_WINNERS_PODIUM.first.username}
                </span>
                <span className="text-[10px] opacity-90 mt-0.5 font-mono">
                  {PAST_WINNERS_PODIUM.first.hours}
                </span>
              </div>
            </div>

            {/* 3º Lugar (Direita) */}
            <div className="flex-1 flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-orange-500 text-white font-bold text-xs flex items-center justify-center shadow-md mb-1">
                {PAST_WINNERS_PODIUM.third.initials}
              </div>
              <div className="w-full bg-[#147a65] text-white rounded-t-lg h-20 flex flex-col items-center justify-center p-2 text-center shadow-sm">
                <span className="text-xs font-black">3º</span>
                <span className="text-[10px] font-bold truncate max-w-full">
                  {PAST_WINNERS_PODIUM.third.username}
                </span>
                <span className="text-[9px] opacity-80 mt-0.5 font-mono">
                  {PAST_WINNERS_PODIUM.third.hours}
                </span>
              </div>
            </div>
          </div>

          {/* Lista Compacta de Posições 4º a 7º */}
          <div className="space-y-2 border-t pt-3 text-xs">
            {TOP_STUDENTS_LIST.slice(3, 7).map((st) => (
              <div key={st.rank} className="flex items-center justify-between text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-[10px] w-4">{st.rank}º</span>
                  <div className={`w-5 h-5 rounded-full ${st.bgColor} text-white text-[9px] font-bold flex items-center justify-center`}>
                    {st.initials}
                  </div>
                  <span className="font-semibold text-foreground truncate max-w-[110px]">{st.name}</span>
                </div>
                <span className="font-mono text-[10px] font-bold">{st.hours}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

