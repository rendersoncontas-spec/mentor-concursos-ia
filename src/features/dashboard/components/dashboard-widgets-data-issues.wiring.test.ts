// ============================================================================
// Fase I.8 — os widgets do Dashboard que exibem um número isolado (tempo de
// estudo, constância/streak, progresso no edital, últimas atividades, data da
// prova) agora precisam mostrar "indisponível", não um zero/vazio que parece
// real, quando a leitura correspondente falhou (`snapshot.dataIssues`).
//
// Não há harness de teste de componente React neste projeto (o runner é
// `node:test` puro, sem jsdom/RTL) — por isso, como em outras fases, isto é um
// teste de fiação: garante que o CÓDIGO-FONTE dos widgets realmente lê a flag
// certa e realmente distingue as duas mensagens, e não apenas "parece certo".
// A classificação de erro em si (o que population `dataIssues`) já tem teste
// comportamental de verdade em dashboard-read-outcome.test.ts.
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const source = readFileSync("src/features/dashboard/components/dashboard-widget-catalog.tsx", "utf8")

function widgetBody(name: string): string {
  const start = source.indexOf(`export function ${name}(`)
  assert.ok(start > 0, `widget ${name} não encontrado`)
  const nextExport = source.indexOf("\nexport function ", start + 1)
  return source.slice(start, nextExport > 0 ? nextExport : undefined)
}

describe("Fase I.8 — WidgetTempoEstudo distingue falha de histórico de 0 minutos reais", () => {
  const body = widgetBody("WidgetTempoEstudo")
  it("lê dataIssues.history", () => {
    assert.match(body, /snapshot\?\.dataIssues\?\.history === true/)
  })
  it("mostra — em vez do tempo quando indisponível", () => {
    assert.match(body, /dailyDisplay = historyUnavailable \? "—" : formatDurationMinutes\(dailyMins\)/)
    assert.match(body, /weeklyDisplay = historyUnavailable \? "—" : formatDurationMinutes\(weeklyMins\)/)
  })
})

describe("Fase I.8 — WidgetConstancia distingue falha de histórico de sequência zerada real", () => {
  const body = widgetBody("WidgetConstancia")
  it("lê dataIssues.history e não mostra 0 dias como se fosse uma sequência real quebrada", () => {
    assert.match(body, /snapshot\?\.dataIssues\?\.history === true/)
    assert.match(body, /streakBadge = historyUnavailable \? "—"/)
    assert.match(body, /streakConsecutiveLabel = historyUnavailable \? "—"/)
  })
})

describe("Fase I.8 — WidgetProgressoEdital distingue falha de disciplinas de edital vazio real", () => {
  const body = widgetBody("WidgetProgressoEdital")
  it("lê dataIssues.disciplines", () => {
    assert.match(body, /snapshot\?\.dataIssues\?\.disciplines === true/)
  })
  it("badges e barra de progresso usam o fallback seguro só quando indisponível", () => {
    assert.match(body, /progressBadge = disciplinesUnavailable \? "—"/)
    assert.match(body, /progressBarPct = disciplinesUnavailable \? 0 : progress/)
  })
})

describe("Fase I.8 — WidgetUltimasAtividades distingue falha de lista vazia real", () => {
  const body = widgetBody("WidgetUltimasAtividades")
  it("lê dataIssues.activities e mostra uma mensagem diferente da de lista genuinamente vazia", () => {
    assert.match(body, /snapshot\?\.dataIssues\?\.activities === true/)
    assert.match(body, /Não foi possível carregar suas atividades recentes agora\./)
    assert.match(body, /Nenhuma atividade registrada recentemente\./)
  })
})

describe("Fase I.8 — WidgetDataProva distingue falha de leitura de \"sem prova cadastrada\" real", () => {
  const body = widgetBody("WidgetDataProva")
  it("lê dataIssues.target e mostra uma mensagem diferente da de ausência real de meta", () => {
    assert.match(body, /snapshot\?\.dataIssues\?\.target === true/)
    assert.match(body, /Não foi possível carregar sua prova agora\./)
    assert.match(body, /Nenhuma prova cadastrada\./)
  })
})
