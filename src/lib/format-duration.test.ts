import { describe, it } from "node:test"
import assert from "node:assert/strict"

import { formatDuration, formatDurationMinutes } from "./format-duration"

describe("formatDuration (unidade: segundos)", () => {
  it("0 segundos -> 0min", () => {
    assert.equal(formatDuration(0), "0min")
  })

  it("45 segundos -> 45s", () => {
    assert.equal(formatDuration(45), "45s")
  })

  it("60 segundos -> 1m", () => {
    assert.equal(formatDuration(60), "1m")
  })

  it("90 segundos -> 1m30s", () => {
    assert.equal(formatDuration(90), "1m30s")
  })

  it("600 segundos -> 10m", () => {
    assert.equal(formatDuration(600), "10m")
  })

  it("3600 segundos -> 1h", () => {
    assert.equal(formatDuration(3600), "1h")
  })

  it("3660 segundos -> 1h01m", () => {
    assert.equal(formatDuration(3660), "1h01m")
  })

  it("5400 segundos -> 1h30m", () => {
    assert.equal(formatDuration(5400), "1h30m")
  })

  it("21293 segundos -> 5h54m53s", () => {
    assert.equal(formatDuration(21293), "5h54m53s")
  })

  it("nunca deixa vazar casas decimais (arredonda segundos fracionários)", () => {
    assert.equal(formatDuration(89.6), "1m30s")
    assert.equal(formatDuration(3659.9), "1h01m")
  })

  it("nunca produz número negativo (clampa em zero)", () => {
    assert.equal(formatDuration(-42), "0min")
  })
})

describe("formatDurationMinutes (unidade: minutos, pode ser fracionário)", () => {
  it("234.8666666666667 min (fonte real do bug relatado) -> 3h55m, sem casas decimais", () => {
    const result = formatDurationMinutes(234.8666666666667)
    assert.equal(result, "3h55m")
    assert.doesNotMatch(result, /\./)
    assert.doesNotMatch(result, /,/)
  })

  it("305.1333333333333 min (fonte real do bug relatado) -> 5h05m, sem casas decimais", () => {
    const result = formatDurationMinutes(305.1333333333333)
    assert.equal(result, "5h05m")
    assert.doesNotMatch(result, /\./)
  })

  it("523.9833333333335 min (fonte real do bug relatado) -> 8h44m, sem casas decimais", () => {
    const result = formatDurationMinutes(523.9833333333335)
    assert.equal(result, "8h44m")
    assert.doesNotMatch(result, /\./)
  })

  it("nunca mistura convenções: nunca contém espaço, vírgula decimal ou ponto decimal", () => {
    const samples = [0, 1, 30, 59, 60, 90, 234.8667, 305.1333, 523.9833, 3600]
    for (const minutes of samples) {
      const result = formatDurationMinutes(minutes)
      assert.doesNotMatch(result, /\s/, `formatDurationMinutes(${minutes}) = "${result}" não deve conter espaços`)
      assert.doesNotMatch(result, /[.,]/, `formatDurationMinutes(${minutes}) = "${result}" não deve conter casas decimais`)
    }
  })

  it("0 minutos -> 0min", () => {
    assert.equal(formatDurationMinutes(0), "0min")
  })
})
