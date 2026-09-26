const PERSONAL_PREFIXES = ["mentor_user_avatar_", "mentor_user_reminders_", "mentor_edital_checked_topics_"]

/**
 * P1.4 — lista canônica das chaves pessoais de Planejamento (auditoria item 4).
 * Todas: preferência/configuração de UM usuário; nenhuma determina identidade
 * (identidade vem do servidor/auth). Limpeza obrigatória no logout para que o
 * próximo usuário do mesmo navegador nunca herde configuração alheia.
 * Inclui a chave legada `mentor_shift_anchor_date` (ainda lida como fallback
 * em study-plan-shared.ts) e `mentor_custom_shift_days` (overrides por data).
 */
export const PERSONAL_PLANNING_STORAGE_KEYS = [
  "mentor_user_work_scale",
  "mentor_user_first_shift_day",
  "mentor_user_shift_anchor_date",
  "mentor_shift_anchor_date",
  "mentor_user_study_days",
  "mentor_user_weekly_hours",
  "mentor_user_session_min_minutes",
  "mentor_user_session_max_minutes",
  "mentor_user_session_style",
  "mentor_user_custom_scale",
  "mentor_user_first_day_of_week",
  "mentor_custom_shift_days",
]

const PERSONAL_KEYS = [
  "mentor_user_avatar",
  "mentor_user_reminders",
  "mentor_sticky_note",
  "mentor_edital_requests",
  "mentor_active_study_session",
  "mentor:study_session_state",
  "mentor-study-floating-timer-position-v2",
  "mentor-floating-timer-enabled",
  "mentor_replan_info_cache",
  "mentor_closed_block_keys",
  "mentor_dashboard_layout",
  "mentor_quick_notes_list_cache",
  "mentor_quick_notes_active_id",
  ...PERSONAL_PLANNING_STORAGE_KEYS,
]

export function clearUserLocalData() {
  if (typeof window === "undefined") return
  const keys = Object.keys(localStorage)
  keys.forEach((key) => {
    const matchesPrefix = PERSONAL_PREFIXES.some((prefix) => key.startsWith(prefix))
    if (matchesPrefix || PERSONAL_KEYS.includes(key)) {
      localStorage.removeItem(key)
    }
  })
}