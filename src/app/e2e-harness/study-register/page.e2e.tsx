import type { Metadata } from "next"

import { StudyRegisterHarness } from "./study-register-harness"

// G2.21 — harness E2E da Central de estudos (StudyRegisterModal REAL), para
// rótulos, teclado e foco do formulário de registro de estudo. Só existe com
// NOMEIA_E2E_HARNESS=1. Sem sessão: a lista de disciplinas vem vazia/erro e o
// salvamento não é exercitado aqui (é coberto pelos testes unitários/offline).
export const metadata: Metadata = { title: "E2E · registro de estudo", robots: { index: false, follow: false } }

export default function StudyRegisterHarnessPage() {
  return <StudyRegisterHarness />
}
