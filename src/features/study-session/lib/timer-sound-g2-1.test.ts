import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"

/**
 * G2.1 FASE 3 — preferência somTimer conectada ao useFocusSound (Opção A),
 * sem novo player e sem novos IDs.
 *
 * Mapeamento honesto (ver focusSoundIdForModalPreference): Silencioso → off;
 * Melodia 1 → primeira ambiente (rain) somente se desligado.
 * G2.2: "Sino" legado normaliza para "Melodia 1" (sem ID de sino no sistema).
 */

import {
  focusSoundIdForModalPreference,
  TIMER_SOUND_PREFERENCE_EVENT,
} from "@/features/study-session/hooks/use-focus-sound"

function readSource(p: string): string {
  return fs.readFileSync(path.join(process.cwd(), p), "utf-8")
}

describe("G2.1 — mapeamento somTimer → FocusSoundId", () => {
  it("Silencioso desliga (qualquer estado atual)", () => {
    assert.equal(focusSoundIdForModalPreference("Silencioso", "rain"), "off")
    assert.equal(focusSoundIdForModalPreference("Silencioso", "off"), "off")
  })

  it("Melodia 1 liga na primeira ambiente sem sobrescrever timbre explícito", () => {
    assert.equal(focusSoundIdForModalPreference("Melodia 1", "off"), "rain")
    assert.equal(focusSoundIdForModalPreference("Melodia 1", "cafe"), null)
  })

  it("Sino legado comporta-se como Melodia 1; resto não toca em nada", () => {
    // G2.2: sem ID de sino no sistema — legado normaliza na leitura.
    assert.equal(focusSoundIdForModalPreference("Sino", "off"), "rain")
    assert.equal(focusSoundIdForModalPreference("Sino", "waves"), null)
    for (const v of ["Melodia 7", "", null, undefined, 42, {}]) {
      assert.equal(focusSoundIdForModalPreference(v, "off"), "rain", `Melodia 1 (default) para ${JSON.stringify(v)}`)
      assert.equal(focusSoundIdForModalPreference(v, "waves"), null, `mantém timbre para ${JSON.stringify(v)}`)
    }
  })
})

describe("G2.1 — fiação preferência → player (wiring)", () => {
  it("modal dispara evento após salvar (sem player novo)", () => {
    const source = readSource("src/features/profile/components/account-settings-modal.tsx")
    assert.ok(source.includes("TIMER_SOUND_PREFERENCE_EVENT"), "importa o evento canônico")
    assert.ok(
      source.includes("new CustomEvent(TIMER_SOUND_PREFERENCE_EVENT, { detail: somTimer })"),
      "propaga o valor salvo",
    )
    assert.equal(source.includes("new Audio("), false, "nenhum player novo no modal")
  })

  it("provider aplica via selectSound existente (sem AudioContext próprio)", () => {
    const source = readSource("src/features/study-session/components/study-provider.tsx")
    assert.ok(source.includes("TIMER_SOUND_PREFERENCE_EVENT"), "escuta o evento canônico")
    assert.ok(source.includes("focusSoundIdForModalPreference("), "usa o mapeamento canônico")
    assert.ok(source.includes("focusSound.selectSound(target)"), "aplica pela API existente")
    assert.equal(source.includes("new Audio("), false, "nenhum player novo no provider")
  })
})
