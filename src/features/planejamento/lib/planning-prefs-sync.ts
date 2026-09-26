// ============================================================================
// P1.5 — sincronização cliente↔servidor das preferências de Planejamento.
// ----------------------------------------------------------------------------
// Banco é a fonte oficial; localStorage é legado/compatibilidade + cache de
// primeira pintura. Fluxo (nunca quebra a UI; erro = mantém o local):
//   1. lê o legado local e envia à action;
//   2. source "database" → espelha o banco no local (down-sync) + evento;
//   3. source "migrated" → grava migrateUp no banco (lazy migration, 1 vez);
//   4. source "suggested" → não toca em nada (defaults legítimos).
// ============================================================================

"use client"

import {
  getPlanningPreferencesAction,
  savePlanningPreferencesAction,
} from "@/application/study-plan/planning-preferences.action"
import type { ResolvedPlanningPrefs } from "@/application/study-plan/planning-preferences"
import {
  LS_FIRST_SHIFT,
  LS_SCALE,
  LS_SHIFT_ANCHOR_DATE,
  LS_STUDY_DAYS,
} from "@/features/planejamento/lib/planning-form"

export function readLocalPlanningPrefs(): {
  workScale: string | null
  firstShiftDay: string | null
  shiftAnchorDate: string | null
  studyDays: string | null
  customScale: string | null
} {
  if (typeof window === "undefined") {
    return { workScale: null, firstShiftDay: null, shiftAnchorDate: null, studyDays: null, customScale: null }
  }
  return {
    workScale: localStorage.getItem(LS_SCALE),
    firstShiftDay: localStorage.getItem(LS_FIRST_SHIFT),
    shiftAnchorDate: localStorage.getItem(LS_SHIFT_ANCHOR_DATE),
    studyDays: localStorage.getItem(LS_STUDY_DAYS),
    customScale: localStorage.getItem("mentor_user_custom_scale"),
  }
}

/** Espelha a fonte oficial no cache local (compatibilidade das views). */
export function mirrorPrefsToLocal(prefs: ResolvedPlanningPrefs): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(LS_SCALE, prefs.workScale)
    localStorage.setItem(LS_FIRST_SHIFT, String(prefs.firstShiftDay))
    if (prefs.shiftAnchorDate) localStorage.setItem(LS_SHIFT_ANCHOR_DATE, prefs.shiftAnchorDate)
    localStorage.setItem(LS_STUDY_DAYS, JSON.stringify(prefs.studyDays))
    window.dispatchEvent(new Event("mentor_scale_updated"))
  } catch {
    /* localStorage indisponível: segue sem o cache local */
  }
}

let syncInFlight: Promise<ResolvedPlanningPrefs | null> | null = null

/** P1.5 — sincroniza uma vez por sessão; chamadas simultâneas compartilham. */
export function syncPlanningPreferencesFromServer(): Promise<ResolvedPlanningPrefs | null> {
  if (syncInFlight) return syncInFlight
  syncInFlight = (async () => {
    try {
      const res = await getPlanningPreferencesAction(readLocalPlanningPrefs())
      if (!res.data) return null
      if (res.data.source === "migrated" && res.data.migrateUp) {
        // Lazy migration: sobe o legado válido uma única vez; banco passa a vencer.
        await savePlanningPreferencesAction({
          workScale: res.data.migrateUp.workScale,
          firstShiftDay: res.data.migrateUp.firstShiftDay,
          shiftAnchorDate: res.data.migrateUp.shiftAnchorDate,
          studyDays: res.data.migrateUp.studyDays,
        }).catch(() => ({ ok: false as const, error: "sync" }))
      }
      if (res.data.source !== "suggested") mirrorPrefsToLocal(res.data)
      return res.data
    } catch {
      return null
    } finally {
      syncInFlight = null
    }
  })()
  return syncInFlight
}
