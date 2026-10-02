import { clearUserLocalData } from "@/utils/user-data"

import { getClientUserId } from "./current-user"
import { sessionStore } from "./session-store"
import { ALL_SNAPSHOT_STORES, snapshotStore } from "./snapshot-store"

/**
 * G1.7 (G-31) — guarda de troca de usuário no mesmo navegador.
 *
 * O logout canônico já purga o estado do usuário que sai, mas existem
 * caminhos que trocam de identidade SEM passar por ele: login OAuth
 * (navegação full-page, sem limpeza client-side), login após expiração de
 * sessão, cookie removido manualmente. Nesses casos o próximo usuário
 * herdava localStorage/IndexedDB do anterior — e a migração preguiçosa de
 * preferências (`syncPlanningPreferencesFromServer`) chegava a GRAVAR as
 * preferências de A no perfil de B (source "migrated").
 *
 * Este guarda roda no boot (StudyProvider, global) e no login por senha:
 * detecta `lastUserId !== currentUserId` e purga o estado do ANTERIOR
 * (localStorage pessoal + cache em memória + sessão/snapshots offline).
 * A `sync_queue` NUNCA é tocada (decisão B: operações pendentes de A só
 * voltam a sincronizar quando A logar de novo; o worker filtra por dono).
 *
 * Quem chama decide o que fazer com `switched=true` — o recomendado é
 * `window.location.reload()`, que mata timers/contexto ainda vivos no JS.
 */

const LAST_USER_KEY = "mentor_last_user_id"

export function detectUserSwitch(
  lastUserId: string | null,
  currentUserId: string | null,
): boolean {
  return lastUserId !== null && currentUserId !== null && lastUserId !== currentUserId
}

function readLastUserId(): string | null {
  try {
    return window.localStorage.getItem(LAST_USER_KEY)
  } catch {
    return null
  }
}

function writeLastUserId(userId: string): void {
  try {
    window.localStorage.setItem(LAST_USER_KEY, userId)
  } catch {
    /* armazenamento indisponível: segue sem o carimbo */
  }
}

async function purgePreviousUserData(previousUserId: string): Promise<void> {
  // localStorage pessoal + cache de Server Actions em memória.
  clearUserLocalData()
  // Sessão ativa + snapshots do anterior (reconstruíveis via servidor).
  try {
    await sessionStore.clear(previousUserId)
    await Promise.all(ALL_SNAPSHOT_STORES.map((store) => snapshotStore.clear(store, previousUserId)))
  } catch {
    /* best-effort: nunca bloquear login/boot por causa do IndexedDB */
  }
}

export async function getGuardUserId(): Promise<string | null> {
  try {
    return await getClientUserId()
  } catch {
    return null
  }
}

/**
 * Verifica troca de identidade e purga o anterior. Sem efeito quando não
 * há sessão (o fluxo de logout é dono do cleanup) ou quando é o primeiro login neste
 * navegador (só carimba). Nunca toca na sync_queue.
 */
export async function purgeOnUserSwitch(
  currentUserId: string | null,
): Promise<{ switched: boolean }> {
  if (typeof window === "undefined") return { switched: false }
  if (!currentUserId) return { switched: false }
  const last = readLastUserId()
  if (!detectUserSwitch(last, currentUserId)) {
    writeLastUserId(currentUserId)
    return { switched: false }
  }
  await purgePreviousUserData(last as string)
  writeLastUserId(currentUserId)
  return { switched: true }
}
