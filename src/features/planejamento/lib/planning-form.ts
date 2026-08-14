// Lógica compartilhada do wizard de planejamento (cliente e servidor).
// Nenhum directive "use client"/"use server" aqui — deve ser importável
// por Server Actions e por testes.

export type PlanningMode = "create" | "edit"

export type SessionStyle = "curtas" | "equilibradas" | "longas" | "personalizado"

export const SCALES = [
  { id: "12x36", label: "12x36", desc: "Plantão 12h · Folga 36h" },
  { id: "24x72", label: "24x72", desc: "Plantão 24h · Folga 72h" },
  { id: "24x48", label: "24x48", desc: "Plantão 24h · Folga 48h" },
  { id: "5x1", label: "5x1", desc: "Trabalha 5d · Folga 1d" },
  { id: "6x1", label: "6x1", desc: "Trabalha 6d · Folga 1d" },
  { id: "4x2", label: "4x2", desc: "Trabalha 4d · Folga 2d" },
]

export const PRESETS: Record<
  Exclude<SessionStyle, "personalizado">,
  { label: string; min: number; max: number }
> = {
  curtas: { label: "Sessões curtas", min: 30, max: 60 },
  equilibradas: { label: "Equilibradas", min: 45, max: 90 },
  longas: { label: "Longas", min: 60, max: 120 },
}

export const DURATION_OPTIONS = [30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180]

export const MIN_WEEKLY_HOURS = 5
export const MAX_WEEKLY_HOURS = 50
/** Estimativa de capacidade diária usada para a carga "disponível". */
export const DAILY_STUDY_CAP_HOURS = 3

export const LS_WEEKLY_HOURS = "mentor_user_weekly_hours"
export const LS_SCALE = "mentor_user_work_scale"
export const LS_FIRST_SHIFT = "mentor_user_first_shift_day"
export const LS_STUDY_DAYS = "mentor_user_study_days"
export const LS_MIN_MIN = "mentor_user_session_min_minutes"
export const LS_MAX_MIN = "mentor_user_session_max_minutes"
export const LS_STYLE = "mentor_user_session_style"
export const LS_CUSTOM_SCALE = "mentor_user_custom_scale"

const CUSTOM_SCALE_RE = /^custom_(\d+)x(\d+)$/

export function formatMinutesLabel(min: number): string {
  if (min % 60 === 0) return `${min / 60}h`
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}h${m > 0 ? `${m}` : ""}`
}

/**
 * Fórmula canônica de "dia de plantão" para uma escala (cliente e servidor
 * usam exatamente esta função). `dayNum` é o dia do mês.
 */
export function isShiftDayForScale(dayNum: number, firstShiftDay: number, scale: string): boolean {
  if (scale === "normal") return false
  const diff = dayNum - firstShiftDay
  if (scale === "12x36") return diff >= 0 && diff % 2 === 0
  if (scale === "24x72") return diff >= 0 && diff % 4 === 0
  if (scale === "24x48") return diff >= 0 && diff % 3 === 0
  if (scale === "5x1") return diff >= 0 && diff % 6 === 0
  if (scale === "6x1") return diff >= 0 && diff % 7 === 0
  if (scale === "4x2") return diff >= 0 && (diff % 6 === 0 || (diff - 1) % 6 === 0)
  const custom = CUSTOM_SCALE_RE.exec(scale)
  if (custom) {
    const work = parseInt(custom[1] ?? "", 10)
    const off = parseInt(custom[2] ?? "", 10)
    const cycle = work + off
    if (cycle <= 0) return false
    return diff >= 0 && diff % cycle < work
  }
  return false
}

export function isCustomScale(scale: string): boolean {
  return CUSTOM_SCALE_RE.test(scale)
}

/** Quantidade de dias úteis por semana estimada para uma escala. */
export function getStudyDaysCount(scale: string, studyDays: string[]): number {
  if (scale === "normal") return studyDays.length || 6
  if (scale === "24x72") return 5
  if (scale === "12x36") return 3.5
  if (scale === "5x1") return 5
  if (scale === "6x1") return 6
  if (scale === "4x2") return 5
  const custom = CUSTOM_SCALE_RE.exec(scale)
  if (custom) {
    const work = parseInt(custom[1] ?? "1", 10)
    const off = parseInt(custom[2] ?? "1", 10)
    const cycle = work + off
    if (cycle <= 0) return 6
    return Math.round((7 * work) / cycle)
  }
  return 6
}

/** Dados do formulário unificado (create e edit usam exatamente este modelo). */
export interface PlanningFormValues {
  mode: "ciclo" | "semanal"
  weeklyHours: number
  dayConfigMode: "semana" | "escala"
  scale: string
  customWorkDays: number
  customOffDays: number
  firstShiftDay: number
  /** Dias da semana por extenso (Domingo, Segunda, ...). */
  studyDays: string[]
  minMinutes: number
  maxMinutes: number
  sessionStyle: SessionStyle
  selectedDisciplines: string[]
  importanceMap: Record<string, number>
  knowledgeMap: Record<string, number>
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Normaliza/ajusta valores fora de faixa antes de validar ou persistir. */
export function normalizePlanningForm(values: PlanningFormValues): PlanningFormValues {
  return {
    ...values,
    weeklyHours: clamp(
      Number.isFinite(values.weeklyHours) ? Math.round(values.weeklyHours) : MIN_WEEKLY_HOURS,
      MIN_WEEKLY_HOURS,
      MAX_WEEKLY_HOURS,
    ),
    customWorkDays: clamp(Math.round(values.customWorkDays), 1, 14),
    customOffDays: clamp(Math.round(values.customOffDays), 1, 14),
    firstShiftDay: clamp(Math.round(values.firstShiftDay), 1, 31),
    minMinutes: clamp(Math.round(values.minMinutes / 5) * 5, 30, 180),
    maxMinutes: clamp(Math.round(values.maxMinutes / 5) * 5, 30, 180),
  }
}

export type PlanningFormValidation =
  { ok: true; errors: string[] } | { ok: false; errors: string[] }

/** Mesma validação no cliente (wizard) e no servidor (Server Action). */
export function validatePlanningForm(values: PlanningFormValues): PlanningFormValidation {
  const errors: string[] = []

  if (
    !Number.isFinite(values.weeklyHours) ||
    values.weeklyHours < MIN_WEEKLY_HOURS ||
    values.weeklyHours > MAX_WEEKLY_HOURS
  ) {
    errors.push(`A carga semanal deve estar entre ${MIN_WEEKLY_HOURS}h e ${MAX_WEEKLY_HOURS}h.`)
  }

  if (!values.selectedDisciplines || values.selectedDisciplines.length === 0) {
    errors.push("Selecione ao menos 1 disciplina.")
  }

  if (values.minMinutes > values.maxMinutes) {
    errors.push("A duração mínima não pode ser maior que a duração máxima.")
  }

  if (values.dayConfigMode === "escala" && isCustomScale(values.scale)) {
    const m = CUSTOM_SCALE_RE.exec(values.scale)
    const work = parseInt(m?.[1] ?? "0", 10)
    const off = parseInt(m?.[2] ?? "0", 10)
    if (work < 1 || work > 14 || off < 1 || off > 14) {
      errors.push("A escala personalizada deve ter trabalha/folga entre 1 e 14 dias.")
    }
  }

  return { ok: errors.length === 0, errors }
}

/**
 * Monta o payload enviado à Server Action. Garante que TODAS as disciplinas
 * selecionadas entrem no mapa (com default 2.5 quando o slider não foi tocado).
 */
export function buildPlanningPayload(values: PlanningFormValues): {
  horasSemana: number
  importanceMap: Record<string, number>
  knowledgeMap: Record<string, number>
} {
  const importanceMap: Record<string, number> = {}
  const knowledgeMap: Record<string, number> = {}

  values.selectedDisciplines.forEach((disc) => {
    importanceMap[disc] = values.importanceMap[disc] ?? 2.5
    knowledgeMap[disc] = values.knowledgeMap[disc] ?? 2.5
  })

  return {
    horasSemana: values.weeklyHours,
    importanceMap,
    knowledgeMap,
  }
}

/** Reason persistido em `study_plans.generated_reason`. */
export function planningReason(mode: PlanningMode): string {
  return mode === "edit" ? "replan" : "manual"
}
