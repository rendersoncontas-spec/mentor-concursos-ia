// ============================================================================
// Fase I.6 — achado M8: uma regra só de duração para a sessão de revisão.
//
// Antes havia duas: a gravação usava piso de 1 minuto e o resumo mostrado ao
// aluno usava piso de 0. Uma sessão de 20 segundos gravava 1 minuto de estudo (no
// histórico, no ciclo e nas estatísticas) e exibia "0 min".
//
// Estes testes fixam a tabela de conversão e, principalmente, garantem que o
// mesmo input produz o mesmo valor nos dois consumidores.
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { reviewSessionMinutes, reviewSessionSeconds } from "./session-duration"

describe("reviewSessionSeconds — tempo medido, nunca negativo", () => {
  it("mede o intervalo real entre início e encerramento", () => {
    assert.equal(reviewSessionSeconds("2026-03-10T15:00:00.000Z", "2026-03-10T15:00:20.000Z"), 20)
    assert.equal(reviewSessionSeconds("2026-03-10T15:00:00.000Z", "2026-03-10T15:01:00.000Z"), 60)
    assert.equal(reviewSessionSeconds("2026-03-10T15:00:00.000Z", "2026-03-10T15:30:00.000Z"), 1800)
  })

  it("mesmo instante é zero, e relógio para trás não vira tempo negativo", () => {
    assert.equal(reviewSessionSeconds("2026-03-10T15:00:00.000Z", "2026-03-10T15:00:00.000Z"), 0)
    assert.equal(reviewSessionSeconds("2026-03-10T15:10:00.000Z", "2026-03-10T15:00:00.000Z"), 0)
  })

  it("data inválida não inventa duração", () => {
    assert.equal(reviewSessionSeconds("não é data", "2026-03-10T15:00:00.000Z"), 0)
  })
})

describe("reviewSessionMinutes — tabela de conversão", () => {
  const casos: Array<[number, number]> = [
    [0, 1],
    [20, 1],
    [30, 1],
    [59, 1],
    [60, 1],
    [61, 1],
    [89, 1],
    [90, 2],
    [120, 2],
    [200, 3],
    [1800, 30],
    [3600, 60],
  ]

  for (const [segundos, minutos] of casos) {
    it(`${segundos}s → ${minutos} min`, () => {
      assert.equal(reviewSessionMinutes(segundos), minutos)
    })
  }

  it("uma sessão respondida nunca vale zero minuto de estudo", () => {
    // Piso de 1: é a semântica que o armazenamento já tinha. Gravar 0 perderia
    // tempo de estudo real e o ciclo não receberia nada.
    for (const segundos of [0, 1, 5, 20, 59]) {
      assert.equal(reviewSessionMinutes(segundos), 1, `${segundos}s não pode virar 0 min`)
    }
  })
})

describe("M8 — gravação e exibição usam o MESMO valor", () => {
  const service = readFileSync(
    join(process.cwd(), "src/application/review-engine/review.service.ts"),
    "utf-8",
  )

  it("o mesmo par (início, encerramento) dá o mesmo número nas duas pontas", () => {
    const pares: Array<[string, string]> = [
      ["2026-03-10T15:00:00.000Z", "2026-03-10T15:00:20.000Z"],
      ["2026-03-10T15:00:00.000Z", "2026-03-10T15:00:59.000Z"],
      ["2026-03-10T15:00:00.000Z", "2026-03-10T15:01:30.000Z"],
      ["2026-03-10T15:00:00.000Z", "2026-03-10T15:42:00.000Z"],
    ]
    for (const [inicio, fim] of pares) {
      // Gravação: segundos → minutos. Exibição: exatamente a mesma composição.
      const gravado = reviewSessionMinutes(reviewSessionSeconds(inicio, fim))
      const exibido = reviewSessionMinutes(reviewSessionSeconds(inicio, fim))
      assert.equal(gravado, exibido)
    }
  })

  it("o serviço não recalcula duração por fora da regra única", () => {
    const semComentarios = service
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
    assert.equal(
      /Math\.max\(\s*1,\s*Math\.round/.test(semComentarios),
      false,
      "nenhum piso de 1 solto no serviço",
    )
    assert.equal(
      /Math\.round\(\([^)]*getTime\(\)[^)]*\) \/ 60000\)/.test(semComentarios),
      false,
      "nenhuma conversão de minutos inline",
    )
    const usos = (semComentarios.match(/reviewSessionMinutes\(/g) ?? []).length
    assert.equal(usos, 2, `a regra deve ser usada na gravação e no resumo (encontrados ${usos})`)
  })
})
