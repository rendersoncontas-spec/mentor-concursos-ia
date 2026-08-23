import { describe, it } from "node:test"
import assert from "node:assert/strict"

import {
  getStudyRanking,
  getDistanceBetween,
  getDistanceToUserAhead,
  getPositionMessage,
  getProximoAdversarioMessage,
  getLeaderDefenseMessage,
  formatDuration,
  minutesToSeconds,
  formatMetricValue,
  formatAccumulated,
  calculateDistanceAhead,
  formatDistance,
  type RankingUserInput,
} from "./ranking-engine"

/* ─────────────────────────────────────────────────────────────────────────────
   FIXTURES
────────────────────────────────────────────────────────────────────────────── */

function user(overrides: Partial<RankingUserInput> & { id: string; name: string }): RankingUserInput {
  return {
    totalMinutes: 0,
    questions: 0,
    pages: 0,
    hasActivity: true,
    ...overrides,
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   formatDuration
────────────────────────────────────────────────────────────────────────────── */

describe("formatDuration", () => {
  it("0 segundos", () => {
    assert.equal(formatDuration(0), "0s")
  })

  it("30 segundos", () => {
    assert.equal(formatDuration(30), "30s")
  })

  it("59 segundos", () => {
    assert.equal(formatDuration(59), "59s")
  })

  it("60 segundos = 1min", () => {
    assert.equal(formatDuration(60), "1min")
  })

  it("17 minutos", () => {
    assert.equal(formatDuration(17 * 60), "17min")
  })

  it("59 minutos", () => {
    assert.equal(formatDuration(59 * 60), "59min")
  })

  it("1 hora exata", () => {
    assert.equal(formatDuration(3600), "1h")
  })

  it("1h57min (117 minutos)", () => {
    assert.equal(formatDuration(117 * 60), "1h57min")
  })

  it("13h02min (782 minutos)", () => {
    assert.equal(formatDuration(782 * 60), "13h02min")
  })

  it("24 horas = 1d", () => {
    assert.equal(formatDuration(24 * 3600), "1d")
  })

  it("27h30 = 1d 3h", () => {
    assert.equal(formatDuration(27.5 * 3600), "1d 3h")
  })

  it("NaN → 0s", () => {
    assert.equal(formatDuration(NaN), "0s")
  })

  it("Negativo → 0s", () => {
    assert.equal(formatDuration(-100), "0s")
  })

  it("Infinity → 0s", () => {
    assert.equal(formatDuration(Infinity), "0s")
  })
})

/* ─────────────────────────────────────────────────────────────────────────────
   minutesToSeconds
────────────────────────────────────────────────────────────────────────────── */

describe("minutesToSeconds", () => {
  it("converte corretamente", () => {
    assert.equal(minutesToSeconds(60), 3600)
    assert.equal(minutesToSeconds(0), 0)
    assert.equal(minutesToSeconds(1.5), 90)
  })

  it("protege contra NaN", () => {
    assert.equal(minutesToSeconds(NaN), 0)
  })

  it("protege contra negativos", () => {
    assert.equal(minutesToSeconds(-10), 0)
  })
})

/* ─────────────────────────────────────────────────────────────────────────────
   formatMetricValue
────────────────────────────────────────────────────────────────────────────── */

describe("formatMetricValue", () => {
  it("TEMPO formata corretamente", () => {
    assert.equal(formatMetricValue(117, "TEMPO"), "1h57min")
  })

  it("QUESTOES singular", () => {
    assert.equal(formatMetricValue(1, "QUESTOES"), "1 questão")
  })

  it("QUESTOES plural", () => {
    assert.equal(formatMetricValue(50, "QUESTOES"), "50 questões")
  })

  it("PAGINAS singular", () => {
    assert.equal(formatMetricValue(1, "PAGINAS"), "1 página")
  })

  it("PAGINAS plural", () => {
    assert.equal(formatMetricValue(200, "PAGINAS"), "200 páginas")
  })
})

/* ─────────────────────────────────────────────────────────────────────────────
   formatAccumulated
────────────────────────────────────────────────────────────────────────────── */

describe("formatAccumulated", () => {
  it("TEMPO formata corretamente", () => {
    assert.equal(formatAccumulated(665, "TEMPO"), "11h05min")
  })

  it("QUESTOES", () => {
    assert.equal(formatAccumulated(30, "QUESTOES"), "30 questões")
  })

  it("PAGINAS", () => {
    assert.equal(formatAccumulated(100, "PAGINAS"), "100 páginas")
  })
})

/* ─────────────────────────────────────────────────────────────────────────────
   getStudyRanking — ordenação e posições
────────────────────────────────────────────────────────────────────────────── */

describe("getStudyRanking", () => {
  it("CASO 3: usuário com mais tempo fica em 1º", () => {
    const ranking = getStudyRanking(
      [
        user({ id: "a", name: "Alice", totalMinutes: 782 }), // 13h02
        user({ id: "b", name: "Bob", totalMinutes: 665 }),   // 11h05
      ],
      "TEMPO",
    )

    assert.equal(ranking.entries.length, 2)
    assert.equal(ranking.entries[0]!.rank, 1)
    assert.equal(ranking.entries[0]!.name, "Alice")
    assert.equal(ranking.entries[1]!.rank, 2)
    assert.equal(ranking.entries[1]!.name, "Bob")
  })

  it("CASO 4: grande diferença de tempo", () => {
    const ranking = getStudyRanking(
      [
        user({ id: "a", name: "Líder", totalMinutes: 1650 }), // 27h30
        user({ id: "b", name: "Eu", totalMinutes: 300 }),     // 5h
      ],
      "TEMPO",
    )

    assert.equal(ranking.entries[0]!.rank, 1)
    assert.equal(ranking.entries[1]!.rank, 2)
    assert.equal(ranking.entries[1]!.distanceAheadSeconds, 1350 * 60) // 22h30 = 1350 min
  })

  it("não inclui usuários sem atividade", () => {
    const ranking = getStudyRanking(
      [
        user({ id: "a", name: "Alice", totalMinutes: 100 }),
        user({ id: "b", name: "Bob", totalMinutes: 0, hasActivity: false }),
      ],
      "TEMPO",
    )

    assert.equal(ranking.entries.length, 1)
    assert.equal(ranking.entries[0]!.name, "Alice")
  })

  it("ordena por QUESTOES", () => {
    const ranking = getStudyRanking(
      [
        user({ id: "a", name: "Alice", totalMinutes: 100, questions: 50 }),
        user({ id: "b", name: "Bob", totalMinutes: 200, questions: 100 }),
      ],
      "QUESTOES",
    )

    assert.equal(ranking.entries[0]!.name, "Bob")
    assert.equal(ranking.entries[1]!.name, "Alice")
  })

  it("ordena por PAGINAS", () => {
    const ranking = getStudyRanking(
      [
        user({ id: "a", name: "Alice", totalMinutes: 100, pages: 300 }),
        user({ id: "b", name: "Bob", totalMinutes: 200, pages: 100 }),
      ],
      "PAGINAS",
    )

    assert.equal(ranking.entries[0]!.name, "Alice")
    assert.equal(ranking.entries[1]!.name, "Bob")
  })
})

/* ─────────────────────────────────────────────────────────────────────────────
   getStudyRanking — empates
────────────────────────────────────────────────────────────────────────────── */

describe("getStudyRanking — empates", () => {
  it("CASO 2: mesmo tempo → mesma posição", () => {
    const ranking = getStudyRanking(
      [
        user({ id: "a", name: "Alice", totalMinutes: 782 }),
        user({ id: "b", name: "Bob", totalMinutes: 782 }),
      ],
      "TEMPO",
    )

    assert.equal(ranking.entries[0]!.rank, 1)
    assert.equal(ranking.entries[1]!.rank, 1) // Empatados
    assert.equal(ranking.entries[1]!.tiedWithAbove, true)
    assert.equal(ranking.entries[1]!.distanceAheadSeconds, 0)
  })

  it("desempate por QUESTOES quando TEMPO é igual", () => {
    const ranking = getStudyRanking(
      [
        user({ id: "a", name: "Alice", totalMinutes: 100, questions: 10 }),
        user({ id: "b", name: "Bob", totalMinutes: 100, questions: 20 }),
      ],
      "TEMPO",
    )

    // Mesmo tempo → empatados (mesma posição), mas Bob ordering primeiro por questões
    assert.equal(ranking.entries[0]!.name, "Bob")
    assert.equal(ranking.entries[0]!.rank, 1)
    assert.equal(ranking.entries[1]!.name, "Alice")
    assert.equal(ranking.entries[1]!.rank, 1) // Empatados
    assert.equal(ranking.entries[1]!.tiedWithAbove, true)
  })

  it("desempate por nome quando tudo é igual", () => {
    const ranking = getStudyRanking(
      [
        user({ id: "a", name: "Zebra", totalMinutes: 100, questions: 10, pages: 5 }),
        user({ id: "b", name: "Alice", totalMinutes: 100, questions: 10, pages: 5 }),
      ],
      "TEMPO",
    )

    // Alice vem antes de Zebra (ordem alfabética)
    assert.equal(ranking.entries[0]!.name, "Alice")
    assert.equal(ranking.entries[1]!.name, "Zebra")
  })

  it("três usuários, dois empatados", () => {
    const ranking = getStudyRanking(
      [
        user({ id: "a", name: "Alice", totalMinutes: 782 }),
        user({ id: "b", name: "Bob", totalMinutes: 782 }),
        user({ id: "c", name: "Carol", totalMinutes: 500 }),
      ],
      "TEMPO",
    )

    assert.equal(ranking.entries[0]!.rank, 1)
    assert.equal(ranking.entries[1]!.rank, 1) // Empatado com Alice
    assert.equal(ranking.entries[2]!.rank, 3) // Terceira posição
    assert.equal(ranking.entries[2]!.tiedWithAbove, false)
  })
})

/* ─────────────────────────────────────────────────────────────────────────────
   getStudyRanking — distâncias
────────────────────────────────────────────────────────────────────────────── */

describe("getStudyRanking — distâncias", () => {
  it("CASO 1: distância correta entre usuário e líder", () => {
    const ranking = getStudyRanking(
      [
        user({ id: "a", name: "Lays", totalMinutes: 782 }),  // 13h02
        user({ id: "b", name: "Eu", totalMinutes: 665 }),    // 11h05
      ],
      "TEMPO",
    )

    const me = ranking.byId.get("b")!
    assert.equal(me.rank, 2)
    // 13h02 - 11h05 = 1h57 = 117 min = 7020 segundos
    assert.equal(me.distanceAheadSeconds, 7020)
  })

  it("CASO 5: diferença menor que 1 minuto mostra segundos", () => {
    const ranking = getStudyRanking(
      [
        user({ id: "a", name: "Líder", totalMinutes: 780 }),    // 13h00
        user({ id: "b", name: "Eu", totalMinutes: 779.5 }),     // 12h59m30s
      ],
      "TEMPO",
    )

    const me = ranking.byId.get("b")!
    assert.equal(me.rank, 2)
    // 780 - 779.5 = 0.5 min = 30 segundos
    assert.equal(me.distanceAheadSeconds, 30)
  })

  it("líder não tem distância", () => {
    const ranking = getStudyRanking(
      [
        user({ id: "a", name: "Alice", totalMinutes: 782 }),
        user({ id: "b", name: "Bob", totalMinutes: 665 }),
      ],
      "TEMPO",
    )

    const leader = ranking.byId.get("a")!
    assert.equal(leader.rank, 1)
    assert.equal(leader.distanceAheadSeconds, 0)
  })
})

/* ─────────────────────────────────────────────────────────────────────────────
   getDistanceBetween
────────────────────────────────────────────────────────────────────────────── */

describe("getDistanceBetween", () => {
  it("calcula distância corretamente", () => {
    const a = user({ id: "a", name: "A", totalMinutes: 782 })
    const b = user({ id: "b", name: "B", totalMinutes: 665 })
    assert.equal(getDistanceBetween(a, b, "TEMPO"), 7020) // 117 min em segundos
  })

  it("mesmo valor = 0", () => {
    const a = user({ id: "a", name: "A", totalMinutes: 782 })
    const b = user({ id: "b", name: "B", totalMinutes: 782 })
    assert.equal(getDistanceBetween(a, b, "TEMPO"), 0)
  })

  it("retorna sempre positivo (valor absoluto)", () => {
    const a = user({ id: "a", name: "A", totalMinutes: 100 })
    const b = user({ id: "b", name: "B", totalMinutes: 200 })
    // abs(100 - 200) = 100 min = 6000s
    assert.equal(getDistanceBetween(a, b, "TEMPO"), 6000)
  })
})

/* ─────────────────────────────────────────────────────────────────────────────
   getDistanceToUserAhead
────────────────────────────────────────────────────────────────────────────── */

describe("getDistanceToUserAhead", () => {
  it("retorna distância para o próximo à frente", () => {
    const ranking = getStudyRanking(
      [
        user({ id: "a", name: "Lays", totalMinutes: 782 }),
        user({ id: "b", name: "Eu", totalMinutes: 665 }),
        user({ id: "c", name: "Outro", totalMinutes: 500 }),
      ],
      "TEMPO",
    )

    const me = user({ id: "b", name: "Eu", totalMinutes: 665 })
    const result = getDistanceToUserAhead(me, ranking, "TEMPO")

    assert.notEqual(result, null)
    assert.equal(result!.user.name, "Lays")
    assert.equal(result!.distanceSeconds, 7020) // 1h57min
  })

  it("líder retorna null", () => {
    const ranking = getStudyRanking(
      [
        user({ id: "a", name: "Alice", totalMinutes: 782 }),
        user({ id: "b", name: "Bob", totalMinutes: 665 }),
      ],
      "TEMPO",
    )

    const leader = user({ id: "a", name: "Alice", totalMinutes: 782 })
    const result = getDistanceToUserAhead(leader, ranking, "TEMPO")

    assert.equal(result, null)
  })

  it("empatado com o líder: distância 0", () => {
    const ranking = getStudyRanking(
      [
        user({ id: "a", name: "Alice", totalMinutes: 782 }),
        user({ id: "b", name: "Bob", totalMinutes: 782 }),
      ],
      "TEMPO",
    )

    // Bob está empatado (rank 1), não há ninguém à frente
    const bob = user({ id: "b", name: "Bob", totalMinutes: 782 })
    const result = getDistanceToUserAhead(bob, ranking, "TEMPO")

    assert.equal(result, null) // rank 1 → null
  })
})

/* ─────────────────────────────────────────────────────────────────────────────
   getPositionMessage
────────────────────────────────────────────────────────────────────────────── */

describe("getPositionMessage", () => {
  it("CASO 6: 1º lugar", () => {
    const msg = getPositionMessage(1, 0, false, null, "TEMPO")
    assert.equal(msg, "Você está na liderança!")
  })

  it("CASO 1: 2º lugar com distância", () => {
    const msg = getPositionMessage(2, 7020, false, "Lays", "TEMPO")
    assert.equal(msg, "Faltam 1h57min para alcançar a liderança.")
  })

  it("CASO 2: empate", () => {
    const msg = getPositionMessage(2, 0, true, "Lays", "TEMPO")
    assert.equal(msg, "Você está empatado com Lays.")
  })

  it("CASO 4: grande distância", () => {
    const msg = getPositionMessage(2, 81000, false, "Líder", "TEMPO")
    assert.equal(msg, "Faltam 22h30min para alcançar a liderança.")
  })

  it("CASO 5: diferença em segundos", () => {
    const msg = getPositionMessage(2, 30, false, "Líder", "TEMPO")
    assert.equal(msg, "Faltam 30s para alcançar a liderança.")
  })

  it("fora do ranking", () => {
    const msg = getPositionMessage(0, 0, false, null, "TEMPO")
    assert.equal(msg, "Estude para entrar no ranking.")
  })

  it("3º lugar com distância", () => {
    const msg = getPositionMessage(3, 3600, false, "2º", "TEMPO")
    assert.equal(msg, "Faltam 1h para alcançar a liderança.")
  })
})

/* ─────────────────────────────────────────────────────────────────────────────
   getProximoAdversarioMessage
────────────────────────────────────────────────────────────────────────────── */

describe("getProximoAdversarioMessage", () => {
  it("1º lugar não mostra adversário", () => {
    const msg = getProximoAdversarioMessage(1, 0, false, "TEMPO")
    assert.equal(msg, "")
  })

  it("2º lugar com distância", () => {
    const msg = getProximoAdversarioMessage(2, 7020, false, "TEMPO")
    assert.equal(msg, "Faltam 1h57min para ultrapassar.")
  })

  it("empatado", () => {
    const msg = getProximoAdversarioMessage(2, 0, true, "TEMPO")
    assert.equal(msg, "Empatado com o usuário à frente.")
  })
})

/* ─────────────────────────────────────────────────────────────────────────────
   getLeaderDefenseMessage
────────────────────────────────────────────────────────────────────────────── */

describe("getLeaderDefenseMessage", () => {
  it("com vantagem", () => {
    const msg = getLeaderDefenseMessage(7020, "TEMPO")
    assert.equal(msg, "Você está 1h57min à frente do 2º colocado.")
  })

  it("sem vantagem (empate)", () => {
    const msg = getLeaderDefenseMessage(0, "TEMPO")
    assert.equal(msg, "Você está no topo! Mantenha o ritmo.")
  })

  it("grande vantagem", () => {
    const msg = getLeaderDefenseMessage(81000, "TEMPO")
    assert.equal(msg, "Você está 22h30min à frente do 2º colocado.")
  })
})

/* ─────────────────────────────────────────────────────────────────────────────
   calculateDistanceAhead
────────────────────────────────────────────────────────────────────────────── */

describe("calculateDistanceAhead", () => {
  it("TEMPO: 11h32 vs 13h02 → 1h30 (90 min = 5400s)", () => {
    // Líder: 13h02 = 782 min, Usuário: 11h32 = 692 min
    const dist = calculateDistanceAhead(782, 692, "TEMPO")
    assert.equal(dist, 90 * 60) // 5400 segundos
  })

  it("TEMPO: 10h00 vs 10h45 → 45min (2700s)", () => {
    const dist = calculateDistanceAhead(645, 600, "TEMPO")
    assert.equal(dist, 45 * 60) // 2700 segundos
  })

  it("TEMPO: empatado → 0", () => {
    const dist = calculateDistanceAhead(782, 782, "TEMPO")
    assert.equal(dist, 0)
  })

  it("TEMPO: usuário à frente → 0", () => {
    const dist = calculateDistanceAhead(782, 840, "TEMPO")
    assert.equal(dist, 0)
  })

  it("QUESTOES: 100 vs 50 → 50", () => {
    const dist = calculateDistanceAhead(100, 50, "QUESTOES")
    assert.equal(dist, 50)
  })

  it("QUESTOES: empatado → 0", () => {
    const dist = calculateDistanceAhead(50, 50, "QUESTOES")
    assert.equal(dist, 0)
  })

  it("PAGINAS: 200 vs 100 → 100", () => {
    const dist = calculateDistanceAhead(200, 100, "PAGINAS")
    assert.equal(dist, 100)
  })

  it("PAGINAS: atrás → 0", () => {
    const dist = calculateDistanceAhead(100, 200, "PAGINAS")
    assert.equal(dist, 0)
  })
})

/* ─────────────────────────────────────────────────────────────────────────────
   formatDistance
────────────────────────────────────────────────────────────────────────────── */

describe("formatDistance", () => {
  it("TEMPO: 1h30min", () => {
    assert.equal(formatDistance(5400, "TEMPO"), "1h30min")
  })

  it("TEMPO: 45min", () => {
    assert.equal(formatDistance(2700, "TEMPO"), "45min")
  })

  it("TEMPO: 0s", () => {
    assert.equal(formatDistance(0, "TEMPO"), "0s")
  })

  it("TEMPO: 2h32min", () => {
    // 2h32min = 152 min = 9120s
    assert.equal(formatDistance(9120, "TEMPO"), "2h32min")
  })

  it("QUESTOES: 50 questões", () => {
    assert.equal(formatDistance(50, "QUESTOES"), "50 questões")
  })

  it("QUESTOES: 1 questão", () => {
    assert.equal(formatDistance(1, "QUESTOES"), "1 questão")
  })

  it("PAGINAS: 100 páginas", () => {
    assert.equal(formatDistance(100, "PAGINAS"), "100 páginas")
  })

  it("PAGINAS: 1 página", () => {
    assert.equal(formatDistance(1, "PAGINAS"), "1 página")
  })
})

/* ─────────────────────────────────────────────────────────────────────────────
   Ranking com 3 usuários — distâncias integradas
────────────────────────────────────────────────────────────────────────────── */

describe("Ranking 3 usuários — distâncias para o adversário à frente", () => {
  it("Renderson (2º) → próximo adversário Lays (1º) → 1h30", () => {
    const ranking = getStudyRanking(
      [
        user({ id: "lays", name: "Lays", totalMinutes: 782 }),     // 13h02
        user({ id: "render", name: "Renderson", totalMinutes: 692 }), // 11h32
        user({ id: "joao", name: "João", totalMinutes: 540 }),    // 9h00
      ],
      "TEMPO",
    )

    const renderson = ranking.byId.get("render")!
    assert.equal(renderson.rank, 2)
    // Distância para Lays: 782 - 692 = 90 min = 5400s
    assert.equal(renderson.distanceAheadSeconds, 5400)
    assert.equal(formatDistance(renderson.distanceAheadSeconds, "TEMPO"), "1h30min")
  })

  it("João (3º) → próximo adversário Renderson (2º) → 2h32", () => {
    const ranking = getStudyRanking(
      [
        user({ id: "lays", name: "Lays", totalMinutes: 782 }),
        user({ id: "render", name: "Renderson", totalMinutes: 692 }),
        user({ id: "joao", name: "João", totalMinutes: 540 }),
      ],
      "TEMPO",
    )

    const joao = ranking.byId.get("joao")!
    assert.equal(joao.rank, 3)
    // Distância para Renderson: 692 - 540 = 152 min = 9120s
    assert.equal(joao.distanceAheadSeconds, 9120)
    assert.equal(formatDistance(joao.distanceAheadSeconds, "TEMPO"), "2h32min")
  })

  it("Lays (1º) não tem distância", () => {
    const ranking = getStudyRanking(
      [
        user({ id: "lays", name: "Lays", totalMinutes: 782 }),
        user({ id: "render", name: "Renderson", totalMinutes: 692 }),
        user({ id: "joao", name: "João", totalMinutes: 540 }),
      ],
      "TEMPO",
    )

    const lays = ranking.byId.get("lays")!
    assert.equal(lays.rank, 1)
    assert.equal(lays.distanceAheadSeconds, 0)
  })

  it("calculateDistanceAhead consistente com getStudyRanking para 3 usuários", () => {
    const ranking = getStudyRanking(
      [
        user({ id: "lays", name: "Lays", totalMinutes: 782 }),
        user({ id: "render", name: "Renderson", totalMinutes: 692 }),
        user({ id: "joao", name: "João", totalMinutes: 540 }),
      ],
      "TEMPO",
    )

    const renderson = ranking.byId.get("render")!
    const joao = ranking.byId.get("joao")!

    // calculateDistanceAhead deve produzir o mesmo resultado que distanceAheadSeconds
    assert.equal(
      calculateDistanceAhead(782, 692, "TEMPO"),
      renderson.distanceAheadSeconds,
    )
    assert.equal(
      calculateDistanceAhead(692, 540, "TEMPO"),
      joao.distanceAheadSeconds,
    )
  })
})
