// ============================================================================
// P1.5 — PREFERÊNCIAS DE PLANEJAMENTO: validação central + resolução de fonte.
// ----------------------------------------------------------------------------
// Fonte oficial: banco (profiles.*). localStorage é legado/compatibilidade:
//   1. banco possui valor válido → usa banco;
//   2. banco ausente + local válido → migra para o banco (lazy migration);
//   3. banco ausente + local ausente/inválido → default/sugestão legítima.
// Uma vez salvo no banco, o banco vence para sempre (nunca reescreve com
// local antigo). Módulo puro (zero I/O): testável sem Supabase.
// ============================================================================

import {
  CUSTOM_SCALE_RE,
  isScheduleMode,
  type ScheduleMode,
} from "@/features/planejamento/lib/planning-form"

export const PLANNING_WEEKDAY_KEYS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"] as const
export type PlanningWeekday = (typeof PLANNING_WEEKDAY_KEYS)[number]

export type PlanningPreferenceSource = "database" | "migrated" | "suggested"

/** Espelho das colunas profiles.* (tudo nullable: ausência ≠ erro). */
export interface PlanningDbPrefs {
  workScale: string | null
  firstShiftDay: number | null
  shiftAnchorDate: string | null
  studyDays: string[] | null
}

/** Valores lidos do localStorage legado (strings brutas, podem ser inválidas). */
export interface PlanningLocalPrefs {
  workScale: string | null
  firstShiftDay: string | null
  shiftAnchorDate: string | null
  studyDays: string | null // JSON bruto
  customScale: string | null // JSON bruto {work, off} — redundante, só legado
}

export interface ResolvedPlanningPrefs {
  workScale: ScheduleMode
  firstShiftDay: number
  shiftAnchorDate: string
  studyDays: PlanningWeekday[]
  source: PlanningPreferenceSource
  /** Quando source === "migrated": valores a gravar no banco (lazy migration). */
  migrateUp: {
    workScale: string
    firstShiftDay: number
    shiftAnchorDate: string | null
    studyDays: string[]
  } | null
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function parseWorkScale(raw: unknown): ScheduleMode | null {
  if (typeof raw !== "string" || !isScheduleMode(raw)) return null
  if (raw !== "normal") {
    const custom = CUSTOM_SCALE_RE.exec(raw)
    if (custom) {
      const work = parseInt(custom[1] ?? "0", 10)
      const off = parseInt(custom[2] ?? "0", 10)
      if (!Number.isFinite(work) || !Number.isFinite(off) || work < 1 || work > 14 || off < 1 || off > 14) {
        return null
      }
    }
  }
  return raw
}

export function parseFirstShiftDay(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN
  if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > 31) return null
  return n as number
}

export function parseShiftAnchorDate(raw: unknown): string | null {
  if (typeof raw !== "string" || !DATE_RE.test(raw)) return null
  const d = new Date(`${raw}T12:00:00Z`)
  if (isNaN(d.getTime())) return null
  return raw
}

export function parseStudyDays(raw: unknown): PlanningWeekday[] | null {
  let arr: unknown = raw
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!Array.isArray(arr) || arr.length === 0) return null
  const out: PlanningWeekday[] = []
  for (const item of arr) {
    if (typeof item !== "string") return null
    const key = item.toLowerCase().slice(0, 3)
    if (!(PLANNING_WEEKDAY_KEYS as readonly string[]).includes(key)) return null
    if (!out.includes(key as PlanningWeekday)) out.push(key as PlanningWeekday)
  }
  return out.length > 0 ? out : null
}

/** Defaults legítimos de produto (nunca apresentados como escolha do usuário). */
export const PLANNING_DEFAULTS = {
  workScale: "normal" as ScheduleMode,
  firstShiftDay: 2,
  shiftAnchorDate: "",
  studyDays: ["seg", "ter", "qua", "qui", "sex", "sab"] as PlanningWeekday[],
}

/**
 * Resolve a fonte de verdade: banco > localStorage válido (migra) > default.
 * `db` nulo = linha de perfil lida sem essas colunas/valores (ausência real).
 */
export function resolvePlanningPreferences(
  db: PlanningDbPrefs | null,
  local: PlanningLocalPrefs,
): ResolvedPlanningPrefs {
  const dbScale = parseWorkScale(db?.workScale)
  const dbFirst = parseFirstShiftDay(db?.firstShiftDay)
  const dbAnchor = parseShiftAnchorDate(db?.shiftAnchorDate)
  const dbDays = parseStudyDays(db?.studyDays)

  if (dbScale || dbFirst !== null || dbAnchor || dbDays) {
    // Banco vence campo a campo; campo ausente no banco usa default (não o local,
    // para nunca ressuscitar valor antigo depois que o usuário já migrou parcial).
    return {
      workScale: dbScale ?? PLANNING_DEFAULTS.workScale,
      firstShiftDay: dbFirst ?? PLANNING_DEFAULTS.firstShiftDay,
      shiftAnchorDate: dbAnchor ?? PLANNING_DEFAULTS.shiftAnchorDate,
      studyDays: dbDays ?? PLANNING_DEFAULTS.studyDays,
      source: "database",
      migrateUp: null,
    }
  }

  const localScale = parseWorkScale(local.workScale)
  const localFirst = parseFirstShiftDay(local.firstShiftDay)
  const localAnchor = parseShiftAnchorDate(local.shiftAnchorDate)
  const localDays = parseStudyDays(local.studyDays)

  if (localScale || localFirst !== null || localAnchor || localDays) {
    const workScale = localScale ?? PLANNING_DEFAULTS.workScale
    const firstShiftDay = localFirst ?? PLANNING_DEFAULTS.firstShiftDay
    const shiftAnchorDate = localAnchor ?? PLANNING_DEFAULTS.shiftAnchorDate
    const studyDays = localDays ?? PLANNING_DEFAULTS.studyDays
    return {
      workScale,
      firstShiftDay,
      shiftAnchorDate,
      studyDays,
      source: "migrated",
      migrateUp: {
        workScale,
        firstShiftDay,
        shiftAnchorDate: localAnchor,
        studyDays: [...studyDays],
      },
    }
  }

  return { ...PLANNING_DEFAULTS, studyDays: [...PLANNING_DEFAULTS.studyDays], source: "suggested", migrateUp: null }
}
