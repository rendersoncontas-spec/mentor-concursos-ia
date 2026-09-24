import { before, describe, it } from "node:test"
import assert from "node:assert/strict"
import type * as StudySessionSyncBridgeModule from "./study-session-sync-bridge"

/**
 * `study-session-sync-bridge.ts` só toca `window`/`document` dentro de
 * funções (nunca no topo do módulo), então aqui basta instalar os falsos
 * ANTES de qualquer chamada — não precisamos do padrão de import dinâmico
 * usado para `connection-state.ts` (que lê globais no carregamento).
 */
let fakeWindow: EventTarget & { dispatchEvent: (e: Event) => boolean }
let fakeDocument: EventTarget & { visibilityState: "visible" | "hidden" }
let createTriggerStudySessionSync: typeof StudySessionSyncBridgeModule.createTriggerStudySessionSync
let createStudySessionSyncTriggersInstaller: typeof StudySessionSyncBridgeModule.createStudySessionSyncTriggersInstaller
let STUDY_SESSION_SAVED_EVENT: string
let STUDY_SESSION_OFFLINE_RESOLVED_EVENT: string

before(async () => {
  fakeWindow = new EventTarget() as EventTarget & { dispatchEvent: (e: Event) => boolean }
  fakeDocument = Object.assign(new EventTarget(), { visibilityState: "visible" as const })
  Object.defineProperty(globalThis, "window", { value: fakeWindow, configurable: true, writable: true })
  Object.defineProperty(globalThis, "document", { value: fakeDocument, configurable: true, writable: true })
  ;({ createTriggerStudySessionSync, createStudySessionSyncTriggersInstaller } = await import(
    "./study-session-sync-bridge.ts"
  ))
  ;({ STUDY_SESSION_SAVED_EVENT, STUDY_SESSION_OFFLINE_RESOLVED_EVENT } = await import(
    "./study-session-events.ts"
  ))
})

describe("triggerStudySessionSync (Fase C, item 13)", () => {
  it("dispara STUDY_SESSION_SAVED_EVENT e o evento de resolução para cada operação sincronizada", async () => {
    const savedEvents: unknown[] = []
    const resolvedEvents: string[] = []
    fakeWindow.addEventListener(STUDY_SESSION_SAVED_EVENT, (e) => {
      savedEvents.push((e as CustomEvent<{ session: unknown }>).detail.session)
    })
    fakeWindow.addEventListener(STUDY_SESSION_OFFLINE_RESOLVED_EVENT, (e) => {
      resolvedEvents.push((e as CustomEvent<{ operationId: string }>).detail.operationId)
    })

    const trigger = createTriggerStudySessionSync(async () => ({
      attempted: 1,
      synced: 1,
      failed: 0,
      skipped: false,
      syncedSessions: [{ operationId: "op-1", session: { id: "real-1" } }],
    }))

    await trigger()

    assert.deepEqual(savedEvents, [{ id: "real-1" }])
    assert.deepEqual(resolvedEvents, ["op-1"])
  })

  it("nada sincronizado: não dispara nenhum evento", async () => {
    const savedEvents: unknown[] = []
    fakeWindow.addEventListener(STUDY_SESSION_SAVED_EVENT, () => savedEvents.push(1))

    const trigger = createTriggerStudySessionSync(async () => ({
      attempted: 0,
      synced: 0,
      failed: 0,
      skipped: true,
      reason: "offline",
      syncedSessions: [],
    }))

    await trigger()

    assert.equal(savedEvents.length, 0)
  })
})

describe("installStudySessionSyncTriggers (Fase C, item 8)", () => {
  it("evento 'online' do navegador dispara uma tentativa de sincronização", async () => {
    let calls = 0
    const install = createStudySessionSyncTriggersInstaller(async () => {
      calls++
    })
    const cleanup = install()
    // A própria instalação já dispara uma tentativa inicial (item 8: cobre o
    // caso de reabrir o app já online com operações pendentes de antes).
    assert.equal(calls, 1)

    fakeWindow.dispatchEvent(new Event("online"))
    assert.equal(calls, 2)

    cleanup()
  })

  it("app voltar ao foreground (visibilitychange -> visible) dispara uma tentativa de sincronização", async () => {
    let calls = 0
    const install = createStudySessionSyncTriggersInstaller(async () => {
      calls++
    })
    const cleanup = install()
    calls = 0 // ignora a tentativa inicial da instalação

    fakeDocument.visibilityState = "hidden"
    fakeDocument.dispatchEvent(new Event("visibilitychange"))
    assert.equal(calls, 0, "ficar em background não deve disparar sincronização")

    fakeDocument.visibilityState = "visible"
    fakeDocument.dispatchEvent(new Event("visibilitychange"))
    assert.equal(calls, 1)

    cleanup()
  })

  it("instalar duas vezes o MESMO instalador não duplica os listeners (guarda contra Strict Mode)", async () => {
    let calls = 0
    const install = createStudySessionSyncTriggersInstaller(async () => {
      calls++
    })
    const cleanupA = install()
    const cleanupB = install()
    assert.equal(cleanupA, cleanupB, "a segunda chamada deveria reaproveitar o cleanup já instalado")

    calls = 0
    fakeWindow.dispatchEvent(new Event("online"))
    assert.equal(calls, 1, "só deveria haver UM listener de 'online' instalado, não dois")

    cleanupA()
  })

  it("cleanup remove os listeners — evento 'online' depois disso não dispara mais nada", async () => {
    let calls = 0
    const install = createStudySessionSyncTriggersInstaller(async () => {
      calls++
    })
    const cleanup = install()
    calls = 0
    cleanup()

    fakeWindow.dispatchEvent(new Event("online"))
    assert.equal(calls, 0)
  })

  it("dois instaladores independentes (produção vs. teste) não compartilham o guard de 'já instalado'", async () => {
    let callsA = 0
    let callsB = 0
    const installA = createStudySessionSyncTriggersInstaller(async () => {
      callsA++
    })
    const installB = createStudySessionSyncTriggersInstaller(async () => {
      callsB++
    })
    const cleanupA = installA()
    const cleanupB = installB()

    callsA = 0
    callsB = 0
    fakeWindow.dispatchEvent(new Event("online"))
    assert.equal(callsA, 1)
    assert.equal(callsB, 1)

    cleanupA()
    cleanupB()
  })
})
