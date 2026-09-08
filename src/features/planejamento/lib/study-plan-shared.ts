// ============================================================================
// CAMADA ÚNICA DE DADOS DO PLANEJAMENTO — NOMEIA
// ----------------------------------------------------------------------------
// Fonte única de verdade para:
// 1. Calendário Mensal (StudyCalendarView)
// 2. Agenda Semanal (WeeklyPlanningView)
// 3. Visão Diária (DailyPlanningView)
//
// Garante que Calendário Mensal === Agenda Semanal === Visão Diária para
// qualquer data especificada.
// ============================================================================

import type { ReplanInfoPayload } from "@/application/study-plan/replan/adaptive-replan.service"
import {
  isScheduleMode,
  isShiftDayForDate,
  type ScheduleMode,
} from "@/features/planejamento/lib/planning-form"

export const WEEKDAY_KEYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"]

export interface StudyPlanDayBlock {
  id: string
  itemId?: string | null
  disciplineId: string
  disciplineName: string
  durationMinutes: number
  studiedMinutes: number
  color: string
  completed: boolean
  origin?: string
  status?: string
}

export interface StudyPlanDayInfo {
  dateStr: string // "YYYY-MM-DD"
  dayOfWeekIndex: number // 0 (Dom) a 6 (Sáb)
  isDutyShift: boolean // plantão
  isStudyDay: boolean // dia configurado para estudo
  plannedMinutes: number
  studiedMinutes: number
  blocks: StudyPlanDayBlock[]
}

export interface SharedPlanConfig {
  scheduleMode: ScheduleMode
  firstShiftDay: number
  anchorShiftDate?: string
  studyDays: string[]
  customShiftDays?: Record<string, "PLANTAO" | "FOLGA_ESTUDO" | "FOLGA_TOTAL">
}

export interface BaseCycleBlock {
  id: string
  disciplineId: string
  disciplineName: string
  durationMinutes: number
  color?: string
}

/**
 * Retorna as preferências salvas de escala e dias de estudo no navegador.
 */
export function getSavedScaleConfig(): SharedPlanConfig {
  if (typeof window === "undefined") {
    return {
      scheduleMode: "24x72",
      firstShiftDay: 2,
      anchorShiftDate: "",
      studyDays: ["seg", "ter", "qua", "qui", "sex", "sab"],
      customShiftDays: {},
    }
  }

  const savedScale = localStorage.getItem("mentor_user_work_scale")
  const scheduleMode: ScheduleMode =
    savedScale && isScheduleMode(savedScale) ? savedScale : "24x72"

  const savedFirstDay = localStorage.getItem("mentor_user_first_shift_day")
  const firstShiftDay = savedFirstDay ? parseInt(savedFirstDay, 10) : 2

  const anchorShiftDate =
    localStorage.getItem("mentor_user_shift_anchor_date") ||
    localStorage.getItem("mentor_shift_anchor_date") ||
    ""

  const savedStudyDays = localStorage.getItem("mentor_user_study_days")
  const studyDays = savedStudyDays
    ? (JSON.parse(savedStudyDays) as string[])
    : ["seg", "ter", "qua", "qui", "sex", "sab"]

  let customShiftDays: Record<string, "PLANTAO" | "FOLGA_ESTUDO" | "FOLGA_TOTAL"> = {}
  try {
    const savedCustom = localStorage.getItem("mentor_custom_shift_days")
    if (savedCustom) customShiftDays = JSON.parse(savedCustom)
  } catch {}

  return {
    scheduleMode,
    firstShiftDay,
    anchorShiftDate,
    studyDays,
    customShiftDays,
  }
}

/**
 * Determina se uma data específica é plantão.
 */
export function isDutyShiftDate(dateStr: string, config: SharedPlanConfig): boolean {
  if (config.customShiftDays?.[dateStr] === "PLANTAO") return true
  if (config.customShiftDays?.[dateStr] === "FOLGA_ESTUDO") return false

  if (config.scheduleMode !== "normal") {
    const [y, m] = dateStr.split("-").map(Number)
    const padM = String(m).padStart(2, "0")
    const effectiveAnchor =
      config.anchorShiftDate ||
      `${y}-${padM}-${String(config.firstShiftDay).padStart(2, "0")}`

    return isShiftDayForDate(dateStr, effectiveAnchor, config.scheduleMode)
  }

  return false
}

/**
 * FUNÇÃO CENTRAL: Retorna os dados completos do planejamento para uma data.
 * Consumida igualmente por Calendário Mensal, Agenda Semanal e Visão Diária.
 */
export function getStudyPlanDay(
  dateStr: string, // "YYYY-MM-DD"
  replanInfo: ReplanInfoPayload | null | undefined,
  config: SharedPlanConfig,
  cycleBlocks: BaseCycleBlock[] = [],
  historyForDay: Array<{ disciplineId: string; minutes: number }> = [],
): StudyPlanDayInfo {
  const [year, month, day] = dateStr.split("-").map(Number)
  const d = new Date(year ?? 2026, (month ?? 1) - 1, day ?? 1)
  const dayOfWeekIndex = d.getDay() // 0 = Dom, 6 = Sáb
  const weekdayKey = WEEKDAY_KEYS[dayOfWeekIndex] ?? "dom"

  const isDuty = isDutyShiftDate(dateStr, config)

  // 1. PLANTÃO: 0 blocos, 0 minutos planejados
  if (isDuty && config.scheduleMode !== "normal") {
    return {
      dateStr,
      dayOfWeekIndex,
      isDutyShift: true,
      isStudyDay: false,
      plannedMinutes: 0,
      studiedMinutes: historyForDay.reduce((sum, h) => sum + h.minutes, 0),
      blocks: [],
    }
  }

  // 2. DIA FORA DA ESCALA/DIAS DE ESTUDO DO USUÁRIO
  const isStudyDay = config.studyDays.includes(weekdayKey)
  if (!isStudyDay && config.scheduleMode === "normal") {
    return {
      dateStr,
      dayOfWeekIndex,
      isDutyShift: false,
      isStudyDay: false,
      plannedMinutes: 0,
      studiedMinutes: historyForDay.reduce((sum, h) => sum + h.minutes, 0),
      blocks: [],
    }
  }

  // Helper de cores por disciplina
  const colorByDiscipline = new Map<string, string>()
  for (const b of cycleBlocks) {
    if (!colorByDiscipline.has(b.disciplineId)) {
      colorByDiscipline.set(b.disciplineId, b.color || "#2563EB")
    }
  }

  // 3. BLOCOS REAIS PERSISTIDOS / SINCRONIZADOS COM O SERVIDOR
  const serverBlocks = replanInfo?.dailyBlocks?.[dateStr]
  if (serverBlocks && serverBlocks.length > 0) {
    const blocks: StudyPlanDayBlock[] = serverBlocks.map((b) => {
      const studiedMins = historyForDay
        .filter((h) => h.disciplineId === b.disciplineId)
        .reduce((sum, h) => sum + h.minutes, 0)
      const isCompleted = b.manuallyClosed || studiedMins >= b.durationMinutes

      return {
        id: b.id,
        itemId: b.itemId,
        disciplineId: b.disciplineId,
        disciplineName: b.disciplineName,
        durationMinutes: b.durationMinutes,
        studiedMinutes: studiedMins,
        color: colorByDiscipline.get(b.disciplineId) || "#2563EB",
        completed: isCompleted,
        origin: b.origin,
        status: b.status,
      }
    })

    return {
      dateStr,
      dayOfWeekIndex,
      isDutyShift: false,
      isStudyDay: true,
      plannedMinutes: blocks.reduce((sum, b) => sum + b.durationMinutes, 0),
      studiedMinutes: historyForDay.reduce((sum, h) => sum + h.minutes, 0),
      blocks,
    }
  }

  // 4. FALLBACK: se ainda não houver blocos persistidos no servidor
  if (cycleBlocks.length === 0 && !replanInfo?.hasPlan) {
    return {
      dateStr,
      dayOfWeekIndex,
      isDutyShift: false,
      isStudyDay: true,
      plannedMinutes: 0,
      studiedMinutes: historyForDay.reduce((sum, h) => sum + h.minutes, 0),
      blocks: [],
    }
  }

  const activeDaysCount = Math.max(1, config.studyDays.length)
  const totalCycleMinutes = cycleBlocks.reduce((acc, b) => acc + b.durationMinutes, 0)
  const targetDailyMinutes = Math.max(30, Math.round(totalCycleMinutes / activeDaysCount))

  const blocksPerDay = Math.max(1, Math.round(cycleBlocks.length / activeDaysCount))
  const startIndex = (dayOfWeekIndex * blocksPerDay) % cycleBlocks.length

  const selectedBlocks: StudyPlanDayBlock[] = []
  let accumulatedMins = 0
  let idx = 0

  while (accumulatedMins < targetDailyMinutes && idx < cycleBlocks.length) {
    const b = cycleBlocks[(startIndex + idx) % cycleBlocks.length]
    if (b) {
      const studiedMins = historyForDay
        .filter((h) => h.disciplineId === b.disciplineId)
        .reduce((sum, h) => sum + h.minutes, 0)

      selectedBlocks.push({
        id: `fallback-${b.id}-${dateStr}-${idx}`,
        itemId: b.id,
        disciplineId: b.disciplineId,
        disciplineName: b.disciplineName,
        durationMinutes: b.durationMinutes,
        studiedMinutes: studiedMins,
        color: b.color || colorByDiscipline.get(b.disciplineId) || "#2563EB",
        completed: studiedMins >= b.durationMinutes && studiedMins > 0,
      })
      accumulatedMins += b.durationMinutes
    }
    idx++
  }

  return {
    dateStr,
    dayOfWeekIndex,
    isDutyShift: false,
    isStudyDay: true,
    plannedMinutes: selectedBlocks.reduce((sum, b) => sum + b.durationMinutes, 0),
    studiedMinutes: historyForDay.reduce((sum, h) => sum + h.minutes, 0),
    blocks: selectedBlocks,
  }
}
