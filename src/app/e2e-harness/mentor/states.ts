// G2.20 — estados do harness do Mentor (módulo comum a servidor e cliente).
export const MENTOR_HARNESS_STATES = ["valid", "low", "empty", "disabled", "unavailable", "rejected", "timeout", "rate", "error"] as const
export type MentorHarnessState = (typeof MENTOR_HARNESS_STATES)[number]
