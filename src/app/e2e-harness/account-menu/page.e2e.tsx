import type { Metadata } from "next"

import { AccountMenuHarness } from "./account-menu-harness"

// G2.20 — harness E2E do cabeçalho/menu da conta. Só existe com NOMEIA_E2E_HARNESS=1.
export const metadata: Metadata = { title: "E2E · menu da conta", robots: { index: false, follow: false } }

export default function AccountMenuHarnessPage() {
  return <AccountMenuHarness />
}
