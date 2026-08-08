"use client"

import { useState } from "react"
import {
  Trophy,
  Flame,
  Brain,
  Clock,
  Scroll,
  BookOpen,
  Compass,
  Star,
  Target,
  Zap,
  Moon,
  Sun,
  ShieldCheck,
  Award,
  Lock,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

export interface AchievementItem {
  id: string
  title: string
  description: string
  unlocked: boolean
  unlockedAt?: string
  progressText?: string
  iconType: string
  badgeColor?: string
}

export interface AchievementCategory {
  id: string
  title: string
  subtitle: string
  unlockedCount: number
  totalCount: number
  color: string
  items: AchievementItem[]
}

const CATEGORIES_DATA: AchievementCategory[] = [
  {
    id: "trilha-inicial",
    title: "TRILHA INICIAL",
    subtitle: "Primeiras ações que marcam o início da sua jornada no Mentor IA.",
    unlockedCount: 4,
    totalCount: 6,
    color: "#2563EB",
    items: [
      {
        id: "ti-1",
        title: "Primeiros 7 dias sem falhar",
        description: "Mantenha uma sequência de 7 dias estudando.",
        unlocked: false,
        progressText: "Continue estudando para desbloquear.",
        iconType: "flame",
      },
      {
        id: "ti-2",
        title: "Desafio Aceito",
        description: "Você respondeu seu primeiro quiz e treinou de forma ativa.",
        unlocked: false,
        progressText: "Continue estudando para desbloquear.",
        iconType: "brain",
      },
      {
        id: "ti-3",
        title: "Memória Ativada",
        description: "Você fez sua primeira revisão e fortaleceu o aprendizado.",
        unlocked: true,
        unlockedAt: "Conquistada em Ago, 2026",
        iconType: "clock",
        badgeColor: "bg-[#2563EB]",
      },
      {
        id: "ti-4",
        title: "Plano em Ação",
        description: "Você criou um planejamento para estudar com mais clareza.",
        unlocked: true,
        unlockedAt: "Conquistada em Ago, 2026",
        iconType: "scroll",
        badgeColor: "bg-purple-500",
      },
      {
        id: "ti-5",
        title: "Registro de Largada",
        description: "Seu primeiro estudo foi registrado.",
        unlocked: true,
        unlockedAt: "Conquistada em Ago, 2026",
        iconType: "book",
        badgeColor: "bg-emerald-500",
      },
      {
        id: "ti-6",
        title: "Primeiro Passo",
        description: "Você concluiu o onboarding e deu o primeiro passo da sua jornada.",
        unlocked: true,
        unlockedAt: "Conquistada em Ago, 2026",
        iconType: "compass",
        badgeColor: "bg-amber-500",
      },
    ],
  },
  {
    id: "medalhas",
    title: "MEDALHAS",
    subtitle: "Conquistas pelos momentos marcantes da sua jornada.",
    unlockedCount: 1,
    totalCount: 6,
    color: "#a78bfa",
    items: [
      {
        id: "med-1",
        title: "Hall da Fama",
        description: "Fique entre os vencedores da semana.",
        unlocked: false,
        progressText: "Continue estudando para desbloquear.",
        iconType: "trophy",
      },
      {
        id: "med-2",
        title: "Semana Perfeita",
        description: "Você cumpriu todos os dias planejados da semana.",
        unlocked: false,
        progressText: "Continue estudando para desbloquear.",
        iconType: "star",
      },
      {
        id: "med-3",
        title: "Mestre dos Simulados",
        description: "Mostre consistência treinando em ambiente de prova.",
        unlocked: false,
        progressText: "Continue estudando para desbloquear.",
        iconType: "target",
      },
      {
        id: "med-4",
        title: "Incansável",
        description: "Estude mais de 8h em um único dia.",
        unlocked: false,
        progressText: "Continue estudando para desbloquear.",
        iconType: "zap",
      },
      {
        id: "med-5",
        title: "Corujão",
        description: "Você manteve o foco mesmo quando o dia já terminava.",
        unlocked: true,
        unlockedAt: "Conquistada em Ago, 2026",
        iconType: "moon",
        badgeColor: "bg-indigo-600",
      },
      {
        id: "med-6",
        title: "Madrugador",
        description: "Você começou o dia estudando cedo e saiu na frente.",
        unlocked: false,
        progressText: "Continue estudando para desbloquear.",
        iconType: "sun",
      },
    ],
  },
  {
    id: "constancia",
    title: "CONSTÂNCIA",
    subtitle: "Conquistas para quem mantém uma sequência de estudos todos os dias.",
    unlockedCount: 0,
    totalCount: 6,
    color: "#fb923c",
    items: [
      { id: "c-1", title: "Primeiro Ritmo", description: "7 dias seguidos de estudo.", unlocked: false, progressText: "Faltam 7 dias para conquistar.", iconType: "shield" },
      { id: "c-2", title: "Sem Falhar", description: "15 dias de consistência.", unlocked: false, progressText: "Faltam 15 dias para conquistar.", iconType: "shield" },
      { id: "c-3", title: "Corrente Forte", description: "30 dias seguidos de estudo.", unlocked: false, progressText: "Faltam 30 dias para conquistar.", iconType: "shield" },
      { id: "c-4", title: "Imparável", description: "100 dias de constância.", unlocked: false, progressText: "Faltam 100 dias para conquistar.", iconType: "shield" },
      { id: "c-5", title: "Inquebrável", description: "180 dias seguidos de estudo.", unlocked: false, progressText: "Faltam 180 dias para conquistar.", iconType: "shield" },
      { id: "c-6", title: "Lendário", description: "365 dias de constância.", unlocked: false, progressText: "Faltam 365 dias para conquistar.", iconType: "shield" },
    ],
  },
  {
    id: "horas-estudo",
    title: "HORAS DE ESTUDO",
    subtitle: "Conquistas para quem acumula tempo real de dedicação.",
    unlockedCount: 0,
    totalCount: 5,
    color: "#60a5fa",
    items: [
      { id: "h-1", title: "Aquecimento", description: "20 horas estudadas.", unlocked: false, progressText: "Faltam 20h para conquistar.", iconType: "clock" },
      { id: "h-2", title: "Em Movimento", description: "100 horas acumuladas.", unlocked: false, progressText: "Faltam 100h para conquistar.", iconType: "clock" },
      { id: "h-3", title: "Ritmo Forte", description: "300 horas de estudo.", unlocked: false, progressText: "Faltam 300h para conquistar.", iconType: "clock" },
      { id: "h-4", title: "Alta Carga", description: "500 horas registradas.", unlocked: false, progressText: "Faltam 500h para conquistar.", iconType: "clock" },
      { id: "h-5", title: "Maratonista", description: "1.000 horas de estudo.", unlocked: false, progressText: "Faltam 1000h para conquistar.", iconType: "clock" },
    ],
  },
  {
    id: "questoes-resolvidas",
    title: "QUESTÕES RESOLVIDAS",
    subtitle: "Conquistas para quem treina com prática e melhora o desempenho.",
    unlockedCount: 0,
    totalCount: 6,
    color: "#4ade80",
    items: [
      { id: "q-1", title: "Primeiro Alvo", description: "50 questões resolvidas.", unlocked: false, progressText: "Faltam 50 questões para conquistar.", iconType: "target" },
      { id: "q-2", title: "Mira Certa", description: "250 questões concluídas.", unlocked: false, progressText: "Faltam 250 questões para conquistar.", iconType: "target" },
      { id: "q-3", title: "Ritmo de Prova", description: "1.000 questões resolvidas.", unlocked: false, progressText: "Faltam 1000 questões para conquistar.", iconType: "target" },
      { id: "q-4", title: "Bateria Forte", description: "2.500 questões concluídas.", unlocked: false, progressText: "Faltam 2500 questões para conquistar.", iconType: "target" },
      { id: "q-5", title: "Máquina de Questões", description: "5.000 questões resolvidas.", unlocked: false, progressText: "Faltam 5000 questões para conquistar.", iconType: "target" },
      { id: "q-6", title: "Mestre das Questões", description: "10.000 questões concluídas.", unlocked: false, progressText: "Faltam 10000 questões para conquistar.", iconType: "target" },
    ],
  },
  {
    id: "paginas-lidas",
    title: "PÁGINAS LIDAS",
    subtitle: "Conquistas para quem constrói repertório e domina o conteúdo.",
    unlockedCount: 0,
    totalCount: 5,
    color: "#38bdf8",
    items: [
      { id: "p-1", title: "Primeira Página", description: "50 páginas lidas.", unlocked: false, progressText: "Faltam 50 páginas para conquistar.", iconType: "book" },
      { id: "p-2", title: "Leitor em Curso", description: "250 páginas lidas.", unlocked: false, progressText: "Faltam 250 páginas para conquistar.", iconType: "book" },
      { id: "p-3", title: "Virador de Páginas", description: "500 páginas lidas.", unlocked: false, progressText: "Faltam 500 páginas para conquistar.", iconType: "book" },
      { id: "p-4", title: "Repertório Forte", description: "1.000 páginas lidas.", unlocked: false, progressText: "Faltam 1000 páginas para conquistar.", iconType: "book" },
      { id: "p-5", title: "Biblioteca Viva", description: "2.500 páginas lidas.", unlocked: false, progressText: "Faltam 2500 páginas para conquistar.", iconType: "book" },
    ],
  },
  {
    id: "revisoes-feitas",
    title: "REVISÕES FEITAS",
    subtitle: "Conquistas para quem revisa e fixa o aprendizado.",
    unlockedCount: 0,
    totalCount: 5,
    color: "#f87171",
    items: [
      { id: "r-1", title: "Primeira Retomada", description: "10 revisões concluídas.", unlocked: false, progressText: "Faltam 9 revisões para conquistar.", iconType: "clock" },
      { id: "r-2", title: "Memória em Treino", description: "50 revisões concluídas.", unlocked: false, progressText: "Faltam 49 revisões para conquistar.", iconType: "clock" },
      { id: "r-3", title: "Fixação Sólida", description: "100 revisões concluídas.", unlocked: false, progressText: "Faltam 99 revisões para conquistar.", iconType: "clock" },
      { id: "r-4", title: "Ciclo Fechado", description: "250 revisões concluídas.", unlocked: false, progressText: "Faltam 249 revisões para conquistar.", iconType: "clock" },
      { id: "r-5", title: "Memória de Ferro", description: "500 revisões concluídas.", unlocked: false, progressText: "Faltam 499 revisões para conquistar.", iconType: "clock" },
    ],
  },
]

export function EstudeiConquistasView() {
  return (
    <div className="space-y-8 pb-12">
      {/* Header da Página — 100% Estudei Imagem 1 */}
      <div>
        <h1 className="text-2xl font-black text-foreground tracking-tight">Minhas Conquistas</h1>
      </div>

      {/* Lista de Seções de Conquistas */}
      <div className="space-y-10">
        {CATEGORIES_DATA.map((cat) => {
          const pct = Math.round((cat.unlockedCount / cat.totalCount) * 100)

          return (
            <div key={cat.id} className="space-y-4">
              {/* Header da Seção com Barra de Progresso no Canto Direito */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    <h2 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                      {cat.title}
                    </h2>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{cat.subtitle}</p>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                  <span className="text-xs font-mono font-bold text-foreground">
                    {cat.unlockedCount} de {cat.totalCount}
                  </span>
                  <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: cat.color }}
                    />
                  </div>
                </div>
              </div>

              {/* Grid dos Cards de Medalhas/Conquistas (3 Colunas em Telas Grandes - 100% Estudei Foto 1) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {cat.items.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-2xl border p-4 transition-all flex items-start gap-4 ${
                      item.unlocked
                        ? "bg-card border-[#2563EB] shadow-xs"
                        : "bg-card border-border/60 hover:border-border"
                    }`}
                  >
                    {/* Medalha / Emblema Ilustrado */}
                    <div className="relative shrink-0">
                      {item.unlocked ? (
                        <div className="w-14 h-14 rounded-full border-4 border-[#2563EB] bg-[#dbeafe]/50 flex items-center justify-center shadow-xs">
                          <div className="w-10 h-10 rounded-full bg-[#2563EB] flex items-center justify-center text-white font-black">
                            <Award className="h-6 w-6" />
                          </div>
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-full border-2 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center opacity-70">
                          <div className="w-10 h-10 rounded-full border border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-400">
                            <Lock className="h-4 w-4" />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Conteúdo do Card */}
                    <div className="space-y-1 min-w-0 flex-1">
                      <h3 className="font-extrabold text-sm text-foreground leading-snug">
                        {item.title}
                      </h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {item.description}
                      </p>

                      {item.unlocked ? (
                        <span className="text-[11px] font-bold text-[#2563EB] block pt-1">
                          {item.unlockedAt || "Conquistada em Ago, 2026"}
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium text-muted-foreground/70 block pt-1">
                          {item.progressText || "Continue estudando para desbloquear."}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

