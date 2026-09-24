import { before, describe, it } from "node:test"
import assert from "node:assert/strict"
import type * as ConnectionStateModule from "./connection-state"

/**
 * connection-state.ts lê `window`/`navigator` no momento em que o módulo é
 * carregado (para calcular o status inicial) e anexa os listeners de
 * online/offline. Por isso, precisamos instalar um `window`/`navigator`
 * falsos ANTES de importar o módulo — feito aqui num hook `before` com
 * import dinâmico (import estático seria avaliado antes deste código rodar).
 */
let connectionState: typeof ConnectionStateModule.connectionState
let fakeWindow: EventTarget
let fakeNavigator: { onLine: boolean }

before(async () => {
  fakeWindow = new EventTarget()
  fakeNavigator = { onLine: true }
  // Node 21+ já expõe um `navigator` global somente-leitura (getter) — uma
  // atribuição direta (`globalThis.navigator = ...`) lança TypeError.
  // `defineProperty` substitui a propriedade em vez de tentar escrever nela.
  Object.defineProperty(globalThis, "window", {
    value: fakeWindow,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, "navigator", {
    value: fakeNavigator,
    configurable: true,
    writable: true,
  })
  ;({ connectionState } = await import("./connection-state.ts"))
})

describe("connectionState (item 8/9 do pedido)", () => {
  it("começa ONLINE quando navigator.onLine é true no momento em que o módulo carrega", () => {
    assert.equal(connectionState.get(), "ONLINE")
  })

  it("evento 'offline' do navegador muda o estado para OFFLINE", () => {
    fakeNavigator.onLine = false
    fakeWindow.dispatchEvent(new Event("offline"))
    assert.equal(connectionState.get(), "OFFLINE")
  })

  it("evento 'online' do navegador volta o estado para ONLINE", () => {
    fakeNavigator.onLine = true
    fakeWindow.dispatchEvent(new Event("online"))
    assert.equal(connectionState.get(), "ONLINE")
  })

  it("setSyncing/setSyncError mudam o estado independentemente de navigator.onLine", () => {
    connectionState.setSyncing()
    assert.equal(connectionState.get(), "SYNCING")
    connectionState.setSyncError()
    assert.equal(connectionState.get(), "SYNC_ERROR")
  })

  it("refreshFromBrowser recalcula a partir de navigator.onLine (usado ao final de uma tentativa de sync)", () => {
    fakeNavigator.onLine = true
    connectionState.refreshFromBrowser()
    assert.equal(connectionState.get(), "ONLINE")
  })

  it("subscribe recebe cada mudança de estado; unsubscribe para de receber", () => {
    const received: string[] = []
    const unsubscribe = connectionState.subscribe((status) => received.push(status))
    connectionState.setSyncing()
    connectionState.setSyncError()
    unsubscribe()
    connectionState.setSyncing()
    assert.deepEqual(received, ["SYNCING", "SYNC_ERROR"])
  })
})
