import type { MentorLLMInput, MentorPromptVersion } from "@/domain/mentor/mentor-ai"
import { MENTOR_PROMPT_VERSION } from "@/domain/mentor/mentor-ai"
import type { StudentMentorContext } from "@/domain/mentor/student-mentor-context"

/**
 * G2.16 — o que vai para o modelo: uma representação MÍNIMA do contexto.
 *
 * Fora: ids internos (uuid de disciplina, ids de insight com uuid), nome e
 * e-mail do aluno, nome e data do concurso (vai só "dias até a prova"),
 * fontes/consultas, qualquer coisa de outro aluno ou administrativa. As
 * frases factuais dos insights vão como estão (podem citar datas de estudo,
 * nomes de matérias e o nome que o aluno deu ao ciclo). Disciplinas, insights e
 * candidatas viram referências curtas ("D1", "I1", "R1") — o mapa
 * referência → id real fica só no servidor (RefMap) e é o que valida a volta.
 */

export const MAX_LLM_INPUT_CHARS = 12_000
const MAX_DISCIPLINES = 15
/** G2.18: teto por texto vindo de dado do aluno (nomes) e por frase factual. */
export const MAX_LLM_NAME_CHARS = 80
export const MAX_LLM_FACT_CHARS = 300

/**
 * G2.18 — saneamento de TODO texto que vai ao modelo (nomes de disciplina e
 * do ciclo são digitados pelo aluno e chegam dentro das frases factuais).
 * Remove caracteres de controle, invisíveis (zero-width) e de direção (bidi)
 * — usados para esconder instruções —, normaliza Unicode (NFC), colapsa
 * espaços e corta no teto. Não reescreve conteúdo: só limpa e limita.
 */
// eslint-disable-next-line no-control-regex -- remover caracteres de controle é o objetivo
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g
export function sanitizeForLLM(value: string, max: number): string {
  const clean = value.normalize("NFC").replace(INVISIBLE, "").replace(/\s+/g, " ").trim()
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

function sanitizeEvidence(e: Record<string, number | string | boolean | null | string[]>) {
  const out: Record<string, number | string | boolean | null | string[]> = {}
  for (const [k, v] of Object.entries(e)) {
    if (typeof v === "string") out[k] = sanitizeForLLM(v, MAX_LLM_NAME_CHARS)
    else if (Array.isArray(v)) out[k] = v.map((x) => sanitizeForLLM(String(x), MAX_LLM_NAME_CHARS))
    else out[k] = v
  }
  return out
}

export interface MentorRefMap {
  insights: Map<string, StudentMentorContext["insights"][number]>
  candidates: Map<string, StudentMentorContext["recommendations"][number]>
  disciplines: Map<string, StudentMentorContext["disciplines"][number]>
}

export function buildMentorLLMInput(
  ctx: StudentMentorContext,
  promptVersion: MentorPromptVersion = MENTOR_PROMPT_VERSION,
): { input: MentorLLMInput; refs: MentorRefMap } {
  // Disciplinas relevantes: as citadas por insights/candidatas primeiro, depois
  // as com mais estudo (ordem do contexto). Teto fixo para custo previsível.
  const cited = new Set<string>()
  for (const i of ctx.insights) if (i.disciplineId) cited.add(i.disciplineId)
  for (const r of ctx.recommendations) if (r.disciplineId) cited.add(r.disciplineId)
  const ordered = [
    ...ctx.disciplines.filter((d) => cited.has(d.disciplineId)),
    ...ctx.disciplines.filter((d) => !cited.has(d.disciplineId) && ((d.studyMinutesTotal ?? 0) > 0 || d.simuladosCount > 0)),
  ].slice(0, MAX_DISCIPLINES)

  const refs: MentorRefMap = { insights: new Map(), candidates: new Map(), disciplines: new Map() }
  const disciplineRefById = new Map<string, string>()
  ordered.forEach((d, i) => {
    const ref = `D${i + 1}`
    refs.disciplines.set(ref, d)
    disciplineRefById.set(d.disciplineId, ref)
  })
  const dRef = (id: string | null) => (id ? (disciplineRefById.get(id) ?? null) : null)

  const insights = ctx.insights.map((i, idx) => {
    const ref = `I${idx + 1}`
    refs.insights.set(ref, i)
    return {
      ref,
      type: i.type,
      priority: i.priority,
      disciplineRef: dRef(i.disciplineId),
      fact: sanitizeForLLM(i.message, MAX_LLM_FACT_CHARS),
      evidence: sanitizeEvidence(i.evidence),
    }
  })
  const candidates = ctx.recommendations.map((r, idx) => {
    const ref = `R${idx + 1}`
    refs.candidates.set(ref, r)
    return {
      ref,
      type: r.type,
      priority: r.priority,
      disciplineRef: dRef(r.disciplineId),
      reason: sanitizeForLLM(r.reason, MAX_LLM_FACT_CHARS),
      evidence: sanitizeEvidence(r.evidence),
    }
  })

  const input: MentorLLMInput = {
    promptVersion,
    contextVersion: ctx.version,
    today: ctx.todayKey,
    contextQuality: { level: ctx.contextQuality.level, reasons: ctx.contextQuality.reasons.map((r) => sanitizeForLLM(r, MAX_LLM_FACT_CHARS)) },
    sections: {
      study: ctx.study.status,
      simulations: ctx.simulations.status,
      reviews: ctx.reviews.status,
      cycle: ctx.cycle.status,
      planning: ctx.planning.status,
      goals: ctx.goals.status,
      edital: ctx.edital.status,
    },
    daysToExam: ctx.target.daysToExam,
    disciplines: ordered.map((d) => ({
      ref: disciplineRefById.get(d.disciplineId) as string,
      name: sanitizeForLLM(d.name, MAX_LLM_NAME_CHARS),
      studyMinutesLast28: d.studyMinutesLast28,
      simuladosCount: d.simuladosCount,
      simuladoAverage: d.simuladoAverage,
      simuladoEvolutionPp: d.simuladoEvolutionPp,
    })),
    insights,
    candidates,
  }

  // Teto de tamanho: corta primeiro as disciplinas NÃO citadas (do fim).
  // G2.17: se ainda assim passar do teto e for preciso cortar uma disciplina
  // citada, a referência some também dos insights/candidatas (disciplineRef
  // = null). Antes ficava um "D…" órfão: o modelo o devolvia e a resposta era
  // rejeitada como "disciplineRef inexistente" sem culpa do modelo.
  const citedRefs = new Set([...input.insights, ...input.candidates].map((x) => x.disciplineRef).filter((r): r is string => r !== null))
  const tooBig = () => JSON.stringify(input).length > MAX_LLM_INPUT_CHARS
  for (let i = input.disciplines.length - 1; i >= 0 && tooBig(); i -= 1) {
    const d = input.disciplines[i]
    if (d && !citedRefs.has(d.ref)) {
      input.disciplines.splice(i, 1)
      refs.disciplines.delete(d.ref)
    }
  }
  while (tooBig() && input.disciplines.length > 0) {
    const last = input.disciplines.pop()
    if (!last) break
    refs.disciplines.delete(last.ref)
    for (const x of [...input.insights, ...input.candidates]) if (x.disciplineRef === last.ref) x.disciplineRef = null
  }
  return { input, refs }
}
