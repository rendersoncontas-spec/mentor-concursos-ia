// ============================================================================
// Contrato do agendador de revisões (porta ReviewScheduler + adaptador ts-fsrs).
//
// Todas as datas são FIXAS e nenhum teste aqui usa Math.random() nem Date.now():
// o agendamento é determinístico por construção (o "fuzz" da biblioteca fica
// desligado e o instante entra sempre por parâmetro), e é isso que estes testes
// travam. Os números não são inventados pelo teste: eles vêm da biblioteca
// (ts-fsrs 5.4.2, MIT) e o que se verifica são as garantias de que o produto
// depende — transições de estado, graduação, recaída, previsão e determinismo.
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { FsrsReviewScheduler, reviewScheduler } from "./fsrs-scheduler"

const T0 = "2026-01-10T12:00:00.000Z"
const DAY_MS = 24 * 60 * 60 * 1000

function minutesBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000
}

describe("ReviewScheduler — item novo", () => {
  it("nasce NEW, sem histórico e vencendo no instante informado (nenhum intervalo inventado)", () => {
    const memory = reviewScheduler.newMemory(T0)
    assert.equal(memory.state, "NEW")
    assert.equal(memory.reps, 0)
    assert.equal(memory.lapses, 0)
    assert.equal(memory.lastReviewAt, null)
    assert.equal(memory.scheduledDays, 0)
    assert.equal(memory.learningSteps, 0)
    assert.equal(memory.dueAt, T0)
  })
})

describe("ReviewScheduler — primeira resposta e graduação", () => {
  it("NEW + \"Bom\" entra em LEARNING, no passo seguinte, ainda dentro do mesmo dia", () => {
    const { memory, event } = reviewScheduler.schedule({
      memory: reviewScheduler.newMemory(T0),
      grade: 3,
      now: T0,
    })
    assert.equal(memory.state, "LEARNING")
    assert.equal(memory.reps, 1)
    assert.equal(memory.lapses, 0)
    assert.equal(memory.learningSteps, 1, "o passo de aprendizado avança (e é isso que precisa ser persistido)")
    assert.ok(memory.stability > 0, "a estabilidade passa a ser medida pela biblioteca")
    const minutes = minutesBetween(T0, memory.dueAt)
    assert.ok(minutes > 0 && minutes < 60 * 24, `deveria voltar em minutos, voltou em ${minutes} min`)

    assert.equal(event.stateBefore, "NEW")
    assert.equal(event.stateAfter, "LEARNING")
    assert.equal(event.elapsedDays, 0, "primeira resposta: nada decorreu")
    assert.equal(event.early, false)
    assert.equal(event.dueBefore, T0)
    assert.equal(event.dueAfter, memory.dueAt)
  })

  it("LEARNING no último passo + \"Bom\" GRADUA para REVIEW, com intervalo em dias", () => {
    const first = reviewScheduler.schedule({ memory: reviewScheduler.newMemory(T0), grade: 3, now: T0 })
    const second = reviewScheduler.schedule({ memory: first.memory, grade: 3, now: first.memory.dueAt })

    assert.equal(second.memory.state, "REVIEW")
    assert.equal(second.memory.reps, 2)
    assert.ok(second.memory.scheduledDays >= 1, "a graduação agenda dias, não minutos")
    assert.ok(
      new Date(second.memory.dueAt).getTime() - new Date(first.memory.dueAt).getTime() >= DAY_MS,
      "o próximo vencimento sai do dia",
    )
  })

  it("REGRESSÃO: sem learning_steps persistido o item NUNCA gradua (fica preso em LEARNING)", () => {
    // Esta é a razão pela qual a coluna `learning_steps` existe em review_items.
    // Se o passo voltar a ser descartado entre uma resposta e outra, a mesma
    // sequência de respostas mantém o item em LEARNING para sempre — o aluno
    // revisaria o mesmo tópico de 10 em 10 minutos, sem fim.
    const first = reviewScheduler.schedule({ memory: reviewScheduler.newMemory(T0), grade: 3, now: T0 })
    const memoryWithoutStep = { ...first.memory, learningSteps: 0 }
    const second = reviewScheduler.schedule({ memory: memoryWithoutStep, grade: 3, now: first.memory.dueAt })

    assert.equal(second.memory.state, "LEARNING")
    assert.ok(
      minutesBetween(first.memory.dueAt, second.memory.dueAt) < 60 * 24,
      "sem o passo, a resposta apenas reagenda em minutos",
    )
  })
})

describe("ReviewScheduler — recaída", () => {
  it("REVIEW + \"Errei\" cai para RELEARNING, conta a recaída e volta em minutos", () => {
    const first = reviewScheduler.schedule({ memory: reviewScheduler.newMemory(T0), grade: 3, now: T0 })
    const graduated = reviewScheduler.schedule({ memory: first.memory, grade: 3, now: first.memory.dueAt })
    const lapse = reviewScheduler.schedule({
      memory: graduated.memory,
      grade: 1,
      now: graduated.memory.dueAt,
    })

    assert.equal(lapse.memory.state, "RELEARNING")
    assert.equal(lapse.memory.lapses, graduated.memory.lapses + 1)
    assert.ok(lapse.memory.stability < graduated.memory.stability, "errar reduz a estabilidade")
    assert.ok(lapse.memory.difficulty > graduated.memory.difficulty, "errar aumenta a dificuldade")
    const minutes = minutesBetween(graduated.memory.dueAt, lapse.memory.dueAt)
    assert.ok(minutes > 0 && minutes < 60 * 24, `deveria voltar em minutos, voltou em ${minutes} min`)

    assert.equal(lapse.event.stateBefore, "REVIEW")
    assert.equal(lapse.event.stateAfter, "RELEARNING")
    assert.equal(lapse.event.elapsedDays, 2, "dois dias entre a graduação e a recaída")
  })
})

describe("ReviewScheduler — revisão antecipada", () => {
  it("responder antes do vencimento marca o evento como antecipado e usa os dias reais decorridos", () => {
    const first = reviewScheduler.schedule({ memory: reviewScheduler.newMemory(T0), grade: 3, now: T0 })
    const graduated = reviewScheduler.schedule({ memory: first.memory, grade: 3, now: first.memory.dueAt })

    const oneDayBeforeDue = new Date(new Date(graduated.memory.dueAt).getTime() - DAY_MS).toISOString()
    const early = reviewScheduler.schedule({ memory: graduated.memory, grade: 3, now: oneDayBeforeDue })

    assert.equal(early.event.early, true)
    assert.equal(early.event.elapsedDays, 1)
    assert.equal(early.event.reviewedAt, oneDayBeforeDue)
    assert.ok(new Date(early.memory.dueAt).getTime() > new Date(oneDayBeforeDue).getTime())
  })
})

describe("ReviewScheduler — previsão das quatro notas", () => {
  it("devolve as quatro notas, com vencimentos crescentes de \"Errei\" a \"Fácil\"", () => {
    const first = reviewScheduler.schedule({ memory: reviewScheduler.newMemory(T0), grade: 3, now: T0 })
    const graduated = reviewScheduler.schedule({ memory: first.memory, grade: 3, now: first.memory.dueAt })

    const forecast = reviewScheduler.forecast(graduated.memory, graduated.memory.dueAt)
    assert.deepEqual(
      forecast.map((f) => f.grade),
      [1, 2, 3, 4],
    )
    const dueTimes = forecast.map((entry) => new Date(entry.dueAt).getTime())
    const ascending = dueTimes.every((time, index) => index === 0 || time > (dueTimes[index - 1] ?? 0))
    assert.ok(ascending, `vencimentos previstos fora de ordem: ${JSON.stringify(forecast)}`)
  })

  it("prever não altera a memória do item", () => {
    const memory = reviewScheduler.newMemory(T0)
    const snapshot = JSON.stringify(memory)
    reviewScheduler.forecast(memory, T0)
    assert.equal(JSON.stringify(memory), snapshot)
  })

  it("a previsão de uma nota é exatamente o que essa nota agenda de verdade", () => {
    const memory = reviewScheduler.newMemory(T0)
    const forecast = reviewScheduler.forecast(memory, T0)
    for (const entry of forecast) {
      const applied = reviewScheduler.schedule({ memory, grade: entry.grade, now: T0 })
      assert.equal(applied.memory.dueAt, entry.dueAt, `previsão divergente para a nota ${entry.grade}`)
      assert.equal(applied.memory.scheduledDays, entry.scheduledDays)
    }
  })
})

describe("ReviewScheduler — determinismo", () => {
  it("o mesmo estado, a mesma nota e o mesmo instante produzem sempre o mesmo resultado", () => {
    const memory = reviewScheduler.newMemory(T0)
    const a = reviewScheduler.schedule({ memory, grade: 3, now: T0 })
    const b = reviewScheduler.schedule({ memory, grade: 3, now: T0 })
    assert.deepEqual(a, b)
  })

  it("duas instâncias independentes do agendador concordam (nenhum estado global escondido)", () => {
    const memory = reviewScheduler.newMemory(T0)
    const one = new FsrsReviewScheduler().schedule({ memory, grade: 4, now: T0 })
    const other = new FsrsReviewScheduler().schedule({ memory, grade: 4, now: T0 })
    assert.deepEqual(one, other)
  })

  it("retenções diferentes não se contaminam entre chamadas", () => {
    const memory = reviewScheduler.newMemory(T0)
    const graduated = reviewScheduler.schedule({ memory, grade: 4, now: T0 }).memory
    const conservative = reviewScheduler.schedule({ memory: graduated, grade: 3, now: graduated.dueAt, desiredRetention: 0.95 })
    const relaxed = reviewScheduler.schedule({ memory: graduated, grade: 3, now: graduated.dueAt, desiredRetention: 0.8 })
    const again = reviewScheduler.schedule({ memory: graduated, grade: 3, now: graduated.dueAt, desiredRetention: 0.95 })

    assert.deepEqual(conservative, again, "a mesma retenção sempre devolve o mesmo resultado")
    assert.ok(
      conservative.memory.scheduledDays < relaxed.memory.scheduledDays,
      "pedir mais retenção encurta o intervalo",
    )
  })

  it("o adaptador não sorteia nada: nenhuma fonte de aleatoriedade no código", () => {
    const source = readFileSync(join(process.cwd(), "src/infrastructure/reviews/fsrs-scheduler.ts"), "utf-8")
    assert.equal(/Math\.random/.test(source), false, "o agendamento não pode depender de sorteio")
    assert.equal(/enable_fuzz\s*:\s*true/.test(source), false, "o fuzz da biblioteca precisa ficar desligado")
    assert.equal(/new Date\(\)/.test(source), false, "o instante entra por parâmetro, nunca do relógio do processo")
  })
})

describe("ReviewScheduler — o domínio não conhece a biblioteca", () => {
  it("a porta de domínio não importa ts-fsrs (só a cita em comentário)", () => {
    const port = readFileSync(join(process.cwd(), "src/domain/reviews/review-scheduler.ts"), "utf-8")
    assert.equal(/from "ts-fsrs"/.test(port), false)
    assert.equal(/require\("ts-fsrs"\)/.test(port), false)
  })

  it("só o adaptador importa ts-fsrs (serviço, repositório, actions e UI não)", () => {
    for (const file of [
      "src/application/review-engine/review.service.ts",
      "src/application/review-engine/review.repository.ts",
      "src/application/review-engine/review.actions.ts",
      "src/application/review-engine/review-queue.ts",
      "src/features/reviews/components/reviews-view.tsx",
      "src/features/reviews/components/review-session-modal.tsx",
    ]) {
      const source = readFileSync(join(process.cwd(), file), "utf-8")
      assert.equal(/from "ts-fsrs"/.test(source), false, `${file} não pode importar ts-fsrs`)
    }
  })
})
