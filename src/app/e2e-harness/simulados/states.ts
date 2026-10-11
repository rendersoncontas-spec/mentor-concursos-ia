// G2.21 — estados do harness de Simulados (módulo comum a servidor e cliente).
export const SIMULADOS_HARNESS_STATES = [
  "data",
  "empty",
  "load-error",
  "load-reject",
  "save-error",
  "save-reject",
  "save-slow",
  "delete-error",
  "perf-error",
] as const
export type SimuladosHarnessState = (typeof SIMULADOS_HARNESS_STATES)[number]
