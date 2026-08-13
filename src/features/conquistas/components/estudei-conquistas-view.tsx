"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Award,
  Lock,
  Loader2,
} from "lucide-react"
import {
  getAchievementsAction,
  type AchievementsFacts,
} from "@/application/achievements/achievements.action"

export interface AchievementItem {
  id: string
  title: string
  description: string
  progressText?: string
  unlockedAt?: string
  iconType: string
  badgeColor?: string
}

export interface AchievementCategory {
  id: string
  title: string
  subtitle: string
  totalCount: number
  color: string
  items: AchievementItem[]
}

const CATEGORIES_DATA: AchievementCategory[] = [
  {
    id: "trilha-inicial",
    title: "TRILHA INICIAL",
    subtitle: "Primeiras ações que marcam o início da sua jornada no Mentor IA.",
    totalCount: 6,
    color: "#2563EB",
    items: [
      {
        id: "ti-1",
        title: "Primeiros 7 dias sem falhar",
        description: "Mantenha uma sequência de 7 dias estudando.",
        iconType: "flame",
      },
      {
        id: "ti-2",
        title: "Desafio Aceito",
        description: "Você respondeu seu primeiro quiz e treinou de forma ativa.",
        iconType: "brain",
      },
      {
        id: "ti-3",
        title: "Memória Ativada",
        description: "Você fez sua primeira revisão e fortaleceu o aprendizado.",
        iconType: "clock",
      },
      {
        id: "ti-4",
        title: "Plano em Ação",
        description: "Você criou um planejamento para estudar com mais clareza.",
        iconType: "scroll",
      },
      {
        id: "ti-5",
        title: "Registro de Largada",
        description: "Seu primeiro estudo foi registrado.",
        iconType: "book",
      },
      {
        id: "ti-6",
        title: "Primeiro Passo",
        description: "Você concluiu o onboarding e deu o primeiro passo da sua jornada.",
        iconType: "compass",
      },
    ],
  },
  {
    id: "medalhas",
    title: "MEDALHAS",
    subtitle: "Conquistas pelos momentos marcantes da sua jornada.",
    totalCount: 6,
    color: "#a78bfa",
    items: [
      {
        id: "med-1",
        title: "Hall da Fama",
        description: "Fique entre os vencedores da semana.",
        iconType: "trophy",
      },
      {
        id: "med-2",
        title: "Semana Perfeita",
        description: "Você cumpriu todos os dias planejados da semana.",
        iconType: "star",
      },
      {
        id: "med-3",
        title: "Mestre dos Simulados",
        description: "Mostre consistência treinando em ambiente de prova.",
        iconType: "target",
      },
      {
        id: "med-4",
        title: "Incansável",
        description: "Estude mais de 8h em um único dia.",
        iconType: "zap",
      },
      {
        id: "med-5",
        title: "Corujão",
        description: "Você manteve o foco mesmo quando o dia já terminava.",
        iconType: "moon",
        badgeColor: "bg-indigo-600",
      },
      {
        id: "med-6",
        title: "Madrugador",
        description: "Você começou o dia estudando cedo e saiu na frente.",
        iconType: "sun",
      },
    ],
  },
  {
    id: "constancia",
    title: "CONSTÂNCIA",
    subtitle: "Conquistas para quem mantém uma sequência de estudos todos os dias.",
    totalCount: 6,
    color: "#fb923c",
    items: [
      { id: "c-1", title: "Primeiro Ritmo", description: "7 dias seguidos de estudo.", iconType: "shield" },
      { id: "c-2", title: "Sem Falhar", description: "15 dias de consistência.", iconType: "shield" },
      { id: "c-3", title: "Corrente Forte", description: "30 dias seguidos de estudo.", iconType: "shield" },
      { id: "c-4", title: "Imparável", description: "100 dias de constância.", iconType: "shield" },
      { id: "c-5", title: "Inquebrável", description: "180 dias seguidos de estudo.", iconType: "shield" },
      { id: "c-6", title: "Lendário", description: "365 dias de constância.", iconType: "shield" },
    ],
  },
  {
    id: "horas-estudo",
    title: "HORAS DE ESTUDO",
    subtitle: "Conquistas para quem acumula tempo real de dedicação.",
    totalCount: 5,
    color: "#60a5fa",
    items: [
      { id: "h-1", title: "Aquecimento", description: "20 horas estudadas.", iconType: "clock" },
      { id: "h-2", title: "Em Movimento", description: "100 horas acumuladas.", iconType: "clock" },
      { id: "h-3", title: "Ritmo Forte", description: "300 horas de estudo.", iconType: "clock" },
      { id: "h-4", title: "Alta Carga", description: "500 horas registradas.", iconType: "clock" },
      { id: "h-5", title: "Maratonista", description: "1.000 horas de estudo.", iconType: "clock" },
    ],
  },
  {
    id: "questoes-resolvidas",
    title: "QUESTÕES RESOLVIDAS",
    subtitle: "Conquistas para quem treina com prática e melhora o desempenho.",
    totalCount: 6,
    color: "#4ade80",
    items: [
      { id: "q-1", title: "Primeiro Alvo", description: "50 questões resolvidas.", iconType: "target" },
      { id: "q-2", title: "Mira Certa", description: "250 questões concluídas.", iconType: "target" },
      { id: "q-3", title: "Ritmo de Prova", description: "1.000 questões resolvidas.", iconType: "target" },
      { id: "q-4", title: "Bateria Forte", description: "2.500 questões concluídas.", iconType: "target" },
      { id: "q-5", title: "Máquina de Questões", description: "5.000 questões resolvidas.", iconType: "target" },
      { id: "q-6", title: "Mestre das Questões", description: "10.000 questões concluídas.", iconType: "target" },
    ],
  },
  {
    id: "paginas-lidas",
    title: "PÁGINAS LIDAS",
    subtitle: "Conquistas para quem constrói repertório e domina o conteúdo.",
    totalCount: 5,
    color: "#38bdf8",
    items: [
      { id: "p-1", title: "Primeira Página", description: "50 páginas lidas.", iconType: "book" },
      { id: "p-2", title: "Leitor em Curso", description: "250 páginas lidas.", iconType: "book" },
      { id: "p-3", title: "Virador de Páginas", description: "500 páginas lidas.", iconType: "book" },
      { id: "p-4", title: "Repertório Forte", description: "1.000 páginas lidas.", iconType: "book" },
      { id: "p-5", title: "Biblioteca Viva", description: "2.500 páginas lidas.", iconType: "book" },
    ],
  },
  {
    id: "revisoes-feitas",
    title: "REVISÕES FEITAS",
    subtitle: "Conquistas para quem revisa e fixa o aprendizado.",
    totalCount: 5,
    color: "#f87171",
    items: [
      { id: "r-1", title: "Primeira Retomada", description: "10 revisões concluídas.", iconType: "clock" },
      { id: "r-2", title: "Memória em Treino", description: "50 revisões concluídas.", iconType: "clock" },
      { id: "r-3", title: "Fixação Sólida", description: "100 revisões concluídas.", iconType: "clock" },
      { id: "r-4", title: "Ciclo Fechado", description: "250 revisões concluídas.", iconType: "clock" },
      { id: "r-5", title: "Memória de Ferro", description: "500 revisões concluídas.", iconType: "clock" },
    ],
  },
]

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60)
  if (h < 1000) return `${h}h`
  return `${Math.round(h / 100) / 10}k horas`
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `Conquistada em ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}`
}

interface AchievementState {
  unlocked: boolean
  unlockedAt?: string
  progressText?: string
}

function evaluateAchievement(id: string, f: AchievementsFacts): AchievementState {
  switch (id) {
    case "ti-1":
      return f.streak >= 7
        ? { unlocked: true }
        : { unlocked: false, progressText: `Sua sequência atual: ${f.streak} dia${f.streak === 1 ? "" : "s"}.` }
    case "ti-2":
      return f.attempts >= 1
        ? { unlocked: true }
        : { unlocked: false, progressText: `${f.attempts} questão${f.attempts === 1 ? "" : "es"} respondida${f.attempts === 1 ? "" : "s"}.` }
    case "ti-3":
      return f.reviews >= 1
        ? { unlocked: true }
        : { unlocked: false, progressText: `${f.reviews} revisão${f.reviews === 1 ? "" : "ões"} concluída${f.reviews === 1 ? "" : "s"}.` }
    case "ti-4":
      return f.plans >= 1
        ? { unlocked: true }
        : { unlocked: false, progressText: "Crie um plano de estudos no Planejamento." }
    case "ti-5": {
      const date = formatDate(f.firstSessionAt)
      return f.sessions >= 1
        ? { unlocked: true, ...(date ? { unlockedAt: date } : {}) }
        : { unlocked: false, progressText: "Registre seu primeiro estudo." }
    }
    case "ti-6":
      return f.onboardingCompleted
        ? { unlocked: true }
        : { unlocked: false, progressText: "Complete o onboarding para começar." }
    case "med-1": {
      const podiums = f.rankingPodiums > 0
      return podiums
        ? { unlocked: true }
        : { unlocked: false, progressText: "Fique entre os 3 primeiros do ranking semanal." }
    }
    case "med-2": {
      if (f.planDaysTotal === 0) {
        return { unlocked: false, progressText: "Crie um plano de estudos no Planejamento." }
      }
      const done = f.planDaysDone >= f.planDaysTotal
      return done
        ? { unlocked: true }
        : {
            unlocked: false,
            progressText: `Você cumpriu ${f.planDaysDone} de ${f.planDaysTotal} dias planejados desta semana.`,
          }
    }
    case "med-3":
      return f.simulados >= 1
        ? { unlocked: true }
        : { unlocked: false, progressText: `${f.simulados} simulado${f.simulados === 1 ? "" : "s"} realizado${f.simulados === 1 ? "" : "s"}.` }
    case "med-4":
      return f.maxDayMinutes >= 480
        ? { unlocked: true }
        : { unlocked: false, progressText: `Seu melhor dia: ${formatHours(f.maxDayMinutes)} de estudo.` }
    case "med-5":
      return f.hasLateNightSession
        ? { unlocked: true }
        : { unlocked: false, progressText: "Estude em um horário noturno (22h às 5h)." }
    case "med-6":
      return f.hasEarlyMorningSession
        ? { unlocked: true }
        : { unlocked: false, progressText: "Estude cedo pela manhã (5h às 8h)." }
    case "c-1":
      return f.streak >= 7 ? { unlocked: true } : { unlocked: false, progressText: `Faltam ${7 - f.streak} dia${7 - f.streak === 1 ? "" : "s"} para conquistar.` }
    case "c-2":
      return f.streak >= 15 ? { unlocked: true } : { unlocked: false, progressText: `Faltam ${15 - f.streak} dias para conquistar.` }
    case "c-3":
      return f.streak >= 30 ? { unlocked: true } : { unlocked: false, progressText: `Faltam ${30 - f.streak} dias para conquistar.` }
    case "c-4":
      return f.streak >= 100 ? { unlocked: true } : { unlocked: false, progressText: `Faltam ${100 - f.streak} dias para conquistar.` }
    case "c-5":
      return f.streak >= 180 ? { unlocked: true } : { unlocked: false, progressText: `Faltam ${180 - f.streak} dias para conquistar.` }
    case "c-6":
      return f.streak >= 365 ? { unlocked: true } : { unlocked: false, progressText: `Faltam ${365 - f.streak} dias para conquistar.` }
    case "h-1":
      return f.totalMinutes >= 1200 ? { unlocked: true } : { unlocked: false, progressText: `Você já acumulou ${formatHours(f.totalMinutes)} de estudo.` }
    case "h-2":
      return f.totalMinutes >= 6000 ? { unlocked: true } : { unlocked: false, progressText: `Você já acumulou ${formatHours(f.totalMinutes)} de estudo.` }
    case "h-3":
      return f.totalMinutes >= 18000 ? { unlocked: true } : { unlocked: false, progressText: `Você já acumulou ${formatHours(f.totalMinutes)} de estudo.` }
    case "h-4":
      return f.totalMinutes >= 30000 ? { unlocked: true } : { unlocked: false, progressText: `Você já acumulou ${formatHours(f.totalMinutes)} de estudo.` }
    case "h-5":
      return f.totalMinutes >= 60000 ? { unlocked: true } : { unlocked: false, progressText: `Você já acumulou ${formatHours(f.totalMinutes)} de estudo.` }
    case "q-1":
      return f.attempts >= 50 ? { unlocked: true } : { unlocked: false, progressText: `Você já resolveu ${f.attempts} questão${f.attempts === 1 ? "" : "es"}.` }
    case "q-2":
      return f.attempts >= 250 ? { unlocked: true } : { unlocked: false, progressText: `Você já resolveu ${f.attempts} questões.` }
    case "q-3":
      return f.attempts >= 1000 ? { unlocked: true } : { unlocked: false, progressText: `Você já resolveu ${f.attempts} questões.` }
    case "q-4":
      return f.attempts >= 2500 ? { unlocked: true } : { unlocked: false, progressText: `Você já resolveu ${f.attempts} questões.` }
    case "q-5":
      return f.attempts >= 5000 ? { unlocked: true } : { unlocked: false, progressText: `Você já resolveu ${f.attempts} questões.` }
    case "q-6":
      return f.attempts >= 10000 ? { unlocked: true } : { unlocked: false, progressText: `Você já resolveu ${f.attempts} questões.` }
    case "p-1":
      return f.pages >= 50 ? { unlocked: true } : { unlocked: false, progressText: `Você já leu ${f.pages} página${f.pages === 1 ? "" : "s"}.` }
    case "p-2":
      return f.pages >= 250 ? { unlocked: true } : { unlocked: false, progressText: `Você já leu ${f.pages} páginas.` }
    case "p-3":
      return f.pages >= 500 ? { unlocked: true } : { unlocked: false, progressText: `Você já leu ${f.pages} páginas.` }
    case "p-4":
      return f.pages >= 1000 ? { unlocked: true } : { unlocked: false, progressText: `Você já leu ${f.pages} páginas.` }
    case "p-5":
      return f.pages >= 2500 ? { unlocked: true } : { unlocked: false, progressText: `Você já leu ${f.pages} páginas.` }
    case "r-1":
      return f.reviews >= 10 ? { unlocked: true } : { unlocked: false, progressText: `Faltam ${10 - f.reviews} revisões para conquistar.` }
    case "r-2":
      return f.reviews >= 50 ? { unlocked: true } : { unlocked: false, progressText: `Faltam ${50 - f.reviews} revisões para conquistar.` }
    case "r-3":
      return f.reviews >= 100 ? { unlocked: true } : { unlocked: false, progressText: `Faltam ${100 - f.reviews} revisões para conquistar.` }
    case "r-4":
      return f.reviews >= 250 ? { unlocked: true } : { unlocked: false, progressText: `Faltam ${250 - f.reviews} revisões para conquistar.` }
    case "r-5":
      return f.reviews >= 500 ? { unlocked: true } : { unlocked: false, progressText: `Faltam ${500 - f.reviews} revisões para conquistar.` }
    default:
      return { unlocked: false }
  }
}

export function EstudeiConquistasView() {
  const [facts, setFacts] = useState<AchievementsFacts | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(() => {
    void (async () => {
      await Promise.resolve()
      setIsLoading(true)
      setLoadError(null)
      const res = await getAchievementsAction()
      if (res.data) setFacts(res.data)
      else setLoadError(res.error || "Erro ao carregar conquistas.")
      setIsLoading(false)
    })()
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-8 pb-12">
      {/* Header da Página */}
      <div>
        <h1 className="text-2xl font-black text-foreground tracking-tight">Minhas Conquistas</h1>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
        </div>
      )}

      {!isLoading && loadError && (
        <div className="rounded-2xl border bg-card p-10 shadow-xs flex flex-col items-center gap-4 text-center my-4">
          <p className="text-sm text-muted-foreground font-medium">{loadError}</p>
          <button
            onClick={load}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-8 h-10 rounded-xl shadow-xs"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {!isLoading && !loadError && facts && (
        /* Lista de Seções de Conquistas */
        <div className="space-y-10">
          {CATEGORIES_DATA.map((cat) => {
            const evaluated = cat.items.map((item) => ({
              item,
              state: evaluateAchievement(item.id, facts),
            }))
            const unlockedCount = evaluated.filter((e) => e.state.unlocked).length
            const pct = Math.round((unlockedCount / cat.totalCount) * 100)

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
                      {unlockedCount} de {cat.totalCount}
                    </span>
                    <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: cat.color }}
                      />
                    </div>
                  </div>
                </div>

                {/* Grid dos Cards de Medalhas/Conquistas */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {evaluated.map(({ item, state }) => (
                    <div
                      key={item.id}
                      className={`rounded-2xl border p-4 transition-all flex items-start gap-4 ${
                        state.unlocked
                          ? "bg-card border-[#2563EB] shadow-xs"
                          : "bg-card border-border/60 hover:border-border"
                      }`}
                    >
                      {/* Medalha / Emblema Ilustrado */}
                      <div className="relative shrink-0">
                        {state.unlocked ? (
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

                        {state.unlocked ? (
                          <span className="text-[11px] font-bold text-[#2563EB] block pt-1">
                            {state.unlockedAt || "Conquistada!"}
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-muted-foreground/70 block pt-1">
                            {state.progressText || item.progressText || "Continue estudando para desbloquear."}
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
      )}
    </div>
  )
}