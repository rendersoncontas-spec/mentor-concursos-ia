import { sessionStore } from "./session-store"
import type { ActiveSessionRecord } from "./types"

/**
 * Migração do snapshot de cronômetro (item 5 do pedido): na primeira
 * execução da nova versão, se existir `mentor_active_study_session` no
 * localStorage, lê -> valida -> copia para IndexedDB -> confirma a
 * gravação -> só então remove o valor antigo. Um snapshot inválido é
 * descartado sem derrubar o app (registra aviso e limpa só aquele item).
 */

const LEGACY_STORAGE_KEY = "mentor_active_study_session"

type MinimalStorage = Pick<Storage, "getItem" | "removeItem">

function defaultStorage(): MinimalStorage | null {
  if (typeof localStorage === "undefined") return null
  return localStorage
}

const VALID_PHASES = new Set(["IDLE", "STUDYING", "PAUSED", "SHORT_BREAK", "LONG_BREAK"])

export function isValidLegacySessionShape(
  candidate: unknown,
): candidate is Omit<ActiveSessionRecord, "userId"> {
  if (typeof candidate !== "object" || candidate === null) return false
  const c = candidate as Record<string, unknown>
  if (typeof c["isActive"] !== "boolean" || !c["isActive"]) return false
  if (typeof c["startTime"] !== "number" || c["startTime"] <= 0) return false
  if (typeof c["phase"] !== "string" || !VALID_PHASES.has(c["phase"])) return false
  if (typeof c["disciplineName"] !== "string") return false
  if (typeof c["totalPausedMs"] !== "number") return false
  return true
}

export interface MigrateLegacySessionResult {
  migrated: boolean
  reason?: "not_found" | "invalid" | "no_storage" | "write_failed"
}

export async function migrateLegacyActiveSession(
  userId: string,
  storage: MinimalStorage | null = defaultStorage(),
): Promise<MigrateLegacySessionResult> {
  if (!storage) return { migrated: false, reason: "no_storage" }

  let raw: string | null
  try {
    raw = storage.getItem(LEGACY_STORAGE_KEY)
  } catch {
    return { migrated: false, reason: "no_storage" }
  }
  if (!raw) return { migrated: false, reason: "not_found" }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    console.warn(
      "[OFFLINE_MIGRATION] snapshot de cronômetro corrompido (JSON inválido) no localStorage — descartando apenas este item.",
    )
    safeRemove(storage)
    return { migrated: false, reason: "invalid" }
  }

  if (!isValidLegacySessionShape(parsed)) {
    console.warn(
      "[OFFLINE_MIGRATION] snapshot de cronômetro com formato inesperado — descartando apenas este item.",
    )
    safeRemove(storage)
    return { migrated: false, reason: "invalid" }
  }

  await sessionStore.set(userId, parsed)
  const confirmed = await sessionStore.get(userId)
  if (!confirmed) {
    // Não é possível confirmar a gravação: por segurança, NÃO removemos o
    // valor antigo (evita perder a sessão) e tentamos de novo na próxima
    // abertura do app.
    return { migrated: false, reason: "write_failed" }
  }

  safeRemove(storage)
  return { migrated: true }
}

function safeRemove(storage: MinimalStorage): void {
  try {
    storage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // best-effort — se nem isso for possível, o pior caso é tentar migrar de novo na próxima vez.
  }
}
