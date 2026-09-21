// ─────────────────────────────────────────────────────────────────────────────
// BUG REAL (Fase 19) — o botão "Adicionar Estudo" do Dashboard não abria
// nenhum modal. Causa raiz, confirmada lendo o código-fonte real (sem
// suposição): `dashboard-layout.tsx` declarava e atualizava o estado local
// `isRegisterModalOpen` (via `setIsRegisterModalOpen(true)` no onClick), mas
// nunca importava nem renderizava `<StudyRegisterModal>` — o estado ficava
// "órfão", sem nenhum componente escutando-o. O botão também disparava
// `window.dispatchEvent(new CustomEvent("study-center-opened"))`, um evento
// que só é escutado por `study-provider.tsx` para setar `isCentralOpen =
// true` no contexto global — um valor que nada usa para de fato renderizar
// um modal. Isso travava `isCentralOpen` em `true` pelo resto da sessão,
// fazendo o `FloatingActionButton` (balão flutuante "Registrar estudo")
// também parar de responder, já que seu `handleOpenCentral` faz
// `if (isCentralOpen) return`.
//
// Correção: reaproveitar exatamente o mesmo componente `StudyRegisterModal`
// já usado por Histórico (history-view.tsx), Disciplina (discipline-detail-
// view.tsx), Edital (edital-accordion.tsx) e Planejamento (planning-view.tsx)
// — nenhum modal novo foi criado. O botão agora só chama
// `setIsRegisterModalOpen(true)`, sem disparar mais o evento órfão
// "study-center-opened", e o componente passou a importar e renderizar
// `<StudyRegisterModal open={isRegisterModalOpen} onOpenChange=
// {setIsRegisterModalOpen} />` no final do seu JSX, no mesmo padrão dos
// quatro precedentes citados acima.
//
// Este arquivo trava, lendo o código-fonte real (mesmo padrão dos demais
// *.wiring.test.ts deste projeto — sem infraestrutura de renderização de
// React nos testes), que essa correção existe, que nenhum modal paralelo foi
// introduzido, e que o dispatch órfão de "study-center-opened" foi removido
// deste arquivo.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

function readDashboardLayoutSource(): string {
  return fs.readFileSync(
    path.join(
      process.cwd(),
      "src",
      "features",
      "dashboard",
      "components",
      "dashboard-layout.tsx",
    ),
    "utf-8",
  )
}

describe("DashboardLayout: botão \"Adicionar Estudo\" abre o Centro Inteligente de Estudos (Fase 19)", () => {
  it("importa StudyRegisterModal (reaproveita o mesmo modal do Histórico, não cria um novo)", () => {
    const source = readDashboardLayoutSource()
    assert.match(
      source,
      /import \{ StudyRegisterModal \} from "@\/features\/study-session\/components\/study-register-modal"/,
    )
  })

  it("declara o estado isRegisterModalOpen e o botão \"Adicionar Estudo\" apenas o abre, sem disparar o evento órfão study-center-opened", () => {
    const source = readDashboardLayoutSource()
    assert.match(source, /const \[isRegisterModalOpen, setIsRegisterModalOpen\] = useState\(false\)/)

    const onClickIdx = source.indexOf("onClick={() => setIsRegisterModalOpen(true)}")
    assert.ok(
      onClickIdx !== -1,
      "esperava que o botão apenas chamasse setIsRegisterModalOpen(true), sem lógica extra no onClick",
    )

    // Nada no arquivo deve mais disparar o evento órfão que travava isCentralOpen.
    assert.doesNotMatch(
      source,
      /study-center-opened/,
      "o dispatch de \"study-center-opened\" (que travava o FloatingActionButton) deve ter sido removido deste arquivo",
    )
  })

  it("renderiza <StudyRegisterModal> vinculado ao estado isRegisterModalOpen (mesmo padrão de history-view.tsx, discipline-detail-view.tsx, edital-accordion.tsx e planning-view.tsx)", () => {
    const source = readDashboardLayoutSource()
    assert.match(
      source,
      /<StudyRegisterModal open=\{isRegisterModalOpen\} onOpenChange=\{setIsRegisterModalOpen\} \/>/,
    )
  })
})
