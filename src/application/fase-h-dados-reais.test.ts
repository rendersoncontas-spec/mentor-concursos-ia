import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

import {
  computeAttentionScore,
  computeProductivity,
  computeRevisionStatistics,
  type DisciplineMeta,
  type QuestionStatistics,
  type ReviewItemRow,
  type SessionRecord,
} from "@/application/study-analytics/engine/stats-engine"
import { getWeeklyGoalProgress, getDailyGoalProgress } from "@/application/study-analytics/goals"
import { AnalyticsEngine } from "@/application/study-analytics/study-analytics.service"
import type { StudyHistory } from "@/domain/study-history/study-history.types"
import {
  dailyBars,
  dashboardMilestones,
  lastSevenDaysActivity,
  percentOrDash,
  weekdayShortOf,
} from "@/features/dashboard/lib/widget-display"
import { must } from "@/lib/testing/must"

/**
 * Fase H — nenhum número/texto apresentado como do aluno pode ser fixo,
 * exemplo ou fallback inventado. Testes de comportamento (o valor vem da fonte
 * real, muda quando a entrada muda, e sem base vira "—"/null) + guardas de
 * código contra a volta dos valores fixos removidos.
 */

const ROOT = process.cwd()
function src(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf-8")
}
/** Código sem comentários, para as guardas não pegarem a explicação da correção. */
function code(relative: string): string {
  return src(relative)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
}

// ─── Dashboard: regras de exibição ───────────────────────────────────────────

describe("Dashboard — widget-display", () => {
  it("percentOrDash: sem base → '—' (nunca '0%')", () => {
    assert.equal(percentOrDash(0, false), "—")
    assert.equal(percentOrDash(null), "—")
    assert.equal(percentOrDash(undefined), "—")
    assert.equal(percentOrDash(0, true), "0%")
    assert.equal(percentOrDash(73), "73%")
  })

  it("dailyBars: rótulo = dia real de cada ponto (não DOM→SÁB fixo)", () => {
    // 2026-09-24 é quinta-feira; os 7 pontos terminam hoje.
    const evolution = ["18", "19", "20", "21", "22", "23", "24"].map((d, i) => ({
      date: `2026-09-${d}`,
      value: i * 30,
    }))
    const bars = dailyBars(evolution)
    assert.deepEqual(
      bars.map((b) => b.label),
      ["SEX", "SÁB", "DOM", "SEG", "TER", "QUA", "QUI"],
    )
    assert.equal(must(bars[6]).minutes, 180)
    // escala: máximo real (180) acima do piso de 120 → a barra maior é 100%
    assert.equal(must(bars[6]).heightPct, 100)
    assert.equal(must(bars[2]).heightPct, Math.round((60 / 180) * 100))
  })

  it("weekdayShortOf não depende do fuso do ambiente", () => {
    assert.equal(weekdayShortOf("2026-09-20"), "DOM")
    assert.equal(weekdayShortOf("2026-09-26"), "SÁB")
    assert.equal(weekdayShortOf(""), "")
  })

  it("lastSevenDaysActivity: verde só nos dias com estudo (a sequência não pinta dias antigos)", () => {
    const heatmap = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-09-${String(i + 1).padStart(2, "0")}`,
      minutes: i >= 28 ? 40 : 0, // estudou só nos 2 últimos dias
      sessions: i >= 28 ? 1 : 0,
      intensity: 0,
    }))
    const dots = lastSevenDaysActivity(heatmap)
    assert.equal(dots.length, 7)
    assert.deepEqual(
      dots.map((d) => d.studied),
      [false, false, false, false, false, true, true],
    )
    // sem histórico: 7 pontos vazios, nenhum verde
    assert.deepEqual(
      lastSevenDaysActivity([]).map((d) => d.studied),
      Array(7).fill(false),
    )
  })

  it("dashboardMilestones: sobre o total (não trancam de novo na semana seguinte)", () => {
    const newWeek = dashboardMilestones({ totalMinutes: 900, currentStreak: 0, totalQuestions: 0 })
    assert.equal(must(newWeek.find((b) => b.title === "Primeiro Estudo")).unlocked, true)
    assert.equal(must(newWeek.find((b) => b.title === "Maratona")).unlocked, true)
    const none = dashboardMilestones({ totalMinutes: 0, currentStreak: 0, totalQuestions: 0 })
    assert.equal(none.filter((b) => b.unlocked).length, 0)
  })

  it("widgets usam as regras (sem `idx < streak`, sem rótulos DOM→SÁB fixos, sem '0%' de campos inexistentes)", () => {
    const catalog = code("src/features/dashboard/components/dashboard-widget-catalog.tsx")
    assert.equal(catalog.includes("idx < streak"), false)
    assert.equal(catalog.includes('["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"].map((day, idx)'), false)
    assert.equal(catalog.includes("item.accuracy || item.percentage || 0"), false)
    assert.equal(catalog.includes("Melhores desempenhos por matéria"), false)
    assert.equal(/\} pts</.test(catalog), false)
    assert.equal(catalog.includes("snapshot?.stats?.weeklyMinutes ?? 0\n\n  const badges"), false)
    assert.ok(catalog.includes("dashboardMilestones({"))
    assert.ok(catalog.includes("totalMinutes: snapshot?.stats?.totalMinutes ?? 0"))
  })
})

// ─── Metas: sem meta não há percentual ───────────────────────────────────────

describe("Metas (AnalyticsEngine.goals)", () => {
  function ctx(minutesToday: number) {
    const history = [
      { id: "h1", started_at: new Date().toISOString(), duration_minutes: minutesToday },
    ] as unknown as StudyHistory[]
    return AnalyticsEngine.createContext(history, 30, "America/Sao_Paulo", 0)
  }

  it("sem meta definida → target/percentage/remaining null (antes 0 → '0%')", () => {
    for (const target of [null, 0]) {
      const w = getWeeklyGoalProgress(ctx(30), target)
      assert.deepEqual([w.target, w.percentage, w.remaining], [null, null, null])
      assert.equal(w.achieved, 30)
      const d = getDailyGoalProgress(ctx(30), target)
      assert.deepEqual([d.target, d.percentage, d.remaining], [null, null, null])
    }
  })

  it("com meta, o percentual muda com os minutos estudados", () => {
    assert.equal(getWeeklyGoalProgress(ctx(60), 10).percentage, 10)
    assert.equal(getWeeklyGoalProgress(ctx(300), 10).percentage, 50)
  })
})

// ─── Estatísticas ────────────────────────────────────────────────────────────

describe("Estatísticas — motor", () => {
  it("atenção: status real STUDYING conta como 'em estudo' (antes só 'EM_ESTUDO')", () => {
    const base = { accuracy: 70, wrong: 0, daysSince: 1, overdue: 0, trendDirection: "STABLE" as const }
    const studying = computeAttentionScore({ ...base, status: "STUDYING" })
    const legacy = computeAttentionScore({ ...base, status: "EM_ESTUDO" })
    const other = computeAttentionScore({ ...base, status: "COMPLETED" })
    assert.equal(studying.score, legacy.score)
    assert.ok(studying.score > other.score)
    assert.ok(studying.reasons.includes("Em estudo mas sem dominar"))
  })

  it("revisões: 'hoje' e 'atrasada' pelo dia de São Paulo (não UTC)", () => {
    // 24/09 22:30 em SP = 25/09 01:30 UTC.
    const now = new Date("2026-09-25T01:30:00Z")
    const items: ReviewItemRow[] = [
      // 24/09 20:00 SP → vence HOJE em SP (em UTC seria "ontem")
      { id: "a", disciplineId: null, status: null, nextReviewAt: "2026-09-24T23:00:00Z" },
      // 25/09 00:30 UTC = 24/09 21:30 SP → também hoje
      { id: "b", disciplineId: null, status: null, nextReviewAt: "2026-09-25T00:30:00Z" },
      // 23/09 SP → atrasada
      { id: "c", disciplineId: null, status: null, nextReviewAt: "2026-09-23T15:00:00Z" },
      // 25/09 12:00 SP → futura
      { id: "d", disciplineId: null, status: null, nextReviewAt: "2026-09-25T15:00:00Z" },
    ]
    const s = computeRevisionStatistics(items, 0, now, new Map<string, DisciplineMeta>())
    assert.equal(s.dueToday, 2)
    assert.equal(s.overdue, 1)
    assert.equal(s.upcoming, 1)
  })

  it("produtividade: pesos informados = pesos usados; sem dado → marcado como ausente", () => {
    const sessions = Array.from({ length: 3 }, (_, i) => ({
      id: `s${i}`,
      durationMinutes: 60,
      activeMinutes: 60,
    })) as unknown as SessionRecord[]
    const few = { total: 2, correct: 1, wrong: 1, accuracy: 50 } as unknown as QuestionStatistics
    const many = { total: 20, correct: 15, wrong: 5, accuracy: 75 } as unknown as QuestionStatistics
    const p1 = computeProductivity(sessions, few, null, 7)
    assert.deepEqual(
      [p1.weights?.activeRatio, p1.weights?.accuracy, p1.weights?.focus, p1.weights?.consistency],
      [40, null, 45, 15],
    )
    assert.equal(p1.weights?.hasAccuracy, false)
    assert.equal(p1.weights?.hasFocus, false)
    const p2 = computeProductivity(sessions, many, 80, 7)
    assert.deepEqual(
      [p2.weights?.activeRatio, p2.weights?.accuracy, p2.weights?.focus, p2.weights?.consistency],
      [40, 30, 20, 10],
    )
    assert.equal(p2.weights?.hasFocus, true)
  })

  it("textos sem conclusão inventada", () => {
    const engine = code("src/application/study-analytics/engine/stats-engine.ts")
    assert.equal(engine.includes("O padrão de revisão está dando resultado"), false)
    assert.equal(engine.includes('?? "não estudada há tempo"'), false)
    const view = code("src/features/statistics/components/statistics-center-view.tsx")
    assert.equal(view.includes('sub="segunda → hoje"'), false)
    assert.ok(view.includes("{Math.round(edital.percentage)}%"))
    const charts = code("src/features/statistics/components/statistics-charts.tsx")
    assert.equal(charts.includes("`${cells.length} dias de atividade`"), false)
    assert.ok(charts.includes("sem comparação"))
  })
})

// ─── Adaptive / motor adaptativo / Mentor ────────────────────────────────────

describe("Adaptive e Mentor — sem índice calculado com valores fixos", () => {
  it("/dashboard/adaptive não calcula nem mostra o LHS com constantes", () => {
    const page = code("src/app/(protected)/dashboard/adaptive/page.tsx")
    assert.equal(page.includes("calculateLearningHealthScore"), false)
    assert.equal(/performanceScore:\s*70/.test(page), false)
    assert.equal(/retentionRate:\s*75/.test(page), false)
    assert.equal(/averageEnergy:\s*3/.test(page), false)
    assert.equal(page.includes("O motor executará adaptações"), false)
    assert.ok(page.includes('from("adaptive_history")'), "o log real continua")
  })

  it("gerador de plano sem contexto adaptativo fixo", () => {
    const service = code("src/application/study-plan/study-plan.service.ts")
    assert.equal(service.includes("mockContext"), false)
    assert.equal(service.includes("generateAdaptiveDecisions"), false)
    assert.equal(/averageEnergy:\s*3/.test(service), false)
  })

  it("Mentor não exibe o 'Índice Geral de Aprendizado' nem a tendência fixa", () => {
    const feed = code("src/features/mentor-ai/components/mentor-feed.tsx")
    assert.equal(feed.includes("globalScore"), false)
    assert.equal(feed.includes("Índice Geral de Aprendizado"), false)
  })

  it("insights com scores fixos saíram do Dashboard", () => {
    assert.equal(fs.existsSync(path.join(ROOT, "src/application/study-analytics/insights.ts")), false)
    assert.equal(code("src/application/dashboard/dashboard.service.ts").includes("getInsights"), false)
  })
})

// ─── Textos, fallbacks e ferramentas ─────────────────────────────────────────

describe("Textos e fallbacks honestos", () => {
  it("ranking: sem meta inventada (10h/20h) nem subtítulo constante", () => {
    const action = code("src/application/study-analytics/study-analytics.actions.ts")
    assert.equal(/weekly_study_hours\s*\|\|\s*10/.test(action), false)
    assert.equal(action.includes("testGlobalRankingRpc"), false)
    const view = code("src/features/ranking/components/ranking-view.tsx")
    assert.equal(view.includes(': "20h"'), false)
    assert.equal(view.includes("student.targetContest"), false)
    const modal = code("src/features/ranking/components/public-study-profile-modal.tsx")
    assert.equal(modal.includes("Concurseiro Focado"), false)
    const profile = code("src/application/ranking/public-study-profile.action.ts")
    assert.equal(profile.includes("isPrivate: !isSelf,"), false)
  })

  it("revisões: sem escada fixa e sem promessa de agendamento automático", () => {
    // Fase I.1: o módulo foi reescrito (review-tabs.tsx e
    // review-analytics.service.ts deixaram de existir); a garantia é a mesma e
    // passou para a página e a view novas.
    //
    // Fase I.5 (achado A1): a asserção cobria SÓ page.tsx, e a escada fixa
    // sobreviveu no esqueleto de carregamento por causa disso. Agora vale para
    // todo arquivo da rota de Revisões, e o texto dos dois é comparado.
    const FIXED_LADDER = "24h · 7d · 15d · 30d · 60d"
    const DESCRIPTION = "Repetição espaçada: o intervalo de cada tópico é calculado pelas suas respostas"

    const page = code("src/app/(protected)/dashboard/reviews/page.tsx")
    const loading = code("src/app/(protected)/dashboard/reviews/loading.tsx")

    assert.equal(page.includes(FIXED_LADDER), false)
    assert.equal(loading.includes(FIXED_LADDER), false, "o esqueleto não pode anunciar intervalos fixos")
    assert.ok(page.includes(DESCRIPTION), "a página descreve o cálculo real do intervalo")
    assert.ok(
      loading.includes(DESCRIPTION),
      "o esqueleto precisa dizer o mesmo que a página — foi a divergência entre os dois que criou o texto falso",
    )
    // Nenhum arquivo da rota pode prometer prazo fixo de revisão.
    for (const relative of [
      "src/app/(protected)/dashboard/reviews/page.tsx",
      "src/app/(protected)/dashboard/reviews/loading.tsx",
    ]) {
      const src = code(relative)
      assert.equal(/\b(24h|7d|15d|30d|60d)\b/.test(src), false, `${relative} não pode citar intervalos fixos`)
    }
    const view = code("src/features/reviews/components/reviews-view.tsx")
    assert.equal(view.includes("agendadas automaticamente a partir dos seus estudos"), false)
    const auth = code("src/app/(auth)/layout.tsx")
    assert.equal(auth.includes("Revisões espaçadas agendadas automaticamente"), false)
    const queue = code("src/application/review-engine/review-queue.ts")
    assert.equal(queue.includes("retention === null ? 0"), false)
    // Retenção sem resposta é null (a UI mostra "—"), nunca 0%.
    assert.ok(queue.includes("{ rate: null, answered: 0 }"))
  })

  it("planejamento semanal: sem data fixa e sem 'Meta diária atualizada'", () => {
    const weekly = code("src/features/planejamento/components/weekly-planning-view.tsx")
    assert.equal(/\/08\/2026/.test(weekly), false)
    assert.equal(weekly.includes("Meta diária atualizada"), false)
    assert.equal(weekly.includes('"Revisão e Questões"'), false)
  })

  it("'0%' sem base virou '—' (Histórico, Planos, Disciplinas)", () => {
    assert.ok(code("src/features/history/components/history-view.tsx").includes(": null"))
    const planos = code("src/features/planos/components/planos-view.tsx")
    assert.equal(planos.includes("adherencePercentage || 0}%"), false)
    const disc = code("src/features/disciplines/components/disciplines-view.tsx")
    assert.ok(disc.includes('totalStats.totalQuestions > 0 ? `${totalStats.accuracyPercentage}%` : "—"'))
  })

  it("onboarding não chama o gerador de cronograma de IA", () => {
    assert.equal(code("src/features/onboarding/components/onboarding-wizard.tsx").includes("ajudará a IA"), false)
  })

  it("salvar layout do Dashboard confere o erro do banco antes de dizer 'sucesso'", () => {
    const action = code("src/application/dashboard/dashboard-layout.action.ts")
    assert.ok(action.includes("savedSomewhere"))
    assert.ok(action.includes('return { success: false, error: "Não foi possível salvar a personalização." }'))
  })

  it("notas rápidas: sem 'Salvo agora' inicial; toasts só após o resultado do servidor", () => {
    const notes = code("src/features/dashboard/components/sticky-notes-widget.tsx")
    assert.equal(notes.includes('useState<string>("Salvo agora")'), false)
    assert.equal(notes.includes('void saveUserNoteAction(newNote)\n    toast.success'), false)
    assert.ok(notes.includes("const res = await deleteUserNoteAction(idToDelete)"))
  })
})
