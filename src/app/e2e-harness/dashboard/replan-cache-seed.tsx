"use client"

import { useState } from "react"

const KEY = "mentor_replan_info_cache"

/**
 * G2.21 — grava (ou limpa) o cache local do cronograma do dia ANTES de o
 * widget "Estudos de Hoje" hidratar: este componente vem antes da grade na
 * árvore, e o inicializador do useState roda na primeira renderização do
 * cliente. Só no harness; nunca na página real.
 */
export function ReplanCacheSeed({ value }: { value: string | null }) {
  useState(() => {
    if (typeof window === "undefined") return null
    try {
      if (value) window.localStorage.setItem(KEY, value)
      else window.localStorage.removeItem(KEY)
    } catch {
      /* armazenamento indisponível: o widget segue sem cache */
    }
    return null
  })
  return null
}
