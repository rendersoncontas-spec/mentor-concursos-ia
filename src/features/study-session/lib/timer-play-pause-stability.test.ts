import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

import { calculateTimes, getActiveElapsedSeconds } from "./session-timing"
import { pauseAt, resumeAt, type PausableSession } from "./session-transitions"
import {
  PERSISTED_SESSION_FIELDS,
  sessionSnapshotSignature,
  type SessionSnapshot,
} from "./session-snapshot"

/**
 * Regressão do bug de Play/Pause do cronômetro (relato: o controle "pisca",
 * um clique às vezes não funciona e o botão diverge do estado real).
 *
 * Causa raiz comprovada:
 *  1. o provider grava a sessão no IndexedDB a cada mudança de `session` —
 *     inclusive a cada tick de 1s (o objeto muda de referência);
 *  2. `sessionStore.set()` publica no BroadcastChannel e o canal de
 *     `subscribe()` DA PRÓPRIA ABA recebe a mensagem (canais distintos no
 *     mesmo documento se entregam);
 *  3. o subscriber relê o IndexedDB e substitui o estado por um objeto novo,
 *     reacendendo o efeito de gravação → loop contínuo de render;
 *  4. um `get()` disparado antes do clique podia resolver depois e reaplicar
 *     o snapshot antigo (fase STUDYING) por cima do Pause recém-clicado.
 *
 * Estes testes travam o comportamento corrigido sem depender de React/DOM:
 * transições puras, cálculo do tempo e a assinatura que evita regravações.
 */

type TestSession = SessionSnapshot &
  PausableSession & { activeSeconds: number; pausedSeconds: number }

const T0 = 1_700_000_000_000

function baseSession(overrides: Partial<TestSession> = {}): TestSession {
  return {
    isActive: true,
    isMinimized: false,
    phase: "STUDYING",
    disciplineName: "RLM",
    disciplineId: "disc-1",
    topicName: "",
    studyType: "TEORIA",
    technique: "LIVRE",
    notes: "",
    startTime: T0,
    totalPausedMs: 0,
    lastPauseStartTime: null,
    plannedSeconds: 0,
    planItemId: null,
    source: "FREE",
    cycleId: null,
    cycleItemId: null,
    activeSeconds: 0,
    pausedSeconds: 0,
    ...overrides,
  }
}

const seconds = (n: number) => n * 1000

describe("Play/Pause do cronômetro — um clique, uma transição", () => {
  it("um clique em Pausar congela o tempo ativo", () => {
    const studying = baseSession()
    const paused = pauseAt(studying, T0 + seconds(40))

    assert.equal(paused.phase, "PAUSED")
    assert.equal(paused.lastPauseStartTime, T0 + seconds(40))
    assert.equal(getActiveElapsedSeconds(paused, T0 + seconds(40)), 40)
    // Mesmo muito tempo depois, o tempo ativo não anda enquanto pausado.
    assert.equal(getActiveElapsedSeconds(paused, T0 + seconds(400)), 40)
  })

  it("clique repetido em Pausar não altera nada (mesma referência → sem render)", () => {
    const paused = pauseAt(baseSession(), T0 + seconds(10))
    const again = pauseAt(paused, T0 + seconds(30))

    assert.equal(again, paused)
    assert.equal(again.lastPauseStartTime, T0 + seconds(10))
  })

  it("um clique em Continuar retoma e NÃO conta o período pausado", () => {
    const paused = pauseAt(baseSession(), T0 + seconds(40))
    const resumed = resumeAt(paused, T0 + seconds(60)) // 20s pausado

    assert.equal(resumed.phase, "STUDYING")
    assert.equal(resumed.lastPauseStartTime, null)
    assert.equal(resumed.totalPausedMs, seconds(20))
    assert.equal(getActiveElapsedSeconds(resumed, T0 + seconds(60)), 40)
    assert.equal(getActiveElapsedSeconds(resumed, T0 + seconds(70)), 50)
  })

  it("clique repetido em Continuar não soma pausa duas vezes", () => {
    const paused = pauseAt(baseSession(), T0 + seconds(40))
    const resumed = resumeAt(paused, T0 + seconds(60))
    const again = resumeAt(resumed, T0 + seconds(90))

    assert.equal(again, resumed)
    assert.equal(again.totalPausedMs, seconds(20))
  })

  it("alternância rápida mantém o tempo acumulado consistente", () => {
    let session: TestSession = baseSession()

    session = pauseAt(session, T0 + seconds(40)) // 40s estudados
    session = resumeAt(session, T0 + seconds(60)) // 20s pausado
    session = pauseAt(session, T0 + seconds(70)) // +10s estudados
    session = resumeAt(session, T0 + seconds(75)) // 5s pausado

    assert.equal(session.totalPausedMs, seconds(25))
    assert.equal(getActiveElapsedSeconds(session, T0 + seconds(75)), 50)
  })

  it("não alterna fora da fase esperada (nunca inverte o estado por engano)", () => {
    const studying = baseSession()
    const paused = pauseAt(studying, T0 + seconds(5))

    assert.equal(resumeAt(studying, T0 + seconds(5)), studying)
    assert.equal(pauseAt(paused, T0 + seconds(6)), paused)
  })

  it("calculateTimes deriva os segundos dos timestamps (sem contador paralelo)", () => {
    const paused = pauseAt(baseSession(), T0 + seconds(30))
    const times = calculateTimes(paused, T0 + seconds(50))

    assert.deepEqual(times, { activeSeconds: 30, pausedSeconds: 20 })
    assert.deepEqual(calculateTimes(baseSession({ startTime: null }), T0), {
      activeSeconds: 0,
      pausedSeconds: 0,
    })
  })
})

describe("Snapshot persistido — sem gravação por tick e sem loop de reidratação", () => {
  it("o tick de segundos NÃO muda a assinatura (não regrava a cada 1s)", () => {
    const a = baseSession({ activeSeconds: 10, pausedSeconds: 0 })
    const b = { ...a, activeSeconds: 11, pausedSeconds: 1 }

    assert.equal(sessionSnapshotSignature(a), sessionSnapshotSignature(b))
    assert.ok(!(PERSISTED_SESSION_FIELDS as readonly string[]).includes("activeSeconds"))
    assert.ok(!(PERSISTED_SESSION_FIELDS as readonly string[]).includes("pausedSeconds"))
  })

  it("Pausar e Continuar mudam a assinatura (cada transição grava uma vez)", () => {
    const studying = baseSession()
    const paused = pauseAt(studying, T0 + seconds(10))
    const resumed = resumeAt(paused, T0 + seconds(20))

    assert.notEqual(sessionSnapshotSignature(studying), sessionSnapshotSignature(paused))
    assert.notEqual(sessionSnapshotSignature(paused), sessionSnapshotSignature(resumed))
  })

  it("reidratar o mesmo snapshot não dispara nova gravação (loop termina)", () => {
    let lastSignature: string | null = null
    let writes = 0

    // Mesma decisão do efeito de persistência do StudyProvider.
    const persistIfChanged = (session: TestSession): boolean => {
      const signature = sessionSnapshotSignature(session)
      if (signature === lastSignature) return false
      lastSignature = signature
      writes += 1
      return true
    }

    let local = baseSession()
    assert.equal(persistIfChanged(local), true) // 1 gravação real

    for (let tick = 1; tick <= 120; tick++) {
      // 2 minutos de tick: antes, 120 gravações + 120 broadcasts + reidratações
      local = { ...local, activeSeconds: tick }
      assert.equal(persistIfChanged(local), false)
      // O que o subscriber receberia de volta do IndexedDB tem o MESMO
      // conteúdo persistido — portanto não gera novo estado/gravação.
      const rehydrated = { ...local, activeSeconds: tick + 1 }
      assert.equal(persistIfChanged(rehydrated), false)
    }

    assert.equal(writes, 1)
  })

  it("a sessão restaurada do IndexedDB é aplicada uma única vez, não em loop", () => {
    // Assinatura igual ⇒ o subscriber devolve `prev` (React não re-renderiza)
    // ⇒ o efeito de persistência não roda de novo.
    const local = baseSession({ activeSeconds: 42 })
    const rehydrated = { ...baseSession(), activeSeconds: 43 }
    assert.equal(sessionSnapshotSignature(local), sessionSnapshotSignature(rehydrated))
  })
})

describe("Wiring: provider e store protegem contra eco/loop e duplicação", () => {
  const root = path.resolve(import.meta.dirname, "../../../..")
  const providerSource = fs.readFileSync(
    path.join(root, "src/features/study-session/components/study-provider.tsx"),
    "utf8",
  )
  const storeSource = fs.readFileSync(
    path.join(root, "src/infrastructure/offline/session-store.ts"),
    "utf8",
  )
  const headerSource = fs.readFileSync(
    path.join(root, "src/components/study/study-header-control.tsx"),
    "utf8",
  )
  const transitionsSource = fs.readFileSync(
    path.join(root, "src/features/study-session/lib/session-transitions.ts"),
    "utf8",
  )

  it("o store ignora o eco da própria aba e mantém o aviso entre abas", () => {
    assert.match(storeSource, /tabId: TAB_ID/)
    assert.match(storeSource, /event\.data\.tabId === TAB_ID\) return/)
    assert.match(storeSource, /onChange\(\)/)
  })

  it("o efeito de persistência só grava quando o snapshot mudou", () => {
    assert.match(providerSource, /persistedSnapshotRef/)
    assert.match(providerSource, /sessionSnapshotSignature\(session\)/)
    assert.match(
      providerSource,
      /persistedSnapshotRef\.current\.signature === signature[\s\S]{0,120}return/,
    )
  })

  it("o subscriber não recria estado quando o snapshot é igual", () => {
    assert.match(
      providerSource,
      /setSession\(\(prev\) =>\s*prev && sessionSnapshotSignature\(prev\) === sessionSnapshotSignature\(next\) \? prev : next/,
    )
  })

  it("Play/Pause usam as transições puras e não salvam sessão/registro", () => {
    assert.match(providerSource, /pauseAt\(prev, Date\.now\(\)\)/)
    assert.match(providerSource, /resumeAt\(prev, Date\.now\(\)\)/)

    const pauseStart = providerSource.indexOf("const pauseSession = useCallback")
    const resumeStart = providerSource.indexOf("const resumeSession = useCallback")
    const block = providerSource.slice(pauseStart, resumeStart + 600)
    assert.ok(pauseStart > 0 && resumeStart > pauseStart)
    assert.doesNotMatch(block, /saveStudySession|finalizeAndSaveSession|study_history|client_operation_id/)
  })

  it("as transições não importam React, rede ou banco (puras e testáveis)", () => {
    assert.doesNotMatch(transitionsSource, /from "react"|supabase|fetch\(|indexedDB|localStorage/)
  })

  it("existe UM único intervalo de tick do cronômetro, com clear + cleanup", () => {
    assert.equal((providerSource.match(/intervalRef\.current = setInterval\(/g) ?? []).length, 1)
    assert.match(
      providerSource,
      /if \(intervalRef\.current\) clearInterval\(intervalRef\.current\)[\s\S]{0,80}intervalRef\.current = setInterval\(/,
    )
    assert.match(
      providerSource,
      /intervalRef\.current = setInterval\([\s\S]{0,400}?return \(\) => \{[\s\S]{0,200}?clearInterval\(intervalRef\.current\)/,
    )
    // O intervalo do título da aba também é único e limpo no unmount.
    assert.equal((providerSource.match(/const intervalId = setInterval\(applyTitle, 1000\)/g) ?? []).length, 1)
    assert.match(providerSource, /clearInterval\(intervalId\)/)
  })

  it("o rótulo de status tem largura fixa (não empurra os botões a cada clique)", () => {
    assert.match(headerSource, /sm:inline-block w-\[64px\] text-left/)
  })
})
