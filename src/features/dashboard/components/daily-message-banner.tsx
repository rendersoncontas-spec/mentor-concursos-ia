"use client"

import React, { useMemo } from "react"

import { Quote, Sparkles } from "lucide-react"

export interface DailyMessage {
  id: string
  text: string
  author: string
  category:
    "Disciplina" | "Constância" | "Motivação" | "Foco" | "Resiliência" | "Planejamento" | "Concurso"
}

export const DAILY_MESSAGES: DailyMessage[] = [
  {
    id: "msg-1",
    text: "Estude enquanto eles dormem, trabalhe enquanto eles descansam, viva o que eles sonham.",
    author: "Provérbio",
    category: "Motivação",
  },
  {
    id: "msg-2",
    text: "A disciplina é a ponte entre seus objetivos e suas realizações.",
    author: "Jim Rohn",
    category: "Disciplina",
  },
  {
    id: "msg-3",
    text: "O sucesso é a soma de pequenos esforços repetidos dia após dia.",
    author: "Robert Collier",
    category: "Constância",
  },
  {
    id: "msg-4",
    text: "A persistência é o caminho do êxito. Concurso não se faz para passar, mas até passar.",
    author: "William Douglas",
    category: "Concurso",
  },
  {
    id: "msg-5",
    text: "A chave não é a vontade de vencer... todos têm isso. É a vontade de se preparar para vencer.",
    author: "Bobby Knight",
    category: "Planejamento",
  },
  {
    id: "msg-6",
    text: "Não diminua seus objetivos; aumente seus esforços e seu foco na execução diária.",
    author: "Grant Cardone",
    category: "Foco",
  },
  {
    id: "msg-7",
    text: "A dor da disciplina é temporária, mas a dor do arrependimento é eterna.",
    author: "Jim Rohn",
    category: "Disciplina",
  },
  {
    id: "msg-8",
    text: "Grandes resultados exigem grandes ambições e a humildade de cumprir a meta de cada dia.",
    author: "Heráclito",
    category: "Constância",
  },
  {
    id: "msg-9",
    text: "O guerreiro de sucesso é o homem médio, com foco semelhante ao laser.",
    author: "Bruce Lee",
    category: "Foco",
  },
  {
    id: "msg-10",
    text: "Não espere pelo momento perfeito. Pegue este momento e faça dele a sua aprovação.",
    author: "Autor Desconhecido",
    category: "Resiliência",
  },
  {
    id: "msg-11",
    text: "Cada página lida e cada questão resolvida te colocam mais perto da sua nomeação.",
    author: "NomeIA",
    category: "Concurso",
  },
  {
    id: "msg-12",
    text: "A constância supera o talento quando o talento não é constante.",
    author: "Tim Notke",
    category: "Constância",
  },
]

/**
 * Retorna a mensagem do dia de forma 100% determinística e estável para cada data.
 * O F5 na mesma data nunca altera a frase.
 */
export function getDailyMessage(date = new Date()): DailyMessage {
  const year = date.getFullYear()
  const month = date.getMonth()
  const day = date.getDate()
  // Hash estável baseado no calendário civil
  const daySeed = year * 10000 + (month + 1) * 100 + day
  const index = Math.abs(daySeed) % DAILY_MESSAGES.length
  const found = DAILY_MESSAGES[index]
  if (found) return found

  return {
    id: "msg-default",
    text: "Estude enquanto eles dormem, trabalhe enquanto eles descansam, viva o que eles sonham.",
    author: "Provérbio",
    category: "Motivação",
  }
}

export function DailyMessageBanner({ className }: { className?: string }) {
  const message = useMemo(() => getDailyMessage(), [])

  return (
    <div
      role="region"
      aria-label="Mensagem do Dia"
      className={`relative overflow-hidden rounded-xl border border-[#2563EB]/15 bg-gradient-to-r from-blue-50/80 via-slate-50/60 to-indigo-50/80 dark:from-blue-950/20 dark:via-background dark:to-indigo-950/20 px-3.5 py-2.5 sm:px-4 sm:py-2.5 shadow-2xs transition-all ${className || ""}`}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5 sm:gap-3 relative z-10">
        {/* Cabeçalho da Mensagem */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#2563EB]/10 text-[#2563EB]">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#2563EB]">
              MENSAGEM DO DIA
            </span>
            <span className="text-muted-foreground/40 text-[10px]">|</span>
            <span className="text-[10px] font-medium text-muted-foreground">
              {message.category}
            </span>
          </div>
        </div>

        {/* Texto da Citação */}
        <div className="flex-1 min-w-0 text-left sm:text-center px-1 sm:px-3">
          <p className="text-xs sm:text-[13px] font-medium text-foreground/90 italic truncate leading-snug">
            &ldquo;{message.text}&rdquo;
          </p>
        </div>

        {/* Autor */}
        <div className="shrink-0 text-right self-end sm:self-center">
          <span className="text-[11px] font-bold text-muted-foreground/80 flex items-center gap-1">
            <Quote className="h-3 w-3 text-[#2563EB]/40 inline" aria-hidden="true" />
            <span>— {message.author}</span>
          </span>
        </div>
      </div>
    </div>
  )
}
