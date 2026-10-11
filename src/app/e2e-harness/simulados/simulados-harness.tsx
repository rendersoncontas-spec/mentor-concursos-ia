"use client"

import { useState } from "react"

import { SimuladosActionsProvider } from "@/features/simulados/simulados-actions"
import { SimuladosView } from "@/features/simulados/components/simulados-view"
import { todayKeyInSaoPaulo } from "@/lib/sao-paulo"
import { createFakeSimuladosBackend, type FakeSimuladosOptions } from "@/lib/testing/fake-simulados-backend"

import type { SimuladosHarnessState } from "./states"

type Counters = Record<string, number>

function optionsFor(state: SimuladosHarnessState): Omit<FakeSimuladosOptions, "todayKey" | "onCall"> {
  const seed = state === "empty" ? "empty" : "data"
  switch (state) {
    case "load-error":
      return { seed, failures: { load: "error" }, delayMs: 150 }
    case "load-reject":
      return { seed, failures: { load: "reject" }, delayMs: 150 }
    case "save-error":
      return { seed, failures: { save: "error" }, delayMs: 150, saveDelayMs: 400 }
    case "save-reject":
      return { seed, failures: { save: "reject" }, delayMs: 150, saveDelayMs: 400 }
    case "save-slow":
      return { seed, delayMs: 150, saveDelayMs: 1500 }
    case "delete-error":
      return { seed, failures: { delete: "error" }, delayMs: 150 }
    case "perf-error":
      return { seed, failures: { performance: "error" }, delayMs: 150 }
    default:
      return { seed, delayMs: 150 }
  }
}

/**
 * G2.21 — /simulados com o banco em memória. Os contadores em
 * `window.__simuladosCalls` deixam o teste provar, por exemplo, que um duplo
 * clique em "Salvar" não gera duas gravações.
 */
export function SimuladosHarness({ state }: { state: SimuladosHarnessState }) {
  const [backend] = useState(() =>
    createFakeSimuladosBackend({
      ...optionsFor(state),
      todayKey: todayKeyInSaoPaulo(),
      onCall: (action) => {
        const w = window as unknown as { __simuladosCalls?: Counters }
        const calls = (w.__simuladosCalls ??= {})
        calls[action] = (calls[action] ?? 0) + 1
      },
    }),
  )
  return (
    <SimuladosActionsProvider actions={backend.actions}>
      <div className="flex flex-col min-h-full">
        <SimuladosView />
      </div>
    </SimuladosActionsProvider>
  )
}
