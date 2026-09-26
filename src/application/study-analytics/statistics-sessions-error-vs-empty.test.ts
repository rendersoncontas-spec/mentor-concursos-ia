// ============================================================================
// Fase I.7 — último fallback de erro das Estatísticas: `loadSessions`.
//
// O que existia: a leitura das sessões de estudo ignorava o `error` do
// paginador e devolvia as linhas que tivessem chegado ("mesmo comportamento de
// antes"). Isso produzia DOIS defeitos diferentes, e o segundo é o pior:
//
//   1. falha total de consulta → `[]` → a página mostrava os estados vazios
//      ("Nenhum estudo registrado no período"), indistinguível de um aluno novo;
//   2. falha no MEIO da paginação → histórico PARCIAL tratado como completo →
//      total de horas, sequência de dias, mapa de calor e horas por disciplina
//      todos menores do que a realidade, sem nenhum aviso. O aluno decidiria o
//      que estudar com base em números errados achando que estavam certos.
//
// Agora a regra é `toStudySessions`: erro → `null` (descartando inclusive as
// páginas parciais), consulta respondida → as sessões, e `[]` só quando o banco
// respondeu e não há sessão nenhuma.
//
// Estes testes são de COMPORTAMENTO: usam o paginador real
// (`fetchAllPagesInParallel`) com uma fonte de páginas em memória que falha onde
// o teste quiser, e compõem exatamente como `loadSessions` compõe. Datas fixas,
// nenhum Math.random().
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { fetchAllPagesInParallel, type FetchPage, type PageResult } from "@/lib/parallel-pagination"
import { toStudySessions } from "@/application/study-analytics/study-sessions-read"

const PAGE_SIZE = 10
const USER = "aluno-1"

function row(id: string, startedAt: string, minutes: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    user_id: USER,
    discipline_id: "disc-1",
    disciplines: { id: "disc-1", name: "Direito Administrativo", area: "Direito" },
    started_at: startedAt,
    finished_at: startedAt,
    duration_minutes: minutes,
    active_minutes: minutes,
    paused_minutes: 0,
    planned_minutes: minutes,
    completed: true,
    interrupted: false,
    energy_level: 4,
    difficulty: 3,
    focus_score: 4,
    study_type: "TEORIA",
    study_source: "TIMER",
    origin_source: null,
    notes: null,
    metadata: {},
    ...extra,
  }
}

/** Uma sessão por dia, para os totais serem fáceis de conferir. */
function sessions(n: number): Record<string, unknown>[] {
  return Array.from({ length: n }, (_, i) =>
    row(`s-${String(i).padStart(3, "0")}`, `2026-03-${String((i % 28) + 1).padStart(2, "0")}T12:00:00.000Z`, 30),
  )
}

/**
 * Fonte de páginas em memória, no mesmo contrato que o paginador recebe do
 * PostgREST. `failAtRequest` faz a n-ésima requisição responder com `error`,
 * exatamente como o banco responderia no meio de uma leitura.
 */
function pageSource(
  all: Record<string, unknown>[],
  opts: { failAtRequest?: number; throwAtRequest?: number } = {},
): { fetchPage: FetchPage<Record<string, unknown>>; requests: () => number } {
  let n = 0
  const fetchPage: FetchPage<Record<string, unknown>> = (from, to, withCount) => {
    n++
    if (opts.throwAtRequest === n) return Promise.reject(new Error("conexão caiu"))
    if (opts.failAtRequest === n) {
      return Promise.resolve<PageResult<Record<string, unknown>>>({
        data: null,
        error: { message: "canceling statement due to statement timeout" },
      })
    }
    return Promise.resolve<PageResult<Record<string, unknown>>>({
      data: all.slice(from, to + 1),
      error: null,
      count: withCount ? all.length : null,
    })
  }
  return { fetchPage, requests: () => n }
}

/** A mesma composição de `loadSessions`, sem banco e sem contexto do Next. */
async function read(fetchPage: FetchPage<Record<string, unknown>>) {
  const result = await fetchAllPagesInParallel(fetchPage, { pageSize: PAGE_SIZE, maxRows: 50_000 })
  return { sessions: toStudySessions({ data: result.data, error: result.error }), raw: result }
}

describe("I.7 — consulta respondida: os dados são os reais", () => {
  it("histórico vazio de verdade devolve lista vazia (estado vazio normal, não erro)", async () => {
    const { fetchPage } = pageSource([])
    const { sessions: out } = await read(fetchPage)

    assert.notEqual(out, null, "consulta respondeu: não é estado de erro")
    assert.deepEqual(out, [], "ausência real de sessões é lista vazia")
  })

  it("com registros, devolve as sessões e os valores reais", async () => {
    const { fetchPage } = pageSource([
      row("s-1", "2026-03-10T12:00:00.000Z", 45),
      row("s-2", "2026-03-11T12:00:00.000Z", 60),
    ])
    const { sessions: out } = await read(fetchPage)

    assert.ok(out)
    assert.equal(out.length, 2)
    assert.equal(out[0]?.id, "s-1")
    assert.equal(out[0]?.durationMinutes, 45)
    assert.equal(out[1]?.durationMinutes, 60)
    assert.equal(out[0]?.disciplineName, "Direito Administrativo")
    assert.equal(out[0]?.startedAt, "2026-03-10T12:00:00.000Z")
  })

  it("histórico grande é lido por inteiro (nenhuma página perdida)", async () => {
    const all = sessions(95) // 10 páginas: 9 cheias + 1 com 5
    const { fetchPage } = pageSource(all)
    const { sessions: out } = await read(fetchPage)

    assert.ok(out)
    assert.equal(out.length, 95, "as 95 sessões precisam chegar, não só a primeira página")
    const minutos = out.reduce((soma, s) => soma + s.durationMinutes, 0)
    assert.equal(minutos, 95 * 30, "o total de minutos é o do histórico inteiro")
  })

  it("linha inválida é descartada, mas a leitura continua sendo um sucesso", async () => {
    // `started_at` inutilizável é higiene de dado, não falha de consulta.
    const { fetchPage } = pageSource([
      row("s-ok", "2026-03-10T12:00:00.000Z", 30),
      row("s-ruim", "data-que-não-existe", 30),
    ])
    const { sessions: out } = await read(fetchPage)

    assert.ok(out, "uma linha suja não transforma a leitura em erro")
    assert.equal(out.length, 1)
    assert.equal(out[0]?.id, "s-ok")
  })

  it("todas as linhas inválidas ainda é sucesso com lista vazia, não erro", async () => {
    const { fetchPage } = pageSource([row("s-ruim", "", 30)])
    const { sessions: out } = await read(fetchPage)

    assert.deepEqual(out, [])
  })
})

describe("I.7 — consulta que falha nunca vira histórico", () => {
  it("falha na primeira página: estado de erro, não lista vazia", async () => {
    const { fetchPage } = pageSource(sessions(30), { failAtRequest: 1 })
    const { sessions: out } = await read(fetchPage)

    assert.equal(out, null, "erro de leitura não pode virar `[]`")
  })

  it("falha NO MEIO da paginação descarta até as páginas que já chegaram", async () => {
    const all = sessions(95)
    const { fetchPage } = pageSource(all, { failAtRequest: 3 })
    const { sessions: out, raw } = await read(fetchPage)

    // O paginador entrega, junto com o erro, o que já tinha lido: era
    // exatamente esse conteúdo parcial que a página tratava como completo.
    assert.ok(raw.error, "o paginador precisa sinalizar a falha")
    assert.ok(raw.data.length > 0, "e ainda traz páginas parciais")
    assert.ok(raw.data.length < all.length, "parciais, não o histórico inteiro")

    assert.equal(out, null, "histórico parcial não pode ser apresentado como completo")
  })

  it("nenhum número é derivado de leitura falha", async () => {
    const { fetchPage } = pageSource(sessions(95), { failAtRequest: 3 })
    const { sessions: out } = await read(fetchPage)

    // Sem lista, não há total de horas, sequência nem mapa de calor para
    // calcular — é isso que o `null` garante na fonte.
    assert.equal(out, null)
    assert.equal(Array.isArray(out), false, "nada de lista (nem vazia, nem parcial)")
  })

  it("a regra também vale para o resultado já pronto do paginador", () => {
    assert.equal(toStudySessions({ data: [], error: { message: "timeout" } }), null)
    assert.deepEqual(toStudySessions({ data: [], error: null }), [])
  })

  it("exceção na leitura propaga (quem chama trata) e não devolve lista", async () => {
    const { fetchPage } = pageSource(sessions(30), { throwAtRequest: 1 })
    await assert.rejects(() => read(fetchPage), /conexão caiu/)
  })
})

// ─── Fiação: a action e a tela (não chamáveis em teste de unidade) ───────────
// `statistics-center.action.ts` é "use server" e exige contexto de requisição do
// Next; a view é um componente client. O que segue trava a ligação entre a regra
// acima e o que o aluno vê.

function read_(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf-8")
}

/** Sem comentários: eles citam de propósito os padrões proibidos. */
function code(relativePath: string): string {
  return read_(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
}

const ACTION = "src/application/study-analytics/statistics-center.action.ts"
const VIEW = "src/features/statistics/components/statistics-center-view.tsx"

describe("I.7 — a action admite a falha e não a guarda no cache", () => {
  it("loadSessions declara que pode falhar", () => {
    const src = code(ACTION)
    assert.match(src, /async function loadSessions\([^)]*\): Promise<SessionRecord\[\] \| null>/)
  })

  it("não sobrou fallback de lista vazia nem de zero na leitura das sessões", () => {
    const src = code(ACTION)
    const fn = src.slice(src.indexOf("async function loadSessions"), src.indexOf("async function loadAttempts"))
    assert.equal(/return \[\]/.test(fn), false, "nenhuma lista vazia como fallback de erro")
    assert.equal(/return 0/.test(fn), false)
    assert.equal((fn.match(/return null/g) ?? []).length, 1, "só o catch devolve null direto")
    assert.match(fn, /return toStudySessions\(/, "a decisão fica na regra única")
  })

  it("sessões nulas viram erro da página, e o payload de falha NÃO é cacheado", () => {
    const src = code(ACTION)
    const guard = src.indexOf("if (sessions === null)")
    assert.ok(guard > 0, "precisa existir a guarda de leitura falha")
    const setCache = src.indexOf("cache.set(effectiveUserId")
    assert.ok(guard < setCache, "a guarda tem de vir ANTES de gravar o cache")

    const bloco = src.slice(guard, src.indexOf("const payload: StatisticsCenterPayload"))
    assert.match(bloco, /error: "Não foi possível carregar seu histórico de estudos/)
    assert.match(bloco, /data: null/)
    assert.equal(bloco.includes("cache.set"), false, "falha não entra no cache de 5 minutos")
  })
})

describe("I.7 — a tela diz \"não deu para carregar\", não \"você não tem registros\"", () => {
  const view = read_(VIEW)

  it("existe o estado de erro da página, com opção de tentar de novo", () => {
    assert.match(view, /if \(error && !payload\)/)
    const bloco = view.slice(view.indexOf("if (error && !payload)"), view.indexOf("return (\n    <div className=\"space-y-4 pb-8"))
    assert.match(bloco, /Não foi possível carregar suas estatísticas/)
    assert.match(bloco, /Tentar novamente/)
  })

  it("o estado de erro não exibe nenhum número nem texto de ausência de registro", () => {
    const bloco = view.slice(view.indexOf("if (error && !payload)"), view.indexOf("return (\n    <div className=\"space-y-4 pb-8"))
    assert.equal(bloco.includes("Nenhum estudo registrado"), false)
    assert.equal(bloco.includes("sessions"), false)
    assert.equal(bloco.includes("Metric"), false)
  })

  it("os textos de ausência real continuam existindo, no caminho com dados lidos", () => {
    // A distinção só é real se os DOIS textos existirem, em caminhos separados.
    assert.match(view, /Nenhum estudo registrado no período/)
    assert.match(view, /Não foi possível carregar suas estatísticas/)
  })

  it("a página do servidor manda o aluno para o caminho de erro quando não há payload", () => {
    const page = read_("src/app/(protected)/estatisticas/page.tsx")
    assert.match(page, /result\.data\s*\?\s*\{ payload: result\.data/)
    assert.match(page, /:\s*null/)
  })
})
