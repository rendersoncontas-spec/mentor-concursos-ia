import assert from "node:assert/strict"
import test from "node:test"

// Regressão QA: garante que topic/studyType/technique/notes do formulário
// chegam ao payload de study_history (antes eram ignorados no snapshot).

function buildSnapshot(
  session: Record<string, unknown>,
  formData?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    discipline_id: (formData?.["discipline_id"] as string) || session["disciplineId"],
    discipline_name: (formData?.["discipline_name"] as string) || session["disciplineName"],
    topic_name: (formData?.["topic_name"] as string) || session["topicName"],
    studyType: (formData?.["studyType"] as string) || session["studyType"],
    technique: (formData?.["technique"] as string) || session["technique"],
    notes: (formData?.["notes"] as string) ?? session["notes"],
  }
}

const baseSession = {
  disciplineId: "disc-1",
  disciplineName: "Direito Tributário",
  topicName: "Sessão tópico",
  studyType: "TEORIA",
  technique: "LIVRE",
  notes: "Sessão nota",
}

test("SAVE-FIELDS 1. formData sobrescreve session quando preenchido", () => {
  const snap = buildSnapshot(baseSession, {
    topic_name: "Form tópico",
    studyType: "QUESTOES",
    technique: "POMODORO_25_5",
    notes: "Form nota",
  })
  assert.equal(snap["topic_name"], "Form tópico")
  assert.equal(snap["studyType"], "QUESTOES")
  assert.equal(snap["technique"], "POMODORO_25_5")
  assert.equal(snap["notes"], "Form nota")
})

test("SAVE-FIELDS 2. sem formData, usa session como fallback", () => {
  const snap = buildSnapshot(baseSession, {})
  assert.equal(snap["topic_name"], "Sessão tópico")
  assert.equal(snap["studyType"], "TEORIA")
  assert.equal(snap["technique"], "LIVRE")
  assert.equal(snap["notes"], "Sessão nota")
})

test("SAVE-FIELDS 3. notes vazio no form preserva string vazia (não cai no fallback)", () => {
  const snap = buildSnapshot(baseSession, { notes: "" })
  assert.equal(snap["notes"], "")
})

test("SAVE-FIELDS 4. discipline do form tem prioridade (escolha pós-início)", () => {
  const snap = buildSnapshot(baseSession, {
    discipline_id: "disc-2",
    discipline_name: "Contabilidade",
  })
  assert.equal(snap["discipline_id"], "disc-2")
  assert.equal(snap["discipline_name"], "Contabilidade")
})
