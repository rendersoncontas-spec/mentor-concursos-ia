"use client"

import React from "react"

export interface DailyMessage {
  id: string
  text: string
  author: string
  category:
    | "Disciplina"
    | "Constância"
    | "Motivação"
    | "Foco"
    | "Resiliência"
    | "Planejamento"
    | "Concurso"
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
