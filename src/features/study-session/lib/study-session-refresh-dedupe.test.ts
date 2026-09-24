import { before, describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Fase F.2 — um estudo salvo deve atualizar cada dado UMA vez.
 *
 * Antes (Fase F/F.1), ao salvar um estudo online no Dashboard:
 *   1. a própria Server Action (que chama revalidatePath) já devolvia a
 *      página re-renderizada (comportamento do Next 16 — ver o último bloco);
 *   2. o modal/cronômetro chamava router.refresh() → 2ª renderização completa;
 *   3. os widgets "Foco de hoje" e "Estudos de hoje" ouviam
 *      STUDY_SESSION_SAVED_EVENT e buscavam de novo por Server Action.
 *
 * Agora: (1) continua; (2) só no caminho offline, como antes; (3) é dispensado
 * quando o evento avisa `serverRefresh: true` e o widget é abastecido pelo
 * servidor. A sincronização offline NÃO manda o aviso — os widgets continuam
 * se atualizando sozinhos nesse caso.
 */

import type * as EventsModule from "./study-session-events"
import type * as BridgeModule from "./study-session-sync-bridge"

let fakeWindow: EventTarget
let events: typeof EventsModule
let bridge: typeof BridgeModule

before(async () => {
  fakeWindow = new EventTarget()
  Object.defineProperty(globalThis, "window", { value: fakeWindow, configurable: true, writable: true })
  events = await import("./study-session-events.ts")
  bridge = await import("./study-session-sync-bridge.ts")
})

/** Widget simulado exatamente como os do Dashboard: listener + decisão. */
function mountWidget(serverBacked: boolean) {
  const calls = { clientRefresh: 0 }
  const handler = (event: Event) => {
    if (!events.shouldWidgetRefreshOnSaved(event, serverBacked)) return
    calls.clientRefresh++
  }
  fakeWindow.addEventListener(events.STUDY_SESSION_SAVED_EVENT, handler)
  return { calls, unmount: () => fakeWindow.removeEventListener(events.STUDY_SESSION_SAVED_EVENT, handler) }
}

const session = { id: "h-1" } as unknown as EventsModule.SavedStudySession

describe("STUDY_SESSION_SAVED_EVENT com aviso de refresh do servidor", () => {
  it("sem opção, o evento é idêntico ao de sempre ({ session }) — retrocompatível", () => {
    let detail: unknown
    const h = (e: Event) => (detail = (e as CustomEvent).detail)
    fakeWindow.addEventListener(events.STUDY_SESSION_SAVED_EVENT, h)
    events.dispatchStudySessionSaved(session)
    fakeWindow.removeEventListener(events.STUDY_SESSION_SAVED_EVENT, h)
    assert.deepEqual(detail, { session })
  })

  it("com serverRefresh, o detalhe ganha só o campo novo; readStudySessionSaved continua lendo a sessão", () => {
    let detail: unknown
    let read: unknown
    const h = (e: Event) => {
      detail = (e as CustomEvent).detail
      read = events.readStudySessionSaved(e)
    }
    fakeWindow.addEventListener(events.STUDY_SESSION_SAVED_EVENT, h)
    events.dispatchStudySessionSaved(session, { serverRefresh: true })
    fakeWindow.removeEventListener(events.STUDY_SESSION_SAVED_EVENT, h)
    assert.deepEqual(detail, { session, serverRefresh: true })
    assert.deepEqual(read, session)
  })

  it("tabela de decisão: só dispensa a busca com dado do servidor E aviso de refresh", () => {
    const withFlag = new CustomEvent("x", { detail: { session, serverRefresh: true } })
    const noFlag = new CustomEvent("x", { detail: { session } })
    const noDetail = new CustomEvent("x")
    assert.equal(events.shouldWidgetRefreshOnSaved(withFlag, true), false)
    assert.equal(events.shouldWidgetRefreshOnSaved(withFlag, false), true)
    assert.equal(events.shouldWidgetRefreshOnSaved(noFlag, true), true)
    assert.equal(events.shouldWidgetRefreshOnSaved(noDetail, true), true)
    assert.equal(events.shouldWidgetRefreshOnSaved(noDetail, false), true)
  })
})

describe("cenários de salvamento (widgets do Dashboard)", () => {
  it("1. estudo online: o widget NÃO repete a Server Action (o dado chega na resposta da action)", () => {
    const w = mountWidget(true)
    events.dispatchStudySessionSaved(session, { serverRefresh: true })
    w.unmount()
    assert.equal(w.calls.clientRefresh, 0)
  })

  it("2/3. estudo offline sincronizado depois: a ponte NÃO manda o aviso → widget atualiza 1× sozinho", async () => {
    const w = mountWidget(true)
    const trigger = bridge.createTriggerStudySessionSync(async () => ({
      attempted: 1,
      synced: 1,
      failed: 0,
      skipped: false,
      syncedSessions: [{ operationId: "op-1", session: { id: "real-1" } }],
    }))
    await trigger()
    w.unmount()
    assert.equal(w.calls.clientRefresh, 1)
  })

  it("4. sem chamada redundante: 1 estudo online = 0 buscas extras em cada widget abastecido pelo servidor", () => {
    const cycle = mountWidget(true)
    const recent = mountWidget(true)
    events.dispatchStudySessionSaved(session, { serverRefresh: true })
    cycle.unmount()
    recent.unmount()
    assert.equal(cycle.calls.clientRefresh + recent.calls.clientRefresh, 0)
  })

  it("widget SEM dado do servidor (chave ausente, ex.: erro no carregamento) continua buscando sozinho", () => {
    const w = mountWidget(false)
    events.dispatchStudySessionSaved(session, { serverRefresh: true })
    w.unmount()
    assert.equal(w.calls.clientRefresh, 1)
  })

  it("eventos sem detalhe (Planejamento ao concluir bloco/puxar pendência) continuam atualizando", () => {
    const w = mountWidget(true)
    fakeWindow.dispatchEvent(new CustomEvent(events.STUDY_SESSION_SAVED_EVENT))
    w.unmount()
    assert.equal(w.calls.clientRefresh, 1)
  })
})

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf-8")
}
function code(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
}

describe("emissores e consumidores (wiring)", () => {
  it("modal de registro: todo SAVED online avisa serverRefresh; router.refresh() só no caminho offline", () => {
    const src = code("src/features/study-session/components/study-register-modal.tsx")
    const dispatches = src.match(/dispatchStudySessionSaved\([^)]*\)[^\n]*/g) ?? []
    assert.equal(dispatches.length, 3)
    for (const d of dispatches) assert.ok(d.includes("{ serverRefresh: true }"), d)
    const refreshes = src.match(/router\.refresh\(\)/g) ?? []
    assert.equal(refreshes.length, 1)
    assert.ok(src.includes("if (wasPending) router.refresh()"))
  })

  it("cronômetro: SAVED online avisa serverRefresh; router.refresh() só se ficou pendente", () => {
    const src = code("src/features/study-session/components/active-session-runner.tsx")
    assert.ok(src.includes("dispatchStudySessionSaved(res.session as SavedStudySession, { serverRefresh: true })"))
    assert.ok(src.includes("if (res.pending) router.refresh()"))
    assert.equal((src.match(/router\.refresh\(\)/g) ?? []).length, 1)
  })

  it("ponte offline: dispara SAVED SEM o aviso (widgets atualizam sozinhos)", () => {
    const src = code("src/features/study-session/lib/study-session-sync-bridge.ts")
    assert.ok(src.includes("dispatchStudySessionSaved(entry.session as SavedStudySession)"))
    assert.equal(src.includes("serverRefresh"), false)
  })

  it("widgets do Dashboard usam a decisão; Histórico e Planejamento continuam reagindo a todo SAVED", () => {
    const cycle = code("src/features/study-cycle/components/intelligent-cycle-widget.tsx")
    assert.ok(cycle.includes("if (!shouldWidgetRefreshOnSaved(event, serverBacked)) return"))
    const catalog = code("src/features/dashboard/components/dashboard-widget-catalog.tsx")
    assert.ok(catalog.includes("if (!shouldWidgetRefreshOnSaved(event, serverBacked)) return"))
    // Histórico: upsert local em todo SAVED (não depende de servidor).
    const history = code("src/features/history/components/history-view.tsx")
    assert.ok(history.includes("readStudySessionSaved(event)"))
    assert.equal(history.includes("shouldWidgetRefreshOnSaved"), false)
    // Planejamento: dados de replanejamento não vêm da página no servidor → sempre atualiza.
    for (const f of [
      "src/features/planejamento/components/daily-planning-view.tsx",
      "src/features/planejamento/components/weekly-planning-view.tsx",
      "src/features/planejamento/components/study-calendar-view.tsx",
    ]) {
      const src = code(f)
      assert.ok(src.includes("window.addEventListener(STUDY_SESSION_SAVED_EVENT"), f)
      assert.equal(src.includes("shouldWidgetRefreshOnSaved"), false, f)
    }
  })

  it("as Server Actions de salvar/editar revalidam no sucesso (premissa do refresh via resposta da action)", () => {
    const save = code("src/application/study-session/study-session.action.ts")
    assert.ok(save.includes('revalidatePath("/dashboard")'))
    const idem = code("src/application/study-session/study-session-idempotency.ts")
    assert.ok(idem.includes("params.onRevalidate()"))
    assert.ok(idem.includes("onReplay: params.onRevalidate"))
    const hist = code("src/application/study-history/study-history.actions.ts")
    const update = hist.slice(hist.indexOf("export async function updateStudySessionAction"))
    assert.ok(update.slice(0, 3000).includes("for (const path of HISTORY_PATHS) revalidatePath(path)"))
  })

  it("premissa do Next 16: Server Action que revalida re-renderiza a página atual na própria resposta", () => {
    // Se uma atualização do Next mudar isto, este teste falha e o
    // router.refresh() após salvar precisa ser reavaliado.
    const reducer = fs.readFileSync(
      path.join(process.cwd(), "node_modules/next/dist/client/components/router-reducer/reducers/server-action-reducer.js"),
      "utf-8",
    )
    assert.ok(reducer.includes("FreshnessPolicy.RefreshAll"))
    assert.ok(reducer.includes("revalidationKind === _actionrevalidationkind.ActionDidNotRevalidate ? _pprnavigations.FreshnessPolicy.Default : _pprnavigations.FreshnessPolicy.RefreshAll"))
    const handler = fs.readFileSync(
      path.join(process.cwd(), "node_modules/next/dist/server/app-render/action-handler.js"),
      "utf-8",
    )
    assert.ok(handler.includes("skipPageRendering: workStore.pathWasRevalidated === undefined || workStore.pathWasRevalidated === _actionrevalidationkind.ActionDidNotRevalidate"))
  })
})
