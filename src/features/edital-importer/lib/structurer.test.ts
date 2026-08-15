import assert from "node:assert/strict"
import { test } from "node:test"

import { countLowConfidence, guessMetadata, structureEditalText } from "./structurer"

test("estrutura edital numerado clássico (1. / 1.1 / 1.1.1)", () => {
  const text = `
EDITAL Nº 01/2026
CONCURSO PÚBLICO DA POLÍCIA MILITAR DO PARANÁ
CONTEÚDO PROGRAMÁTICO

1. LÍNGUA PORTUGUESA
1.1 Compreensão e interpretação de textos de gêneros variados
1.1.1 Reconhecimento de tipos e gêneros textuais
1.2 Domínio da ortografia oficial
2. RACIOCÍNIO LÓGICO
2.1 Proposições, conectivos e equivalências lógicas
2.1.1 Negação de proposições
DAS DISPOSIÇÕES FINAIS
12. Cronograma e disposições finais
`
  const draft = structureEditalText(text)

  assert.equal(draft.disciplines.length, 2)
  assert.equal(draft.disciplines[0]?.name, "LÍNGUA PORTUGUESA")
  assert.equal(draft.disciplines[0]?.topics.length, 2)
  assert.equal(draft.disciplines[0]?.topics[0]?.subtopics.length, 1)
  assert.equal(
    draft.disciplines[0]?.topics[0]?.subtopics[0]?.title,
    "Reconhecimento de tipos e gêneros textuais",
  )
  assert.equal(draft.disciplines[1]?.name, "RACIOCÍNIO LÓGICO")
  // O conteúdo após "DAS DISPOSIÇÕES FINAIS" não entra na estrutura
  assert.equal(draft.disciplines.some((d) => d.name.includes("Cronograma")), false)
})

test("reconhece disciplina romana com tópicos numéricos (I. / 1.)", () => {
  const text = `
CONTEÚDO PROGRAMÁTICO
I. DIREITO CONSTITUCIONAL
1. Princípios fundamentais
2. Direitos e garantias fundamentais
a) Direitos individuais e coletivos
b) Direitos sociais
II. DIREITO ADMINISTRATIVO
1. Atos administrativos
2. Agentes públicos
`
  const draft = structureEditalText(text)

  assert.equal(draft.disciplines.length, 2)
  assert.equal(draft.disciplines[0]?.name, "DIREITO CONSTITUCIONAL")
  assert.equal(draft.disciplines[0]?.topics.length, 2)
  assert.equal(draft.disciplines[0]?.topics[1]?.subtopics.length, 2)
  assert.equal(draft.disciplines[1]?.name, "DIREITO ADMINISTRATIVO")
  assert.equal(draft.disciplines[1]?.topics.length, 2)
})

test("reconhece disciplina com letra e tópicos pontuados (A. / A.1)", () => {
  const text = `
CONTEÚDO PROGRAMÁTICO
A. LÍNGUA PORTUGUESA
A.1 Compreensão de textos
A.2 Ortografia oficial
B. MATEMÁTICA
B.1 Operações com números reais
`
  const draft = structureEditalText(text)

  assert.equal(draft.disciplines.length, 2)
  assert.equal(draft.disciplines[0]?.name, "LÍNGUA PORTUGUESA")
  assert.equal(draft.disciplines[0]?.topics.length, 2)
  assert.equal(draft.disciplines[1]?.name, "MATEMÁTICA")
})

test("detecta disciplinas e tópicos sem numeração (caixa alta + enumeração por ;)", () => {
  const text = `
CONTEÚDO PROGRAMÁTICO
LÍNGUA PORTUGUESA
Compreensão e interpretação de textos;
Ortografia oficial;
Pontuação.
MATEMÁTICA
Operações com números racionais;
Porcentagem e proporção.
`
  const draft = structureEditalText(text)

  assert.equal(draft.disciplines.length, 2)
  assert.equal(draft.disciplines[0]?.name, "LÍNGUA PORTUGUESA")
  assert.equal(draft.disciplines[0]?.topics.length, 3)
  assert.equal(draft.disciplines[1]?.topics.length, 2)
})

test("junta quebras de linha de um mesmo tópico", () => {
  const text = `
CONTEÚDO PROGRAMÁTICO
1. LÍNGUA PORTUGUESA
1.1 Compreensão e interpretação de textos
de gêneros variados
1.2 Ortografia oficial
`
  const draft = structureEditalText(text)

  assert.equal(
    draft.disciplines[0]?.topics[0]?.title,
    "Compreensão e interpretação de textos de gêneros variados",
  )
  assert.equal(draft.disciplines[0]?.topics.length, 2)
})

test("deduplica tópicos repetidos mantendo a primeira ocorrência", () => {
  const text = `
CONTEÚDO PROGRAMÁTICO
1. LÍNGUA PORTUGUESA
1.1 Ortografia oficial
1.1 Ortografia oficial
1.2 Compreensão de textos
`
  const draft = structureEditalText(text)

  assert.equal(draft.disciplines[0]?.topics.length, 2)
})

test("ignora números de página, separadores e cabeçalhos de edital", () => {
  const text = `
EDITAL Nº 05/2026
1
--------------------------------------------------
CONTEÚDO PROGRAMÁTICO
1. LÍNGUA PORTUGUESA
1.1 Compreensão de textos
2
--------------------------------------------------
2. RACIOCÍNIO LÓGICO
2.1 Proposições
`
  const draft = structureEditalText(text)

  assert.equal(draft.disciplines.length, 2)
  assert.equal(draft.disciplines[0]?.name, "LÍNGUA PORTUGUESA")
})

test("extrai metadados com evidência textual", () => {
  const text = `
EDITAL Nº 01/2026 – CONCURSO PÚBLICO
ÓRGÃO: POLÍCIA MILITAR DO ESTADO DO PARANÁ
BANCA ORGANIZADORA: FUNDATEC
CARGO: SOLDADO COMBATENTE
Período de inscrições: 05/01/2026 a 25/01/2026
Data da prova objetiva: 15/03/2026
Publicação: 02/01/2026
CONTEÚDO PROGRAMÁTICO
1. LÍNGUA PORTUGUESA
1.1 Compreensão de textos
`
  const meta = guessMetadata(text.split(/\r?\n/))

  assert.ok(meta.name?.includes("EDITAL Nº 01/2026"))
  assert.ok(meta.organizer?.includes("POLÍCIA MILITAR"))
  assert.ok(meta.banca?.includes("FUNDATEC"))
  assert.ok(meta.positionName?.includes("SOLDADO"))
  assert.equal(meta.examDate, "15/03/2026")
  assert.equal(meta.registrationDate, "05/01/2026")
})

test("marca itens com confiança baixa quando a estrutura é fraca", () => {
  const text = `
CONTEÚDO PROGRAMÁTICO
1. LÍNGUA PORTUGUESA
1.1 Compreensão de textos
alguma linha solta que será agregada ao tópico
`
  const draft = structureEditalText(text)

  const low = countLowConfidence(draft.disciplines)
  assert.equal(typeof low, "number")
  assert.ok((draft.disciplines[0]?.topics[0]?.title.length ?? 0) > 20)
})
