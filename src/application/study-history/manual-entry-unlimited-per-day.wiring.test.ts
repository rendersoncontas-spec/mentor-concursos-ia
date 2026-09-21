import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Teste de "wiring" para a regra de lançamento manual definida na Fase 18.
 *
 * REGRA OFICIAL (Fase 18): LANÇAMENTOS MANUAIS SÃO ILIMITADOS — igual ao
 * histórico do Aprovado. O usuário pode registrar quantas atividades
 * independentes quiser no mesmo dia, na mesma disciplina ou em disciplinas
 * diferentes, em horários diferentes. Cada lançamento representa uma
 * atividade real independente.
 *
 * ISSO REVERTE a regra da Fase 14, testada antes por
 * manual-entry-concurrency-conflict-handling.wiring.test.ts (este arquivo,
 * renomeado e reescrito nesta fase). Aquela regra impedia mais de um
 * lançamento manual por dia via um índice único parcial
 * (study_history_manual_entry_unique_idx) e um tratamento de conflito 23505
 * que transformava a segunda tentativa de INSERT em um UPDATE do registro
 * existente. O smoke test da Fase 17 mostrou que essa regra, na prática, já
 * não valia para o fluxo real usado pela UI (Centro Inteligente de Estudos
 * → saveStudySessionAction, que nunca teve essa proteção) — e o usuário
 * confirmou que a regra correta é a oposta.
 *
 * Por que teste estático (wiring), não teste de integração com banco real:
 * mesma limitação documentada nos demais *.wiring.test.ts deste projeto —
 * não há infraestrutura de teste com Supabase real neste ambiente. A
 * validação de comportamento real contra o banco de produção foi feita
 * manualmente e está documentada no relatório da Fase 18 (projeto NomeIA).
 */

function readStudyHistoryActions(): string {
  return fs.readFileSync(
    path.join(process.cwd(), "src", "application", "study-history", "study-history.actions.ts"),
    "utf-8",
  )
}

function extractFunctionBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`)
  assert.ok(start !== -1, `${name} deve existir`)
  const end = source.indexOf("\nexport async function", start + 1)
  return source.slice(start, end === -1 ? source.length : end)
}

describe("saveManualStudyTimeAction: lançamentos manuais são ilimitados (Fase 18)", () => {
  it("não busca um lançamento manual existente do mesmo dia antes de inserir", () => {
    const body = extractFunctionBody(readStudyHistoryActions(), "saveManualStudyTimeAction")
    assert.doesNotMatch(
      body,
      /\.maybeSingle\(\)/,
      "saveManualStudyTimeAction não pode mais checar se já existe um lançamento manual do dia — cada chamada deve criar um registro novo e independente",
    )
  })

  it("nunca faz UPDATE de um lançamento anterior — todo lançamento manual é um INSERT novo", () => {
    const body = extractFunctionBody(readStudyHistoryActions(), "saveManualStudyTimeAction")
    assert.doesNotMatch(
      body,
      /\.update\(\{/,
      "saveManualStudyTimeAction não pode atualizar um registro existente — isso mesclaria dois lançamentos manuais distintos em um só",
    )
    assert.match(body, /\.insert\(\{/)
  })

  it("não trata mais o erro 23505 como um caso especial de conflito de concorrência", () => {
    const body = extractFunctionBody(readStudyHistoryActions(), "saveManualStudyTimeAction")
    assert.doesNotMatch(
      body,
      /error\.code === "23505"/,
      "o tratamento de 23505 criado para a regra de '1 lançamento por dia' (Fase 14) precisa ser removido — essa constraint não existe mais no banco",
    )
  })

  it("qualquer erro do INSERT é propagado como erro real, sem esconder falha", () => {
    const body = extractFunctionBody(readStudyHistoryActions(), "saveManualStudyTimeAction")
    assert.match(body, /if \(error\) throw new Error\("Erro ao registrar estudo: " \+ error\.message\)/)
  })

  it("continua sincronizando o ciclo, revalidando as rotas e invalidando o cache de estatísticas após o INSERT", () => {
    const body = extractFunctionBody(readStudyHistoryActions(), "saveManualStudyTimeAction")
    assert.match(body, /registerStudyToCycle\(\)/)
    assert.match(body, /for \(const path of HISTORY_PATHS\) revalidatePath\(path\)/)
    assert.match(body, /invalidateStatisticsCenterCache\(effectiveUserId\)/)
  })

  it("continua chamando reconcileWeeklyPlan de forma best-effort (não bloqueia o salvamento)", () => {
    const body = extractFunctionBody(readStudyHistoryActions(), "saveManualStudyTimeAction")
    assert.match(body, /reconcileWeeklyPlan\(supabase, effectiveUserId\)\.catch\(/)
  })

  it("mantém a metadata que a UI já usa (manual_entry) sem criar uma segunda convenção", () => {
    const body = extractFunctionBody(readStudyHistoryActions(), "saveManualStudyTimeAction")
    assert.match(body, /metadata: \{ manual_entry: true, calendar_date: dateStr \}/)
  })
})

describe("saveStudySessionAction (Centro Inteligente de Estudos): já era ilimitado e continua sem alteração", () => {
  it("não adota a convenção metadata.manual_entry nem nenhuma checagem de unicidade", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src", "application", "study-session", "study-session.action.ts"),
      "utf-8",
    )
    assert.doesNotMatch(
      source,
      /manual_entry/,
      "saveStudySessionAction usa metadata.is_manual_mode e não precisa de nenhuma regra de unicidade — não deve ganhar uma segunda convenção",
    )
    assert.match(source, /is_manual_mode/)
  })
})

describe("getManualEntryForDayAction: não pode quebrar quando há mais de um lançamento manual no mesmo dia", () => {
  it("não usa mais .maybeSingle() (lançaria erro com múltiplas linhas) — usa .limit(1) e pega a mais recente", () => {
    const body = extractFunctionBody(readStudyHistoryActions(), "getManualEntryForDayAction")
    assert.doesNotMatch(
      body,
      /\.maybeSingle\(\)/,
      "com lançamentos manuais ilimitados pode haver várias linhas no mesmo dia — .maybeSingle() lançaria 'multiple (or no) rows returned'",
    )
    assert.match(body, /\.limit\(1\)/)
  })
})

describe("deleteManualStudyTimeAction: exclusão deve poder ser restrita a um lançamento específico", () => {
  it("aceita um sessionId opcional e, quando informado, restringe o DELETE a esse registro", () => {
    const body = extractFunctionBody(readStudyHistoryActions(), "deleteManualStudyTimeAction")
    assert.match(
      body,
      /\.eq\("id", sessionId\)/,
      "com lançamentos manuais ilimitados, apagar 'tudo que bate com o dia' apagaria lançamentos independentes que o usuário não pediu para remover",
    )
  })
})

describe("índice único de lançamento manual: removido por migration incremental (Fase 18)", () => {
  it("a migration histórica que criou o índice não foi editada", () => {
    const original = fs.readFileSync(
      path.join(
        process.cwd(),
        "supabase",
        "migrations",
        "20260921_3_study_history_manual_entry_unique_idx.sql",
      ),
      "utf-8",
    )
    assert.match(original, /CREATE UNIQUE INDEX/i)
  })

  it("existe uma nova migration que dropa study_history_manual_entry_unique_idx", () => {
    const migrationsDir = path.join(process.cwd(), "supabase", "migrations")
    const files = fs.readdirSync(migrationsDir)
    const dropMigration = files.find((f) => {
      if (!f.endsWith(".sql")) return false
      const content = fs.readFileSync(path.join(migrationsDir, f), "utf-8")
      return /DROP INDEX IF EXISTS study_history_manual_entry_unique_idx/i.test(content)
    })
    assert.ok(
      dropMigration,
      "esperava uma migration com DROP INDEX IF EXISTS study_history_manual_entry_unique_idx",
    )
  })

  it("a migration de fingerprint de importação continua intacta (fora do escopo desta mudança)", () => {
    const content = fs.readFileSync(
      path.join(
        process.cwd(),
        "supabase",
        "migrations",
        "20260921_2_study_history_import_fingerprint_unique_idx.sql",
      ),
      "utf-8",
    )
    assert.match(content, /study_history_import_fingerprint_idx/)
  })
})
