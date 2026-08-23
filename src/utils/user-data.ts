const PERSONAL_PREFIXES = ["mentor_user_avatar_", "mentor_user_reminders_", "mentor_edital_checked_topics_"]

const PERSONAL_KEYS = [
  "mentor_user_avatar",
  "mentor_user_reminders",
  "mentor_sticky_note",
  "mentor_edital_requests",
  "mentor_user_work_scale",
  "mentor_user_first_shift_day",
  "mentor_user_study_days",
  "mentor_active_study_session",
  "mentor:study_session_state",
  "mentor-study-floating-timer-position-v2",
  "mentor-floating-timer-enabled",
  "mentor_replan_info_cache",
  "mentor_closed_block_keys",
  "mentor_dashboard_layout",
  "mentor_quick_notes_list_cache",
  "mentor_quick_notes_active_id",
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