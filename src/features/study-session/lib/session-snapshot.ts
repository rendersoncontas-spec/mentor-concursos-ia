/**
 * Assinatura do snapshot da sessão que é realmente persistido no IndexedDB.
 *
 * Por que existe: o cronômetro atualiza `activeSeconds`/`pausedSeconds` a cada
 * segundo, então o objeto de estado muda de referência a cada tick. Mas o
 * snapshot gravado NÃO contém esses campos (são recalculados dos timestamps)
 * — ou seja, gravar a cada tick só reescrevia exatamente o mesmo registro.
 * Isso disparava o BroadcastChannel, que era recebido pela própria aba, que
 * reidratava, criava estado novo e gravava de novo: o loop por trás da
 * "piscada" do Play/Pause.
 *
 * A assinatura permite: (1) só gravar quando algo persistido mudou de fato e
 * (2) não reaplicar um snapshot idêntico ao estado atual.
 */

export interface SessionSnapshot {
  isActive: boolean
  isMinimized: boolean
  phase: string
  disciplineName: string
  disciplineId: string | null | undefined
  topicName: string
  studyType: string
  technique: string
  notes: string
  startTime: number | null
  totalPausedMs: number
  lastPauseStartTime: number | null
  plannedSeconds: number
  planItemId: string | null | undefined
  source: string | null
  cycleId?: string | null | undefined
  cycleItemId?: string | null | undefined
}

/** Campos gravados no IndexedDB (tudo menos os segundos que tickam). */
export const PERSISTED_SESSION_FIELDS = [
  "isActive",
  "isMinimized",
  "phase",
  "disciplineName",
  "disciplineId",
  "topicName",
  "studyType",
  "technique",
  "notes",
  "startTime",
  "totalPausedMs",
  "lastPauseStartTime",
  "plannedSeconds",
  "planItemId",
  "source",
  "cycleId",
  "cycleItemId",
] as const satisfies readonly (keyof SessionSnapshot)[]

export function sessionSnapshotSignature(session: SessionSnapshot): string {
  const snapshot: Record<string, unknown> = {}
  // `?? null` normaliza `undefined` (não serializado pelo JSON) e `null`, para
  // que dois snapshots com o mesmo conteúdo sempre gerem a mesma assinatura.
  for (const field of PERSISTED_SESSION_FIELDS) snapshot[field] = session[field] ?? null
  return JSON.stringify(snapshot)
}
