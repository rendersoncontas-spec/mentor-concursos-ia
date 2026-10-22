import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  chipColors,
  compositeOver,
  contrastRatio,
  NEUTRAL_CHIP_COLOR,
  parseHexColor,
  readableTextOn,
  relativeLuminance,
  WCAG_AA_NORMAL,
} from "./contrast"

// G2.24 — chips com a cor escolhida pelo usuário: texto legível (WCAG 4,5:1).

describe("parseHexColor", () => {
  it("lê #rgb, #rgba, #rrggbb e #rrggbbaa (maiúsculas/minúsculas, com espaços)", () => {
    assert.deepEqual(parseHexColor("#fff"), { r: 255, g: 255, b: 255, a: 1 })
    assert.deepEqual(parseHexColor("  #0A0 "), { r: 0, g: 170, b: 0, a: 1 })
    assert.deepEqual(parseHexColor("#112233"), { r: 17, g: 34, b: 51, a: 1 })
    assert.equal(parseHexColor("#11223380")?.a, 128 / 255)
    assert.equal(parseHexColor("#f008")?.a, 0x88 / 255)
  })

  it("entradas inválidas → null, sem lançar", () => {
    for (const bad of ["", "red", "#12", "#12345", "#1234567", "#gggggg", "rgb(1,2,3)", "ffffff", null, undefined, 123, {}]) {
      assert.equal(parseHexColor(bad), null, String(bad))
    }
  })
})

describe("luminância e razão de contraste (valores de referência WCAG)", () => {
  it("branco × preto = 21:1; cor × ela mesma = 1:1", () => {
    const white = relativeLuminance({ r: 255, g: 255, b: 255 })
    const black = relativeLuminance({ r: 0, g: 0, b: 0 })
    assert.equal(white, 1)
    assert.equal(black, 0)
    assert.equal(contrastRatio(white, black), 21)
    assert.equal(contrastRatio(white, white), 1)
    assert.equal(contrastRatio(black, white), 21, "ordem não importa")
  })

  it("cinza #767676 sobre branco ≈ 4,54:1 (o limite clássico do AA)", () => {
    const l = relativeLuminance({ r: 0x76, g: 0x76, b: 0x76 })
    const ratio = contrastRatio(1, l)
    assert.ok(ratio > 4.5 && ratio < 4.6, String(ratio))
  })
})

describe("readableTextOn — escolhe o texto de maior contraste", () => {
  it("fundo branco → texto escuro; fundo preto → texto claro", () => {
    const onWhite = readableTextOn("#ffffff")
    assert.notEqual(onWhite.color, "#ffffff")
    assert.ok(onWhite.ratio >= 15 && onWhite.meetsTarget)
    const onBlack = readableTextOn("#000000")
    assert.equal(onBlack.color, "#ffffff")
    assert.equal(onBlack.ratio, 21)
  })

  it("cores claras (âmbar, lima, ciano, amarelo) → texto escuro; escuras (azul-marinho, vinho) → texto claro", () => {
    for (const light of ["#f59e0b", "#84cc16", "#06b6d4", "#fde047", "#bbf7d0"]) {
      const r = readableTextOn(light)
      assert.notEqual(r.color, "#ffffff", `${light} deveria usar texto escuro`)
      assert.ok(r.meetsTarget, light)
    }
    for (const dark of ["#1e3a8a", "#7f1d1d", "#312e81", "#065f46", "#334155"]) {
      const r = readableTextOn(dark)
      assert.equal(r.color, "#ffffff", `${dark} deveria usar texto claro`)
      assert.ok(r.meetsTarget, dark)
    }
  })

  it("os verdes/rosas que falhavam no axe (#16a34a com branco = 3,29:1) agora passam", () => {
    const before = contrastRatio(1, relativeLuminance({ r: 0x16, g: 0xa3, b: 0x4a }))
    assert.ok(before < WCAG_AA_NORMAL, `antes: ${before}`)
    for (const c of ["#16a34a", "#22c55e", "#10b981", "#f43f5e", "#ef4444", "#f97316", "#0ea5e9"]) {
      assert.ok(readableTextOn(c).meetsTarget, c)
    }
  })

  it("tons intermediários: se o escuro preferido não alcança 4,5:1, usa preto/branco puro", () => {
    // Em #808080 o slate-900 passa de 4,5:1 por pouco; em tons próximos do ponto de cruzamento
    // (luminância ≈ 0,19) o escuro preferido NÃO alcança. A função nunca devolve algo abaixo da meta.
    for (const mid of ["#7a7a7a", "#808080", "#858585", "#8a8a8a", "#6b7280", "#64748b"]) {
      const r = readableTextOn(mid)
      assert.ok(r.meetsTarget, `${mid}: ${r.ratio}`)
      assert.ok(r.ratio >= WCAG_AA_NORMAL)
    }
  })

  it("varredura: qualquer cor opaca (grade RGB de 17 passos) alcança 4,5:1", () => {
    let worst = Infinity
    const step = 17
    for (let r = 0; r <= 255; r += step)
      for (let g = 0; g <= 255; g += step)
        for (let b = 0; b <= 255; b += step) {
          const hex = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")
          const res = readableTextOn(hex)
          worst = Math.min(worst, res.ratio)
          assert.ok(res.meetsTarget, `${hex}: ${res.ratio}`)
        }
    assert.ok(worst >= WCAG_AA_NORMAL, String(worst))
  })

  it("já contrastante: cor escura com texto claro não é trocada; meta customizada (AAA 7:1) é respeitada", () => {
    assert.equal(readableTextOn("#1e293b").color, "#ffffff")
    const aaa = readableTextOn("#475569", { target: 7 })
    assert.ok(aaa.ratio >= 7 || !aaa.meetsTarget)
    assert.equal(aaa.meetsTarget, aaa.ratio >= 7)
  })

  it("entrada inválida: calcula sobre o neutro do sistema (nunca lança, nunca devolve vazio)", () => {
    const r = readableTextOn("not-a-color")
    const neutral = readableTextOn(NEUTRAL_CHIP_COLOR)
    assert.deepEqual(r, neutral)
    assert.ok(r.color.startsWith("#"))
  })
})

describe("transparência (alpha) — compõe sobre o fundo informado", () => {
  it("compositeOver mistura com o fundo", () => {
    assert.deepEqual(compositeOver({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255 }), { r: 128, g: 128, b: 128 })
    assert.deepEqual(compositeOver({ r: 10, g: 20, b: 30, a: 1 }, { r: 255, g: 255, b: 255 }), { r: 10, g: 20, b: 30 })
    assert.deepEqual(compositeOver({ r: 10, g: 20, b: 30, a: 0 }, { r: 1, g: 2, b: 3 }), { r: 1, g: 2, b: 3 })
  })

  it("preto a 20% sobre branco é cinza claro → texto escuro; sobre fundo escuro → texto claro", () => {
    assert.notEqual(readableTextOn("#00000033").color, "#ffffff")
    assert.equal(readableTextOn("#ffffff33", { backdrop: "#111111" }).color, "#ffffff")
    assert.ok(readableTextOn("#ff000080", { backdrop: "#1a1d23" }).meetsTarget)
  })
})

describe("chipColors — par fundo/texto para o chip (a cor salva não muda)", () => {
  it("cor válida é mantida como fundo (aparada), com texto legível", () => {
    const c = chipColors("  #f59e0b ")
    assert.equal(c.background, "#f59e0b")
    assert.ok(c.ratio >= WCAG_AA_NORMAL)
    assert.notEqual(c.color, "#ffffff")
  })

  it("cor inválida/ausente vira o neutro do sistema, não um fundo transparente", () => {
    for (const bad of [null, undefined, "", "azul", "#zzz"]) {
      const c = chipColors(bad)
      assert.equal(c.background, NEUTRAL_CHIP_COLOR)
      assert.ok(c.ratio >= WCAG_AA_NORMAL)
    }
  })
})
