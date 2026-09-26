// ============================================================================
// Fase I.1 — decisão D4: o tempo de revisão É tempo de estudo.
//
// Teste de wiring (leitura do código-fonte), pelo mesmo motivo já documentado
// nos outros testes de wiring do projeto: finalizeSession grava study_history e
// em seguida chama o mecanismo central do ciclo (registerStudyToCycle) e
// revalidatePath, que exigem contexto de requisição do Next e banco real — não
// há infraestrutura de teste de integração aqui. O que este teste impede é a
// regressão silenciosa: alguém mudar a gravação do estudo da revisão (ou
// passar a inventar duração/quantidade) sem nenhum teste reclamar.
//
// As garantias travadas aqui:
//   1. a linha vai para study_history com study_source "REVIEW" e study_type
//      "REVISAO" (os mesmos valores que o resto do app já usa);
//   2. a duração vem do tempo REAL da sessão (início da sessão → agora), nunca
//      de um número fixo;
//   3. a quantidade de itens vem das respostas REAIS da sessão;
//   4. a disciplina vem dos itens respondidos, não de uma escolha arbitrária;
//   5. sessão sem resposta nenhuma não gera estudo;
//   6. nada disso acontece antes da trava de idempotência (compare-and-swap).
//
// LIMITAÇÃO CONHECIDA — B13 (registrada na auditoria I.4, documentada na I.6):
// o caminho POSITIVO do encerramento é coberto aqui apenas por leitura de
// código. Ou seja: está travado QUE o serviço escreve os campos certos, com os
// valores certos, na ordem certa — mas não está provado, executando, que a
// linha chegou ao banco, que registerStudyToCycle avançou o ciclo e que as
// páginas foram revalidadas. Isso exige contexto de requisição do Next
// (cookies()) e um Supabase real, que este projeto não tem em teste.
//
// O que JÁ é executado de verdade, nos testes que não são de wiring:
//   - review-finalize-resilience.test.ts: o estudo é gravado antes do ciclo, e
//     uma falha do ciclo não desfaz nem duplica o estudo (achado A3);
//   - review.service.test.ts: sessão sem resposta não gera estudo, sessão
//     descartada não gera estudo, e a trava de idempotência não gera dobra;
//   - session-duration.test.ts: a duração gravada é a mesma exibida (M8);
//   - review-study-history-source-of-truth.test.ts (Fase I.7): a LINHA gravada é
//     inspecionada campo por campo depois de rodar o serviço — origem, tipo,
//     aluno, disciplina escolhida pela regra do mais revisado (com desempate
//     determinístico), duração medida, texto e metadados —, além de "uma sessão
//     nunca gera dois estudos" (segunda chamada e duas abas) e de tudo o que
//     NÃO deve gerar estudo (sem resposta, descartada, resposta isolada);
//   - review-discard-session-audit.test.ts (Fase I.7): o descarte, inclusive
//     concorrendo com o encerramento.
//
// Reavaliação na Fase I.7: o vão que resta é MENOR do que este cabeçalho dizia
// na I.6 — a gravação em si passou a ser verificada por comportamento. O que
// continua sem execução real são exatamente as três chamadas que vêm DEPOIS do
// insert: registerStudyToCycle(), revalidatePath() e
// invalidateStatisticsCenterCache(). Elas dependem de contexto de requisição do
// Next (cookies()) e de um Supabase real.
//
// Por que não foi fechado: as duas saídas possíveis são (a) injetar essas três
// dependências como parâmetro do finalizeSession, ou (b) montar ambiente de
// integração com Supabase de teste e contexto de requisição. A saída (a) só
// provaria que uma função dublê foi chamada — não que o ciclo avançou nem que a
// página revalidou — e custaria reescrever os testes de wiring que hoje fixam a
// forma real das chamadas; a saída (b) é infraestrutura nova, desproporcional ao
// ganho e fora do escopo desta fase. A proposta registrada para o futuro é (b),
// como suíte de integração separada, rodando contra um banco de teste — e não
// como dublê dentro dos testes de unidade.
// ============================================================================

import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const SERVICE_PATH = "src/application/review-engine/review.service.ts"

/** Todos os .ts/.tsx sob um diretório (para varreduras de código morto). */
function walkSource(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) out.push(...walkSource(rel))
    else if (/\.tsx?$/.test(entry.name)) out.push(rel)
  }
  return out
}

function source(): string {
  return readFileSync(join(process.cwd(), SERVICE_PATH), "utf-8")
}

function finalizeSessionBody(): string {
  const src = source()
  const start = src.indexOf("export async function finalizeSession")
  assert.notEqual(start, -1, "finalizeSession deve existir")
  const end = src.indexOf("\nexport async function", start + 1)
  return src.slice(start, end === -1 ? src.length : end)
}

describe("D4 — a revisão é registrada como estudo real", () => {
  it("grava em study_history com study_source REVIEW e study_type REVISAO", () => {
    const body = finalizeSessionBody()
    assert.ok(body.includes('supabase.from("study_history").insert('), "deve inserir em study_history")
    assert.ok(body.includes('study_source: "REVIEW"'), 'study_source deve ser "REVIEW"')
    assert.ok(body.includes('study_type: "REVISAO"'), 'study_type deve ser "REVISAO"')
  })

  it("a duração vem do tempo real da sessão, não de um número fixo", () => {
    const body = finalizeSessionBody()
    // Fase I.6 (M8): a subtração das datas deixou de ser inline aqui — ela vive na
    // regra única `reviewSessionSeconds(startedAt, nowIso)`, usada TAMBÉM pelo
    // resumo mostrado ao aluno. O que este teste trava continua sendo o mesmo: a
    // duração vem do início da sessão e do instante do encerramento, nunca de uma
    // constante.
    assert.ok(
      /reviewSessionSeconds\(startedAt, nowIso\)/.test(body),
      "a duração deve ser medida entre o início da sessão e o encerramento",
    )
    assert.ok(
      /reviewSessionMinutes\(totalSeconds\)/.test(body),
      "os minutos gravados devem sair da regra única de duração",
    )
    assert.ok(body.includes("duration_minutes: durationMinutes"), "duration_minutes deve usar o valor medido")
    assert.ok(body.includes("active_minutes: durationMinutes"), "active_minutes deve usar o valor medido")
    assert.ok(
      body.includes("duration_seconds: totalSeconds"),
      "o metadata deve guardar os segundos reais da sessão",
    )
    assert.equal(
      /duration_minutes:\s*\d/.test(body),
      false,
      "nenhuma duração constante pode ser gravada (seria tempo de estudo inventado)",
    )
  })

  it("a quantidade de itens revisados vem das respostas reais da sessão", () => {
    const body = finalizeSessionBody()
    assert.ok(
      body.includes("repo.listSessionAnswers("),
      "as respostas da sessão precisam ser lidas do histórico de revisões",
    )
    assert.ok(
      body.includes("reviews_completed: answers.length"),
      "reviews_completed deve ser o número real de respostas",
    )
    assert.ok(body.includes("review_session_id: sessionId"), "o metadata deve apontar para a sessão de origem")
  })

  it("a disciplina do estudo vem dos itens respondidos", () => {
    const body = finalizeSessionBody()
    assert.ok(body.includes("repo.disciplinesOfItems("), "a disciplina deve ser derivada dos itens respondidos")
    assert.ok(body.includes("discipline_id: mainDiscipline"), "discipline_id deve usar a disciplina derivada")
  })

  it("sessão sem resposta nenhuma não gera estudo", () => {
    const body = finalizeSessionBody()
    const guard = body.indexOf("if (answers.length > 0)")
    const insert = body.indexOf('supabase.from("study_history").insert(')
    assert.ok(guard !== -1, "deve haver a guarda de sessão sem respostas")
    assert.ok(guard < insert, "a guarda precisa vir antes do insert em study_history")
  })

  it("a gravação do estudo só acontece depois da trava de idempotência", () => {
    const body = finalizeSessionBody()
    const claim = body.indexOf("if (!claimedSession) return")
    const insert = body.indexOf('supabase.from("study_history").insert(')
    assert.ok(claim !== -1 && insert !== -1)
    assert.ok(claim < insert, "o compare-and-swap da sessão precisa vir antes do insert")
  })

  it("o Cycle Engine não é alterado: a revisão usa o mecanismo central único", () => {
    const src = source()
    assert.ok(
      /import \{ registerStudyToCycle \} from "@\/application\/study-cycle\/cycle-study-registration\.service"/.test(src),
      "a reconciliação deve vir do serviço central do ciclo",
    )
    for (const forbidden of ['from("study_cycles")', 'from("study_cycle_sessions")', 'from("study_cycle_items")']) {
      assert.equal(
        src.includes(forbidden),
        false,
        `o módulo de revisões não pode tocar em ${forbidden} — quem cuida do ciclo é o Cycle Engine`,
      )
    }
  })

  it("a revisão não cria estudo em nenhum outro ponto do módulo", () => {
    const src = source()
    const inserts = [...src.matchAll(/from\("study_history"\)\s*\.insert\(/g)]
    assert.equal(inserts.length, 1, "deve existir exatamente UM ponto de gravação de estudo pela revisão")
  })
})

describe("D2 — nenhuma revisão é criada automaticamente a partir de um estudo", () => {
  it("o módulo de revisões não é chamado pelo fim de uma sessão de estudo", () => {
    for (const file of [
      "src/application/study-session/session-orchestrator.ts",
      "src/application/study-history/study-history.actions.ts",
      "src/application/study-session/study-session.action.ts",
    ]) {
      const src = readFileSync(join(process.cwd(), file), "utf-8")
      assert.equal(
        /review-engine\/review\.(service|actions)/.test(src),
        false,
        `${file} não pode criar revisões: nesta versão a criação é manual (D2)`,
      )
      assert.equal(
        src.includes('from("review_items")'),
        false,
        `${file} não pode gravar em review_items`,
      )
    }
  })

  it("o fim de um simulado também não cria revisão (D1/D2)", () => {
    const src = readFileSync(join(process.cwd(), "src/application/simulados/simulados.actions.ts"), "utf-8")
    assert.equal(
      /from\("review_items"\)\s*\.(insert|upsert|update)\(/.test(src),
      false,
      "o fechamento do simulado não pode criar itens de revisão nesta versão",
    )
  })

  it("as ações legadas de questão → revisão/flashcard não existem mais em nenhum lugar (Fase I.2)", () => {
    // Elas gravavam source_type "QUESTION"/"FLASHCARD" e foram removidas por não
    // terem caller ativo. Este teste impede que voltem por descuido — e se algum
    // dia revisão de questões entrar no roadmap, será com origem própria no
    // schema, não reativando este código.
    const offenders: string[] = []
    for (const file of walkSource("src")) {
      const src = readFileSync(join(process.cwd(), file), "utf-8")
      if (file.endsWith("review-study-history-d4.wiring.test.ts")) continue
      if (/sendQuestionToReviewAction|createFlashcardFromQuestionAction/.test(src)) offenders.push(file)
    }
    assert.deepEqual(offenders, [])
  })
})

describe("D3 — flashcards estão fora desta entrega", () => {
  it("não existe tabela, player ou biblioteca de flashcards no módulo de revisões", () => {
    const src = source()
    assert.equal(/from\("flashcards"\)/.test(src), false, "não existe tabela de flashcards")
    assert.equal(/FLASHCARD/.test(src), false, "nenhuma origem FLASHCARD é aceita")
  })

  it("a origem aceita é somente tópico/subtópico do edital", () => {
    const models = readFileSync(join(process.cwd(), "src/domain/reviews/models.ts"), "utf-8")
    const match = /export type ReviewSourceType =([^\n]+)/.exec(models)
    assert.notEqual(match, null, "ReviewSourceType deve estar declarado")
    const declaration = match?.[1] ?? ""
    assert.ok(declaration.includes('"EDITAL_TOPIC"'))
    assert.ok(declaration.includes('"EDITAL_SUBTOPIC"'))
    assert.equal(/QUESTION|FLASHCARD|SIMULADO/.test(declaration), false)
  })
})

describe("D6 — revisões só na página de Revisões", () => {
  it("o replanejamento não consulta revisões", () => {
    const src = readFileSync(
      join(process.cwd(), "src/application/study-plan/replan/adaptive-replan.service.ts"),
      "utf-8",
    )
    assert.equal(
      src.includes('from("review_items")'),
      false,
      "o replan não pode voltar a alimentar o planejamento com revisões (D6)",
    )
  })

  it("Meu Dia e metas não leem revisões", () => {
    for (const file of [
      "src/application/study-plan/study-plan.service.ts",
      "src/application/dashboard/goals.action.ts",
    ]) {
      const src = readFileSync(join(process.cwd(), file), "utf-8")
      assert.equal(src.includes('from("review_items")'), false, `${file} não pode ler review_items (D6)`)
      assert.equal(src.includes('from("review_history")'), false, `${file} não pode ler review_history (D6)`)
    }
  })
})
