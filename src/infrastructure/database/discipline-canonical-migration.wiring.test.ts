import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

// G2.12 — verificação ESTÁTICA da migration de identidade canônica. Não prova
// o comportamento no Postgres (isso foi validado numa instância PGlite: ver
// docs/g2-12-discipline-catalog-report.md); garante que o texto não regrida.

const SQL = readFileSync("supabase/migrations/20261006_g2_12_discipline_canonical_identity.sql", "utf8")
// Só o SQL executável (comentários fora).
const EXEC = SQL.split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")

describe("migration G2.12 — identidade canônica do catálogo", () => {
  it("não apaga, não trunca e não toca tabelas de histórico", () => {
    assert.doesNotMatch(EXEC, /\bDELETE\s+FROM\b/i)
    assert.doesNotMatch(EXEC, /\bTRUNCATE\b/i)
    assert.doesNotMatch(EXEC, /\bDROP\s+TABLE\b/i)
    assert.doesNotMatch(EXEC, /DROP\s+COLUMN/i)
    for (const table of ["study_history", "simulado_disciplines", "user_disciplines", "study_cycle_items", "study_cycle_sessions", "study_plan_items", "review_items", "topics", "questions"]) {
      assert.doesNotMatch(EXEC, new RegExp(`\\b${table}\\b`), `não referencia ${table}`)
    }
  })

  it("não renomeia disciplinas: nenhum UPDATE grava a coluna name", () => {
    assert.doesNotMatch(EXEC, /SET\s+name\s*=/i)
  })

  it("coluna de vínculo é opcional, sem auto-referência, com FK SET NULL e índice", () => {
    assert.match(EXEC, /ADD COLUMN IF NOT EXISTS canonical_discipline_id uuid NULL/)
    assert.match(EXEC, /CHECK \(canonical_discipline_id IS NULL OR canonical_discipline_id <> id\)/)
    assert.match(EXEC, /REFERENCES public\.disciplines\(id\) ON DELETE SET NULL/)
    assert.match(EXEC, /CREATE INDEX IF NOT EXISTS disciplines_canonical_discipline_id_idx/)
  })

  it("guarda: só admin muda o vínculo, sem cadeias", () => {
    assert.match(EXEC, /get_user_role\(auth\.uid\(\)\), 'user'\) <> 'admin'/)
    assert.match(EXEC, /t\.canonical_discipline_id IS NOT NULL/)
    assert.match(EXEC, /a\.canonical_discipline_id = NEW\.id/)
    assert.match(EXEC, /BEFORE INSERT OR UPDATE OF canonical_discipline_id ON public\.disciplines/)
  })

  it("UPDATE do catálogo global passa a ser só de admin; SELECT/INSERT intocados", () => {
    assert.match(EXEC, /DROP POLICY IF EXISTS "Usuários autenticados podem atualizar disciplinas"/)
    assert.match(EXEC, /FOR UPDATE\s+TO authenticated\s+USING \(public\.get_user_role\(auth\.uid\(\)\) = 'admin'\)/)
    assert.doesNotMatch(EXEC, /DROP POLICY IF EXISTS "Leitura de disciplinas/)
    assert.doesNotMatch(EXEC, /DROP POLICY IF EXISTS "Usuários autenticados podem criar disciplinas"/)
  })

  it("name_key: função canônica + correção com guarda de colisão + trigger", () => {
    assert.match(EXEC, /CREATE OR REPLACE FUNCTION public\.discipline_name_key\(p_name text\)/)
    assert.match(EXEC, /IMMUTABLE/)
    assert.match(EXEC, /normalize\(coalesce\(p_name, ''\), NFC\)/)
    assert.match(EXEC, /AND NOT EXISTS \(/)
    assert.match(EXEC, /BEFORE INSERT OR UPDATE OF name, name_key ON public\.disciplines/)
  })

  it("só os 2 vínculos comprovados são executados; os pendentes estão comentados", () => {
    const executed = EXEC.match(/SET canonical_discipline_id = c\.id/g) ?? []
    assert.equal(executed.length, 2)
    assert.match(EXEC, /a\.name = 'Raciocínio Lógico-Matemático'/)
    assert.match(EXEC, /a\.name = 'Tecnologia da Informação'/)
    assert.doesNotMatch(EXEC, /Noções de Direito Administrativo/)
    assert.match(SQL, /-- UPDATE public\.disciplines SET canonical_discipline_id = 'a7eae543/)
  })

  it("documenta rollback", () => {
    assert.match(SQL, /ROLLBACK/)
    assert.match(SQL, /SET canonical_discipline_id = NULL WHERE canonical_discipline_id IS NOT NULL/)
  })
})
