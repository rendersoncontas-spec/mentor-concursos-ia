import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { handleTabListKeyDown, nextTabIndex, type TabListKeyEvent } from "./tab-keyboard"

// G2.23 — padrão de abas WAI-ARIA APG: comportamento do helper compartilhado.

describe("nextTabIndex — horizontal (padrão, compatível com a G2.22)", () => {
  it("← → circulam; Home/End vão às pontas; outras teclas não pertencem ao padrão", () => {
    assert.equal(nextTabIndex("ArrowRight", 0, 3), 1)
    assert.equal(nextTabIndex("ArrowRight", 2, 3), 0)
    assert.equal(nextTabIndex("ArrowLeft", 0, 3), 2)
    assert.equal(nextTabIndex("Home", 2, 3), 0)
    assert.equal(nextTabIndex("End", 0, 3), 2)
    for (const key of ["ArrowDown", "ArrowUp", "Enter", " ", "Tab", "a"]) assert.equal(nextTabIndex(key, 0, 3), null, key)
  })

  it("lista vazia ou índice atual inválido", () => {
    assert.equal(nextTabIndex("ArrowRight", 0, 0), null)
    assert.equal(nextTabIndex("ArrowRight", -1, 3), 0, "sem aba focada, → vai para a primeira")
    assert.equal(nextTabIndex("ArrowLeft", -1, 3), 2, "sem aba focada, ← vai para a última")
  })
})

describe("nextTabIndex — vertical", () => {
  it("↑ ↓ circulam; ← → não pertencem ao padrão vertical", () => {
    const v = { orientation: "vertical" as const }
    assert.equal(nextTabIndex("ArrowDown", 0, 6, v), 1)
    assert.equal(nextTabIndex("ArrowDown", 5, 6, v), 0)
    assert.equal(nextTabIndex("ArrowUp", 0, 6, v), 5)
    assert.equal(nextTabIndex("Home", 3, 6, v), 0)
    assert.equal(nextTabIndex("End", 3, 6, v), 5)
    assert.equal(nextTabIndex("ArrowRight", 0, 6, v), null)
    assert.equal(nextTabIndex("ArrowLeft", 0, 6, v), null)
  })
})

describe("nextTabIndex — abas desabilitadas", () => {
  const disabled = (set: number[]) => ({ isDisabled: (i: number) => set.includes(i) })

  it("setas pulam as desabilitadas, inclusive ao dar a volta", () => {
    assert.equal(nextTabIndex("ArrowRight", 0, 4, disabled([1])), 2)
    assert.equal(nextTabIndex("ArrowRight", 2, 4, disabled([3, 0])), 1)
    assert.equal(nextTabIndex("ArrowLeft", 1, 4, disabled([0])), 3)
  })

  it("Home/End vão à primeira/última HABILITADA", () => {
    assert.equal(nextTabIndex("Home", 3, 4, disabled([0])), 1)
    assert.equal(nextTabIndex("End", 0, 4, disabled([3, 2])), 1)
  })

  it("todas desabilitadas (ou só a atual habilitada): nada para onde ir", () => {
    assert.equal(nextTabIndex("ArrowRight", 0, 3, disabled([0, 1, 2])), null)
    assert.equal(nextTabIndex("Home", 0, 3, disabled([0, 1, 2])), null)
    assert.equal(nextTabIndex("ArrowRight", 1, 3, disabled([0, 2])), 1, "única habilitada continua sendo ela")
  })
})

// Duplos mínimos de elementos para o handler de DOM (sem jsdom).
function fakeTabs(n: number, opts: { disabled?: number[]; selected?: number } = {}) {
  const log: string[] = []
  const tabs = Array.from({ length: n }, (_, i) => {
    const el = {
      index: i,
      disabled: opts.disabled?.includes(i) ?? false,
      getAttribute(name: string) {
        if (name === "aria-disabled") return el.disabled ? "true" : null
        if (name === "aria-selected") return i === (opts.selected ?? 0) ? "true" : "false"
        return null
      },
      focus() {
        log.push(`focus:${i}`)
      },
      click() {
        log.push(`click:${i}`)
      },
      closest(sel: string) {
        return sel === '[role="tab"]' ? el : null
      },
    }
    return el
  })
  const list = {
    getAttribute: (name: string) => (name === "aria-orientation" ? null : null),
    querySelectorAll: () => tabs,
  }
  return { tabs, list, log }
}

function keyEvent(key: string, target: unknown, currentTarget: unknown) {
  let prevented = false
  const event = {
    key,
    target,
    currentTarget,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    preventDefault() {
      prevented = true
    },
  }
  return { event: event as unknown as TabListKeyEvent, prevented: () => prevented }
}

describe("handleTabListKeyDown — integração com o DOM", () => {
  it("ativação manual: move só o foco (não clica)", () => {
    const { tabs, list, log } = fakeTabs(5)
    const { event, prevented } = keyEvent("ArrowRight", tabs[0], list)
    handleTabListKeyDown(event, { activation: "manual" })
    assert.deepEqual(log, ["focus:1"])
    assert.equal(prevented(), true)
  })

  it("ativação automática: move o foco e ativa a aba (click)", () => {
    const { tabs, list, log } = fakeTabs(3)
    const { event } = keyEvent("End", tabs[0], list)
    handleTabListKeyDown(event, { activation: "automatic" })
    assert.deepEqual(log, ["focus:2", "click:2"])
  })

  it("parte da aba FOCADA (não da selecionada) e respeita desabilitadas", () => {
    const { tabs, list, log } = fakeTabs(4, { disabled: [2], selected: 0 })
    const { event } = keyEvent("ArrowRight", tabs[1], list)
    handleTabListKeyDown(event, { activation: "manual" })
    assert.deepEqual(log, ["focus:3"])
  })

  it("teclas fora do padrão e combinações com modificadores são ignoradas (não atrapalham atalhos do navegador)", () => {
    const { tabs, list, log } = fakeTabs(3)
    for (const key of ["Enter", " ", "Tab", "Escape"]) {
      const { event, prevented } = keyEvent(key, tabs[0], list)
      handleTabListKeyDown(event, { activation: "automatic" })
      assert.equal(prevented(), false, key)
    }
    const { event, prevented } = keyEvent("ArrowRight", tabs[0], list)
    ;(event as unknown as { altKey: boolean }).altKey = true
    handleTabListKeyDown(event, { activation: "automatic" })
    assert.equal(prevented(), false)
    assert.deepEqual(log, [])
  })

  it("vertical pela opção: ↓ move, → não", () => {
    const { tabs, list, log } = fakeTabs(3)
    handleTabListKeyDown(keyEvent("ArrowRight", tabs[0], list).event, { activation: "automatic", orientation: "vertical" })
    handleTabListKeyDown(keyEvent("ArrowDown", tabs[0], list).event, { activation: "automatic", orientation: "vertical" })
    assert.deepEqual(log, ["focus:1", "click:1"])
  })

  it("tecla vinda de dentro de um elemento que não é aba é ignorada", () => {
    const { list, log } = fakeTabs(3)
    const outsider = { closest: () => null }
    const { event, prevented } = keyEvent("ArrowRight", outsider, list)
    handleTabListKeyDown(event, { activation: "automatic" })
    assert.equal(prevented(), false)
    assert.deepEqual(log, [])
  })
})
