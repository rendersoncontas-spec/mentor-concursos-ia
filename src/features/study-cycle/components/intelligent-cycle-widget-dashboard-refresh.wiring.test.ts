// ─────────────────────────────────────────────────────────────────────────────
// BUG REAL (Fase 17, confirmado ao vivo contra o banco de produção; correção
// pedida na Fase 18) — o widget "Foco de Hoje" do Dashboard (Centro
// Inteligente de Estudos, aqui) ficava com o progresso ANTIGO depois de o
// usuário finalizar um estudo (cronômetro ou lançamento manual), até navegar
// para outra página ou recarregar. O Ciclo (/ciclos) e o Histórico já
// refletiam o valor novo imediatamente — só este widget ficava desatualizado.
//
// Causa raiz: `overview` vem de useCachedServerAction("activeCycleOverview",
// ..., 2 * 60 * 1000) — um cache em memória, no escopo do módulo
// use-cached-server-action.ts, com TTL de 2 minutos. `revalidatePath()`
// (chamado por saveStudySessionAction/saveManualStudyTimeAction após salvar)
// só invalida o cache de rotas do Next no servidor — não invalida esse cache
// local do cliente. Nada disparava o refresh() deste widget quando um estudo
// era salvo em outro lugar do app (a Central ou o lançamento manual).
//
// Correção (sem polling, sem novo timer, sem recarregar a página inteira):
// reaproveitar o evento global que já existe para isso — STUDY_SESSION_SAVED_
// EVENT (features/study-session/lib/study-session-events.ts), já disparado
// por study-register-modal.tsx e active-session-runner.tsx depois de todo
// salvamento bem-sucedido, e já consumido por history-view.tsx para atualizar
// o Histórico ao vivo. Este widget agora escuta o mesmo evento e chama o
// `refresh()` que ele próprio já usa em suas mutações internas (pausar,
// retomar, pular etapa, excluir ciclo).
//
// Este arquivo trava, lendo o código-fonte real (mesmo padrão dos demais
// *.wiring.test.ts deste projeto — sem infraestrutura de renderização de
// React nos testes), que essa correção existe e não introduziu polling.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

function readWidgetSource(): string {
  return fs.readFileSync(
    path.join(
      process.cwd(),
      "src",
      "features",
      "study-cycle",
      "components",
      "intelligent-cycle-widget.tsx",
    ),
    "utf-8",
  )
}

describe("IntelligentCycleWidget: Foco de Hoje se atualiza sozinho após qualquer estudo salvo (Fase 18, Bug 2)", () => {
  it("importa STUDY_SESSION_SAVED_EVENT do módulo de eventos já existente", () => {
    const source = readWidgetSource()
    assert.match(
      source,
      // Fase F.2: o mesmo import agora também traz shouldWidgetRefreshOnSaved.
      /import \{[^}]*\bSTUDY_SESSION_SAVED_EVENT\b[^}]*\} from "@\/features\/study-session\/lib\/study-session-events"/,
    )
  })

  it("escuta STUDY_SESSION_SAVED_EVENT em window e chama refresh() (o mesmo refresh já usado nas mutações internas)", () => {
    const source = readWidgetSource()
    const handlerIdx = source.indexOf("const handleStudySessionSaved = ")
    assert.ok(handlerIdx !== -1, "esperava um handler handleStudySessionSaved definido")
    const addListenerIdx = source.indexOf("window.addEventListener(STUDY_SESSION_SAVED_EVENT", handlerIdx)
    assert.ok(addListenerIdx !== -1, "esperava um addEventListener para STUDY_SESSION_SAVED_EVENT")
    const effectBlock = source.slice(handlerIdx, addListenerIdx + 300)
    assert.match(effectBlock, /refresh\(\)/)
    assert.match(effectBlock, /window\.addEventListener\(STUDY_SESSION_SAVED_EVENT, handleStudySessionSaved\)/)
  })

  it("remove o listener na limpeza do efeito (sem vazar listener entre montagens)", () => {
    const source = readWidgetSource()
    assert.match(
      source,
      /window\.removeEventListener\(STUDY_SESSION_SAVED_EVENT, handleStudySessionSaved\)/,
    )
  })

  it("não introduziu nenhum polling (setInterval) para resolver isto", () => {
    const source = readWidgetSource()
    assert.doesNotMatch(
      source,
      /setInterval/,
      "a correção deve reaproveitar o evento já existente, não adicionar polling",
    )
  })
})
