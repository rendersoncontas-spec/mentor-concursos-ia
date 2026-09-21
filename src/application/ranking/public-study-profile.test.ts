import assert from "node:assert/strict"
import { test } from "node:test"

import { computeStreaksFromDates, getRelativeDateLabel } from "./public-study-profile.utils"

test("computeStreaksFromDates: retorna 0 para lista vazia de datas", () => {
  const res = computeStreaksFromDates([])
  assert.deepEqual(res, { currentStreak: 0, longestStreak: 0 })
})

test("computeStreaksFromDates: calcula streak consecutivo para datas contínuas", () => {
  const dates = [
    "2026-08-10T10:00:00Z",
    "2026-08-11T12:00:00Z",
    "2026-08-12T14:00:00Z",
    "2026-08-13T16:00:00Z",
  ]
  const res = computeStreaksFromDates(dates)
  assert.equal(res.longestStreak, 4)
})

test("computeStreaksFromDates: identifica lacuna e calcula maior sequência histórica", () => {
  const dates = [
    "2026-08-01T10:00:00Z",
    "2026-08-02T10:00:00Z",
    "2026-08-05T10:00:00Z",
    "2026-08-06T10:00:00Z",
    "2026-08-07T10:00:00Z",
  ]
  const res = computeStreaksFromDates(dates)
  assert.equal(res.longestStreak, 3)
})

test("computeStreaksFromDates: lida com múltiplas sessões no mesmo dia sem inflar o streak", () => {
  const dates = [
    "2026-08-01T08:00:00Z",
    "2026-08-01T14:00:00Z",
    "2026-08-01T20:00:00Z",
    "2026-08-02T09:00:00Z",
  ]
  const res = computeStreaksFromDates(dates)
  assert.equal(res.longestStreak, 2)
})

/**
 * Fase 5 da auditoria de estabilização (timezone): testes de borda para o
 * bug corrigido em computeStreaksFromDates/getRelativeDateLabel (perfil
 * público de estudo, visível a outros usuários no ranking). Antes, uma
 * sessão estudada às ~22h em São Paulo (madrugada em UTC) era bucketada no
 * dia seguinte, o que podia fazer o streak público aparecer quebrado ou
 * inflado incorretamente. Os parâmetros `todayKey` explícitos abaixo
 * tornam o teste determinístico, sem depender do relógio real do sistema.
 */
test("computeStreaksFromDates: sessão às 22h em SP (01h UTC do dia seguinte) conta no dia correto (SP), não em UTC", () => {
  // 2026-08-27T01:00:00Z = 2026-08-26T22:00:00-03:00 — dia 26 em SP.
  const dates = ["2026-08-27T01:00:00.000Z"]
  const res = computeStreaksFromDates(dates, "2026-08-26")
  assert.equal(res.currentStreak, 1)
})

test("computeStreaksFromDates: sequência viva ao considerar 'ontem' corretamente em SP na virada de mês", () => {
  // Sessão às 22h de 31/08 em SP (01h UTC de 01/09) — ainda dia 31/08 em SP.
  const dates = ["2026-09-01T01:00:00.000Z"]
  const res = computeStreaksFromDates(dates, "2026-09-01")
  assert.equal(res.currentStreak, 1)
})

test("getRelativeDateLabel: rótulo 'Hoje'/'Ontem' respeita o dia em SP, não o dia em UTC", () => {
  // 2026-08-27T01:00:00Z = 2026-08-26T22:00:00-03:00 — ainda dia 26 em SP.
  assert.equal(getRelativeDateLabel("2026-08-27T01:00:00.000Z", "2026-08-26"), "Hoje")
  assert.equal(getRelativeDateLabel("2026-08-27T01:00:00.000Z", "2026-08-27"), "Ontem")
})
