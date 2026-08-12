"use client"

import { useState } from "react"
import { Clock, TrendingUp, BookMarked, CheckCircle, XCircle, Quote, RefreshCw } from "lucide-react"
import { type DashboardData } from "@/domain/dashboard/dashboard.types"

interface KpiCardsProps {
  analytics: DashboardData["analytics"]
  activeTarget: DashboardData["activeTarget"]
}

const MOTIVATIONAL_QUOTES = [
  { quote: "O sucesso não é definitivo, o fracasso não é fatal: o que conta é a coragem de continuar.", author: "Winston Churchill" },
  { quote: "A disciplina é a ponte entre seus objetivos e suas realizações.", author: "Jim Rohn" },
  { quote: "O resultado da sua aprovação é construído em silêncio todos os dias.", author: "Mentor Concursos" },
  { quote: "Não estude até aprender, estude até ser impossível errar.", author: "Provérbio do Concurseiro" },
  { quote: "Tudo parece impossível até que seja feito.", author: "Nelson Mandela" },
  { quote: "O único lugar onde o sucesso vem antes do trabalho é no dicionário.", author: "Albert Einstein" },
  { quote: "Pequena disciplina diária repetida com constância gera grandes vitórias.", author: "Ayrton Senna" },
]

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function KpiCards({ analytics }: KpiCardsProps) {
  const [quoteIndex, setQuoteIndex] = useState(() => {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000)
    return dayOfYear % MOTIVATIONAL_QUOTES.length
  })

  const nextQuote = () => {
    setQuoteIndex((prev) => (prev + 1) % MOTIVATIONAL_QUOTES.length)
  }

  const currentQuote = MOTIVATIONAL_QUOTES[quoteIndex] || MOTIVATIONAL_QUOTES[0] || { quote: "Mantenha a constância.", author: "Mentor Concursos" }

  const totalMinutes = (analytics.goals?.weekly as { achievedMinutes?: number } | undefined)?.achievedMinutes ?? 0
  const stats = analytics.stats as Record<string, number | null | undefined>
  const totalQuestions = stats["totalQuestions"] ?? 0
  const correctQuestions = stats["correctQuestions"] ?? 0
  const wrongQuestions = Math.max(0, totalQuestions - correctQuestions)
  const accuracy = totalQuestions > 0 ? Math.round((correctQuestions / totalQuestions) * 100) : 0
  const editalProgress = stats["editalProgress"] ?? 0

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Card 1: Tempo de Estudo */}
      <div className="rounded-xl border bg-card p-5 border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
              Tempo de Estudo
            </p>
            <p className="text-3xl font-extrabold tracking-tight text-foreground leading-none">
              {formatMinutes(totalMinutes)}
            </p>
          </div>
          <div className="bg-blue-500/10 text-blue-600 dark:text-blue-400 p-2.5 rounded-lg shrink-0">
            <Clock className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
        <div className="mt-3 pt-2 border-t text-xs text-muted-foreground">
          acumulado na semana
        </div>
      </div>

      {/* Card 2: Rendimento Geral */}
      <div className="rounded-xl border bg-card p-5 border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
              Rendimento Geral
            </p>
            <p className="text-3xl font-extrabold tracking-tight text-foreground leading-none">
              {totalQuestions > 0 ? `${accuracy}%` : "—"}
            </p>
          </div>
          <div className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 p-2.5 rounded-lg shrink-0">
            <TrendingUp className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
        <div className="mt-3 pt-2 border-t text-xs text-muted-foreground">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle className="h-3 w-3" aria-hidden="true" />
              {correctQuestions} acertos
            </span>
            <span className="flex items-center gap-1 text-rose-500 dark:text-rose-400 font-medium">
              <XCircle className="h-3 w-3" aria-hidden="true" />
              {wrongQuestions} erros
            </span>
          </div>
        </div>
      </div>

      {/* Card 3: Progresso no Edital */}
      <div className="rounded-xl border bg-card p-5 border-l-4 border-l-indigo-500 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
              Progresso no Edital
            </p>
            <p className="text-3xl font-extrabold tracking-tight text-foreground leading-none">
              {editalProgress}%
            </p>
          </div>
          <div className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 p-2.5 rounded-lg shrink-0">
            <BookMarked className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
        <div className="mt-3 pt-2 border-t text-xs text-muted-foreground">
          <div className="w-full">
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, editalProgress)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Card 4: Mensagem Motivacional Diária do Concurseiro */}
      <div
        onClick={nextQuote}
        className="group relative rounded-xl border bg-card p-5 border-l-4 border-l-amber-500 shadow-sm hover:shadow-md transition-all flex flex-col justify-between cursor-pointer"
        title="Clique para ver outra mensagem de incentivo"
      >
        <div className="flex items-start justify-between gap-2">
          <Quote className="h-4 w-4 text-amber-500 shrink-0" />
          <button
            onClick={(e) => {
              e.stopPropagation()
              nextQuote()
            }}
            className="text-muted-foreground/40 hover:text-amber-600 transition-colors p-0.5 rounded"
            title="Nova frase"
          >
            <RefreshCw className="h-3 w-3 group-hover:rotate-180 transition-transform duration-500" />
          </button>
        </div>

        <div className="my-auto py-1 text-center">
          <p className="text-xs italic font-medium text-foreground leading-relaxed">
            &quot;{currentQuote.quote}&quot;
          </p>
          <p className="text-[11px] font-semibold text-muted-foreground mt-2">
            — {currentQuote.author}
          </p>
        </div>

        <div className="pt-2 border-t text-[10px] text-center text-muted-foreground/60">
          Mensagem Motivacional Diária
        </div>
      </div>
    </div>
  )
}
