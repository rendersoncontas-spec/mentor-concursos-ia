import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"

/**
 * G2.2 — fechamento do sistema de som (Caso B: sem sino real no sistema).
 *
 * - Inventário: só loops ambientes (off/rain/library/cafe/waves/fireplace/
 *   brown/pink/white_noise); nenhum bell/ding/chime/evento.
 * - UI honesta: só "Melodia 1" e "Silencioso" visíveis.
 * - Legado "Sino" normaliza para "Melodia 1" na leitura (sem migration,
 *   sem apagar nada, sem erro).
 */

import {
  focusSoundIdForModalPreference,
  normalizeTimerSoundOption,
  TIMER_SOUND_OPTIONS,
} from "@/features/study-session/hooks/use-focus-sound"

function readSource(p: string): string {
  return fs.readFileSync(path.join(process.cwd(), p), "utf-8")
}

describe("G2.2 — opções visíveis = comportamentos reais", () => {
  it("1. Melodia 1 liga (primeira ambiente se desligado, sem sobrescrever)", () => {
    assert.equal(focusSoundIdForModalPreference("Melodia 1", "off"), "rain")
    assert.equal(focusSoundIdForModalPreference("Melodia 1", "cafe"), null)
  })

  it("2. Sino legado normaliza para Melodia 1 (funciona, sem quebrar)", () => {
    assert.equal(normalizeTimerSoundOption("Sino"), "Melodia 1")
    assert.equal(focusSoundIdForModalPreference("Sino", "off"), "rain")
    assert.equal(focusSoundIdForModalPreference("Sino", "waves"), null)
  })

  it("3. fallback de valores antigos/corrompidos é determinístico", () => {
    for (const v of ["Melodia 7", "", null, undefined, 42, {}]) {
      assert.equal(normalizeTimerSoundOption(v), "Melodia 1")
    }
  })

  it("4. Silencioso desliga de qualquer estado", () => {
    assert.equal(normalizeTimerSoundOption("Silencioso"), "Silencioso")
    assert.equal(focusSoundIdForModalPreference("Silencioso", "rain"), "off")
    assert.equal(focusSoundIdForModalPreference("Silencioso", "off"), "off")
  })

  it("5. valor desconhecido nunca gera erro nem ID inventado", () => {
    const valid = ["off", "rain", "library", "cafe", "waves", "fireplace", "brown_noise", "pink_noise", "white_noise"]
    for (const v of ["Sino", "x", null]) {
      const mapped = focusSoundIdForModalPreference(v, "off")
      assert.ok(mapped === null || valid.includes(mapped), `mapeamento válido para ${JSON.stringify(v)}`)
    }
  })

  it("6/7. provider aplica via API existente; timer usa o player atual", () => {
    const provider = readSource("src/features/study-session/components/study-provider.tsx")
    assert.ok(provider.includes("focusSound.selectSound(target)"), "sem player novo")
    assert.ok(provider.includes("TIMER_SOUND_PREFERENCE_EVENT"))
    const hook = readSource("src/features/study-session/hooks/use-focus-sound.ts")
    assert.equal(hook.includes("new Audio("), false, "WebAudio sintetizado, sem assets")
  })

  it("8. UI sem opção fantasma e sem crash (leitura normalizada)", () => {
    const modal = readSource("src/features/profile/components/account-settings-modal.tsx")
    assert.equal(modal.includes('<option value="Sino">'), false, "Sino fora da UI")
    assert.ok(modal.includes('<option value="Melodia 1">'), "Melodia 1 presente")
    assert.ok(modal.includes('<option value="Silencioso">'), "Silencioso presente")
    assert.ok(modal.includes("normalizeTimerSoundOption("), "leitura normalizada")
    assert.deepEqual([...TIMER_SOUND_OPTIONS], ["Melodia 1", "Silencioso"])
  })
})
