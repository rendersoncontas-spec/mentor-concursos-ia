// G2.21 — estados do harness do Dashboard (módulo comum a servidor e cliente).
export const DASHBOARD_HARNESS_STATES = ["data", "empty", "issues", "loading"] as const
export type DashboardHarnessState = (typeof DASHBOARD_HARNESS_STATES)[number]
