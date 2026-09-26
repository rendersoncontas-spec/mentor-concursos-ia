// ============================================================================
// Fase I.9 — FECHAMENTO VISUAL DOS DATA ISSUES DO DASHBOARD.
//
// A Fase I.8 corrigiu a camada de DADOS do Dashboard (dashboard.service.ts
// agora produz `snapshot.dataIssues`, distinguindo falha de leitura de
// ausência real) mas deixou 6 widgets sem consumir essa informação na
// apresentação: WidgetDesempenho, WidgetQuestoes, WidgetMetasEstudo,
// WidgetDesempenhoMateria, WidgetRanking e WidgetConquistas. Esta fase fecha
// essa lacuna — só na camada visual, sem tocar em FSRS/Revisões/Cycle
// Engine/banco/fórmulas de analytics ou ranking/cache/arquitetura principal
// do Dashboard.
//
// Como em toda fase anterior sobre este catálogo de widgets: não há harness
// de teste de componente React neste projeto (o runner é `node:test` puro,
// sem jsdom/React Testing Library). Por isso este é um teste de FIAÇÃO
// (wiring/static): lê o CÓDIGO-FONTE do widget como texto e garante que ele
// referencia a flag certa de `dataIssues`, tem o ramo condicional certo, e
// não está mais em condições de exibir um número fabricado (0/vazio) como se
// fosse um dado real quando a leitura de origem falhou. Não é um teste
// visual de verdade — essa limitação está documentada no relatório final da
// fase, exatamente como nas fases I.7/I.8.
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

// ─────────────────────────────────────────────────────────────────────────
// WidgetDesempenho
// ─────────────────────────────────────────────────────────────────────────
describe("Fase I.9 — WidgetDesempenho distingue leitura indisponível de desempenho real zerado", () => {
  const body = widgetBody("WidgetDesempenho")

  it("combina dataIssues.history e dataIssues.attempts num único flag (ambos alimentam o mesmo número)", () => {
    assert.match(
      body,
      /desempenhoUnavailable =\s*\n?\s*snapshot\?\.dataIssues\?\.history === true \|\| snapshot\?\.dataIssues\?\.attempts === true/,
    )
  })

  it("acurácia/total/acertos/erros viram — quando indisponível, nunca um número calculado", () => {
    assert.match(body, /accuracyText = desempenhoUnavailable \? "—" : percentOrDash/)
    assert.match(body, /totalDisplay = desempenhoUnavailable \? "—" : total/)
    assert.match(body, /correctDisplay = desempenhoUnavailable \? "—" : correct/)
    assert.match(body, /wrongDisplay = desempenhoUnavailable \? "—" : wrong/)
  })

  it("o ranking de matérias por tempo (mesma leitura de histórico) some quando indisponível, em vez de mostrar um ranking vazio real", () => {
    assert.match(
      body,
      /disciplineRanking = desempenhoUnavailable \? \[\] : snapshot\?\.analytics\?\.rankings\?\.disciplines \|\| \[\]/,
    )
  })

  it("os textos exibidos usam as variáveis *Display, não os números brutos", () => {
    assert.match(body, /\{totalDisplay\}/)
    assert.match(body, /\{correctDisplay\}/)
    assert.match(body, /\{wrongDisplay\}/)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// WidgetQuestoes (o mais sensível: tem o fallback cruzado via rawDisciplines)
// ─────────────────────────────────────────────────────────────────────────
describe("Fase I.9 — WidgetQuestoes não confirma um zero fabricado com o fallback de rawDisciplines", () => {
  const body = widgetBody("WidgetQuestoes")

  it("tem um flag para a leitura de questões (history/attempts) e outro para a meta (profile)", () => {
    assert.match(
      body,
      /questoesUnavailable =\s*\n?\s*snapshot\?\.dataIssues\?\.history === true \|\| snapshot\?\.dataIssues\?\.attempts === true/,
    )
    assert.match(body, /metaUnavailable = snapshot\?\.dataIssues\?\.profile === true/)
  })

  it("o fallback cruzado (soma de rawDisciplines) só roda quando a fonte principal NÃO falhou", () => {
    // O bloco `if (... correct === 0 && wrong === 0 && rawDisciplines...)` tem
    // que estar condicionado por `!questoesUnavailable &&` — sem isso, o
    // widget "confirmaria" um zero fabricado usando dados derivados da MESMA
    // leitura quebrada (rawDisciplines.correctCount/wrongCount vêm de
    // attempts+rawHistory em dashboard.service.ts).
    const ifIdx = body.indexOf("if (\n    !questoesUnavailable &&\n    correct === 0")
    assert.ok(ifIdx > 0, "o fallback cruzado não está gated por !questoesUnavailable")
  })

  it("achieved/correct/wrong/aproveitamento/meta viram texto de indisponibilidade, não um número", () => {
    assert.match(body, /achievedDisplay = questoesUnavailable \? "—" : achieved/)
    assert.match(body, /correctDisplay = questoesUnavailable \? "—" : correct/)
    assert.match(body, /wrongDisplay = questoesUnavailable \? "—" : wrong/)
    assert.match(body, /targetDisplay = metaUnavailable \? "indisponível" : target !== null \? target : "—"/)
  })

  it("o cabeçalho mostra 'Indisponível' distinto de 'Livre' (sem meta real) nas duas variantes de colSpan", () => {
    const occurrences = body.match(/questoesUnavailable \|\| metaUnavailable \?/g) || []
    assert.ok(occurrences.length >= 2, "esperado pelo menos 2 ramos condicionais no cabeçalho (colSpan 1 e outros)")
    assert.match(body, />\s*Indisponível\s*</)
    assert.match(body, />\s*Livre\s*</)
  })

  it("realPct/diff ficam null quando indisponível (barra de progresso não avança com dado fabricado)", () => {
    assert.match(body, /!questoesUnavailable && !metaUnavailable && target && target > 0/)
    assert.match(body, /!questoesUnavailable && !metaUnavailable && target !== null \? achieved - target : null/)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// WidgetMetasEstudo
// ─────────────────────────────────────────────────────────────────────────
describe("Fase I.9 — WidgetMetasEstudo distingue 'sem meta configurada' de 'meta indisponível'", () => {
  const body = widgetBody("WidgetMetasEstudo")

  it("cada uma das 3 metas cruza a leitura certa de perfil/histórico/attempts", () => {
    assert.match(body, /hoursUnavailable = profileFailed \|\| historyFailed/)
    assert.match(body, /questionsUnavailable = profileFailed \|\| historyFailed \|\| attemptsFailed/)
    assert.match(body, /daysUnavailable = profileFailed \|\| historyFailed/)
  })

  it("o texto usa 'indisponível' quando a leitura falhou, e '—' só para ausência real (target null)", () => {
    assert.match(body, /hoursText = hoursUnavailable \? "indisponível" : hoursPct === null \? "—" : `\$\{hoursPct\}%`/)
    assert.match(body, /qText = questionsUnavailable \? "indisponível" : qPct === null \? "—" : `\$\{qPct\}%`/)
    assert.match(body, /daysText = daysUnavailable \? "indisponível" : daysPct === null \? "—" : `\$\{daysPct\}%`/)
  })

  it("as 3 linhas de progresso exibem as variáveis *Text, não o cálculo bruto de percentage", () => {
    assert.match(body, /\{hoursText\}/)
    assert.match(body, /\{qText\}/)
    assert.match(body, /\{daysText\}/)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// WidgetDesempenhoMateria
// ─────────────────────────────────────────────────────────────────────────
describe("Fase I.9 — WidgetDesempenhoMateria separa falha da lista de matérias de falha dos números por matéria", () => {
  const body = widgetBody("WidgetDesempenhoMateria")

  it("lê dataIssues.disciplines para a lista e dataIssues.history/attempts para os números", () => {
    assert.match(body, /disciplinesUnavailable = snapshot\?\.dataIssues\?\.disciplines === true/)
    assert.match(
      body,
      /statsUnavailable =\s*\n?\s*snapshot\?\.dataIssues\?\.history === true \|\| snapshot\?\.dataIssues\?\.attempts === true/,
    )
  })

  it("a mensagem de lista vazia distingue ausência real de falha de leitura", () => {
    assert.match(body, /disciplinesUnavailable\s*\n\s*\? "Não foi possível carregar suas matérias agora\."\s*\n\s*: "Nenhuma matéria disponível ainda\."/)
  })

  it("o rótulo por linha distingue 'sem questões' (real) de 'indisponível' (falha), sem inventar novo dado por linha", () => {
    assert.match(body, /accuracy = !statsUnavailable && answered > 0 \? disc\.accuracyPercentage : null/)
    assert.match(body, /\{statsUnavailable \? "Indisponível" : "Sem questões"\}/)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// WidgetRanking
// ─────────────────────────────────────────────────────────────────────────
describe("Fase I.9 — WidgetRanking (matérias por tempo) distingue indisponibilidade de ranking vazio real", () => {
  const body = widgetBody("WidgetRanking")

  it("depende de dataIssues.history — a métrica real deste widget (não do ranking global de usuários da Fase I.8)", () => {
    assert.match(body, /rankingUnavailable = snapshot\?\.dataIssues\?\.history === true/)
    assert.match(body, /ranking = rankingUnavailable \? \[\] : snapshot\?\.analytics\?\.rankings\?\.disciplines \|\| \[\]/)
  })

  it("mostra uma mensagem distinta de 'sem dados suficientes' quando a leitura falhou", () => {
    assert.match(body, /"Ranking indisponível no momento\."/)
    assert.match(body, /"Sem dados suficientes para o ranking\."/)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// WidgetConquistas
// ─────────────────────────────────────────────────────────────────────────
describe("Fase I.9 — WidgetConquistas não calcula marcos bloqueados a partir de dados indisponíveis", () => {
  const body = widgetBody("WidgetConquistas")

  it("totalMinutes/consecutiveStreak (history) e totalQuestions (history+attempts) — flag combinado", () => {
    assert.match(
      body,
      /conquistasUnavailable =\s*\n?\s*snapshot\?\.dataIssues\?\.history === true \|\| snapshot\?\.dataIssues\?\.attempts === true/,
    )
  })

  it("não chama dashboardMilestones com números fabricados quando indisponível", () => {
    assert.match(body, /badges = conquistasUnavailable\s*\n\s*\? \[\]\s*\n\s*: dashboardMilestones\(/)
  })

  it("cabeçalho e corpo mostram um estado distinto de 'todas as conquistas bloqueadas'", () => {
    assert.match(body, /conquistasUnavailable \? "—" : `\$\{badges\.filter/)
    assert.match(body, /Não foi possível carregar suas conquistas agora\./)
  })
})
