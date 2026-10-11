import { z } from "zod"

import {
  MENTOR_PROMPT_VERSION,
  type MentorAIResponse,
  type MentorLLMInput,
  type MentorPromptVersion,
} from "@/domain/mentor/mentor-ai"

/**
 * G2.16 → G2.18 — validação da resposta do modelo. Regra: resposta inválida é
 * DESCARTADA inteira (nada de "consertar" texto perigoso). A tela continua
 * com o Mentor determinístico.
 *
 * Camadas:
 *   1. tamanho bruto e JSON;
 *   2. schema estrito por versão (campos, tipos, tamanhos, sem extras);
 *   3. referências: existem, da categoria certa, sem repetição, sem formato
 *      alterado; evidência da mesma disciplina da candidata;
 *   4. texto (G2.18): REFERÊNCIA ≠ NÚMERO — tokens "D…/I…/R…" válidos são
 *      separados do texto antes da checagem de números; nomes oficiais de
 *      disciplina (dados do aluno, podem ter algarismos) também. No que sobra
 *      (o texto ESCRITO pelo modelo): nenhum número, data, mês, quantificação,
 *      causalidade, ação fingida, conteúdo suspeito (links, chaves, prompt) ou
 *      caractere invisível;
 *   5. fidelidade: não contradiz a direção do fato; não afirma nada sobre
 *      seção sem dados; disciplinas citadas no texto pertencem ao bloco;
 *   6. confiança coerente com a qualidade do contexto.
 */

export const MAX_SUMMARY_CHARS = 600
export const MAX_TEXT_CHARS = 280
export const MAX_EXPLANATION_CHARS = 400
export const MAX_TITLE_CHARS = 80
/** Resposta bruta maior que isto nem é interpretada (saída enorme = rejeitada). */
export const MAX_RAW_RESPONSE_CHARS = 16_000

export type MentorRejectionCode =
  | "SCHEMA"
  | "REF_UNKNOWN"
  | "REF_DUPLICATE"
  | "REF_MALFORMED"
  | "REF_AS_NUMBER"
  | "REF_OUT_OF_BLOCK"
  | "EVIDENCE_MISMATCH"
  | "DISCIPLINE_MISMATCH"
  | "NUMBER"
  | "DATE"
  | "QUANTITY"
  | "CAUSALITY"
  | "PRETEND_ACTION"
  | "SUSPICIOUS_CONTENT"
  | "INVISIBLE_CHARS"
  | "CONTRADICTS_FACT"
  | "NO_DATA_CLAIM"
  | "CONFIDENCE"

export interface MentorRejection {
  code: MentorRejectionCode
  field: string
  message: string
}

const text = (max: number) => z.string().trim().min(1).max(max)
const IREF = /^I[1-9]\d{0,2}$/
const RREF = /^R[1-9]\d{0,2}$/
const DREF = /^D[1-9]\d{0,2}$/
const IRREF = /^[IR][1-9]\d{0,2}$/

const Highlight = z.strictObject({ insightRef: z.string().regex(IREF), kind: z.literal("INTERPRETATION"), text: text(MAX_TEXT_CHARS) })
const Attention = z.strictObject({ insightRef: z.string().regex(IREF), disciplineRef: z.string().regex(DREF).nullable(), text: text(MAX_TEXT_CHARS) })
const recommendation = (minEvidence: number) =>
  z.strictObject({
    id: z.string().regex(/^[a-z0-9-]{1,40}$/),
    candidateId: z.string().regex(RREF),
    title: text(MAX_TITLE_CHARS),
    explanation: text(MAX_EXPLANATION_CHARS),
    evidenceIds: z.array(z.string().regex(IRREF)).min(minEvidence).max(8),
  })
const common = {
  summary: text(MAX_SUMMARY_CHARS),
  highlights: z.array(Highlight).max(5),
  attentionPoints: z.array(Attention).max(4),
  confidence: z.enum(["high", "medium", "low"]),
  insufficientData: z.boolean(),
}
const SCHEMAS = {
  "mentor-v1": z.strictObject({ ...common, recommendations: z.array(recommendation(0)).max(4) }),
  "mentor-v2": z.strictObject({
    ...common,
    summaryRefs: z.array(z.string().regex(IRREF)).min(1).max(6),
    recommendations: z.array(recommendation(1)).max(4),
  }),
} as const

// ─── Padrões de conteúdo ─────────────────────────────────────────────────────

/** Token de referência isolado (não colado em letras/algarismos). */
const REF_TOKEN = /(?<![\p{L}\p{N}])([DIR])(\d{1,4})(?![\p{L}\p{N}])/gu
/** Referência usada como valor: "D2%", "D2 pontos", "+D2". */
const REF_UNIT_AFTER = /^\s*(%|p\.?\s?p\.?|pontos?\b|horas?\b|h\b|min\b|minutos?\b|quest(?:ões|oes)\b|vezes\b|x\b)/iu
const REF_SIGN_BEFORE = /[+\-−±]\s*$/u
const DIGITS = /\p{N}/u
const NUMBER_WORDS =
  /\b(dois|duas|três|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|mil)\s+(e\s+\w+\s+)?(horas?|minutos?|dias?|semanas?|meses|anos?|simulados?|revis(?:ão|ões|ao|oes)|questões|questoes|sessões|sessoes|por\s+cento|pontos?|vezes)\b/iu
const PERCENT_WORDS = /\bpor\s+cento\b|\bpercentua(?:l|is)\s+de\b/iu
const MONTHS = /\b(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/iu
const MULTIPLIER = /\b(dobro|triplo|quádruplo|quadruplo|dobrou|triplicou|duplicou|quadruplicou|metade d[oa]s?)\b/iu
const CAUSAL =
  /\b(causou|causaram|causa(?:do|da)? por|por causa d|graças (?:a|à|ao|aos|às)\s|fez com que|resultou|resultaram|resultado direto|provocou|provocaram|levou (?:a|ao|à|você)|levaram (?:a|ao|à)|responsáve(?:l|is) (?:por|pel)|em decorrência|em consequência|como consequência|devido (?:a|ao|à|aos|às)|em razão d|porque (?:você )?(?:estudou|fez|deixou|parou|dedicou|treinou|revisou|praticou|aumentou|diminuiu)|pois (?:você )?(?:estudou|fez|deixou|parou|dedicou|treinou|revisou|praticou))/iu
const RESULT_BECAUSE = /\b(melhor\w*|pior\w*|caiu|caíram|subiu|cresceu|evoluiu|aument\w+|diminu\w+)\b[^.!?]{0,40}\b(porque|pois|já que|uma vez que)\b/iu
const PRETEND_ACTION =
  /\b(alterei|agendei|criei|salvei|atualizei|removi|apaguei|marquei|registrei|ajustei|mudei|enviei|configurei|reorganizei|cadastrei|ignorei)\b/iu
const SUSPICIOUS =
  /(https?:|www\.|\b[\w.+-]+@[\w-]+\.\w|chave d[ae] api|api[ -]?key|\bsenhas?\b|\btokens?\b|system prompt|prompt do sistema|\bprompt\b|instruções anteriores|ignore (?:as|todas|previous)|previous instructions)/iu
// eslint-disable-next-line no-control-regex -- detectar caracteres de controle/invisíveis é o objetivo
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/u
const NEGATIVE_WORDS = /\b(piorou|piora|caiu|caíram|queda|declínio|declinou|regrediu|recuou|recuo|despencou|baixou|retrocesso)\b/iu
const POSITIVE_WORDS = /\b(melhorou|melhoraram|evoluiu|subiu|cresceu|avançou|progrediu)\b/iu
/** Frase que fala de AUSÊNCIA ou SUGERE algo (não é afirmação de fato). */
const ABSENCE_OR_SUGGESTION =
  /\b(não há|ainda não|sem\b|nenhum|nenhuma|faltam?|não tem|não possui|não houve|quando houver|assim que|registr\w*|vale|considere|comece|começar|experimente|sugest\w*|pode ajudar|podem ajudar)\b/iu
const SECTION_TERMS: Record<string, RegExp> = {
  simulations: /\bsimulad\w*/iu,
  reviews: /\brevis(?:ão|ões|ao|oes)\b/iu,
  goals: /\bmetas?\b/iu,
  cycle: /\bciclos?\b/iu,
  edital: /\bedital\b/iu,
  planning: /\b(?:planejamento|plano semanal)\b/iu,
  study: /\b(?:estudou|sessões|sessão)\b/iu,
}

// ─── Referências permitidas (derivadas do pedido) ────────────────────────────

export interface MentorAllowedRefs {
  insightRefs: ReadonlySet<string>
  candidateRefs: ReadonlySet<string>
  disciplineRefs: ReadonlySet<string>
  /** Disciplina de cada insight ("I1" → "D2" | null). */
  insightDiscipline?: ReadonlyMap<string, string | null>
  /** Disciplina de cada candidata ("R1" → "D2" | null). */
  candidateDiscipline?: ReadonlyMap<string, string | null>
  /** Direção de cada insight (para não contradizer o fato). */
  insightDirection?: ReadonlyMap<string, "UP" | "DOWN" | null>
  /** Nomes oficiais enviados (dados do aluno; podem ter algarismos). */
  disciplineNames?: readonly string[]
  /** Status das seções enviadas. */
  sections?: Readonly<Record<string, string>>
  quality: "EMPTY" | "LOW" | "MEDIUM" | "HIGH"
  promptVersion?: MentorPromptVersion
}

function directionOf(i: MentorLLMInput["insights"][number]): "UP" | "DOWN" | null {
  if (i.type === "IMPROVING_DISCIPLINE") return "UP"
  if (i.type === "DECLINING_DISCIPLINE") return "DOWN"
  if (i.type === "SIMULADO_EVOLUTION") {
    const t = i.evidence["trend"]
    return t === "UP" || t === "DOWN" ? t : null
  }
  return null
}

/** Uma única fonte para o que a resposta pode citar: o próprio pedido. */
export function buildAllowedRefs(input: MentorLLMInput): MentorAllowedRefs {
  return {
    insightRefs: new Set(input.insights.map((i) => i.ref)),
    candidateRefs: new Set(input.candidates.map((c) => c.ref)),
    disciplineRefs: new Set(input.disciplines.map((d) => d.ref)),
    insightDiscipline: new Map(input.insights.map((i) => [i.ref, i.disciplineRef])),
    candidateDiscipline: new Map(input.candidates.map((c) => [c.ref, c.disciplineRef])),
    insightDirection: new Map(input.insights.map((i) => [i.ref, directionOf(i)])),
    disciplineNames: input.disciplines.map((d) => d.name),
    sections: input.sections,
    quality: input.contextQuality.level,
    promptVersion: input.promptVersion,
  }
}

// ─── Análise de texto ────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Separa o que é ESTRUTURA (referências válidas, nomes oficiais) do que o
 * modelo ESCREVEU e verifica só o escrito. `scope`: disciplinas que o bloco
 * pode citar (null = sem restrição de bloco).
 */
function textProblems(field: string, value: string, allowed: MentorAllowedRefs, scope: ReadonlySet<string> | null): MentorRejection[] {
  const out: MentorRejection[] = []
  const add = (code: MentorRejectionCode, message: string) => out.push({ code, field, message })
  if (INVISIBLE.test(value)) add("INVISIBLE_CHARS", "caractere invisível ou de controle")

  let written = ""
  let last = 0
  for (const m of value.matchAll(REF_TOKEN)) {
    const [token, letter, digits] = m as unknown as [string, "D" | "I" | "R", string]
    const at = m.index ?? 0
    written += value.slice(last, at) + " "
    last = at + token.length
    if (digits.startsWith("0")) {
      add("REF_MALFORMED", `referência alterada (${token})`)
      continue
    }
    const set = { D: allowed.disciplineRefs, I: allowed.insightRefs, R: allowed.candidateRefs }[letter]
    if (!set.has(token)) {
      add("REF_UNKNOWN", `referência inexistente no texto (${token})`)
      continue
    }
    if (REF_UNIT_AFTER.test(value.slice(last)) || REF_SIGN_BEFORE.test(value.slice(0, at))) add("REF_AS_NUMBER", `referência usada como número (${token})`)
    if (letter === "D" && scope && !scope.has(token)) add("REF_OUT_OF_BLOCK", `disciplina ${token} não pertence a este bloco`)
  }
  written += value.slice(last)
  // Nomes oficiais (dado do aluno) não são "números do modelo".
  for (const name of [...(allowed.disciplineNames ?? [])].sort((a, b) => b.length - a.length)) {
    if (name.trim().length >= 2) written = written.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(name)}(?![\\p{L}\\p{N}])`, "giu"), " ")
  }

  if (DIGITS.test(written) || written.includes("%")) add("NUMBER", "contém número")
  if (NUMBER_WORDS.test(written) || PERCENT_WORDS.test(written)) add("NUMBER", "contém número por extenso")
  if (MONTHS.test(written)) add("DATE", "contém data")
  if (MULTIPLIER.test(written)) add("QUANTITY", "contém quantificação")
  if (CAUSAL.test(written) || RESULT_BECAUSE.test(written)) add("CAUSALITY", "afirma causalidade")
  if (PRETEND_ACTION.test(written)) add("PRETEND_ACTION", "finge ter executado uma ação")
  if (SUSPICIOUS.test(written)) add("SUSPICIOUS_CONTENT", "conteúdo suspeito (link, credencial ou instrução)")

  // Afirmação sobre seção sem dados (frase a frase).
  for (const sentence of written.split(/(?<=[.!?;])\s+/u)) {
    if (ABSENCE_OR_SUGGESTION.test(sentence)) continue
    for (const [section, term] of Object.entries(SECTION_TERMS)) {
      const status = allowed.sections?.[section]
      if (status && status !== "OK" && term.test(sentence)) add("NO_DATA_CLAIM", `afirma algo sobre "${section}", que não tem dados`)
    }
  }
  return out
}

function contradiction(field: string, value: string, direction: "UP" | "DOWN" | null | undefined): MentorRejection[] {
  if (direction === "UP" && NEGATIVE_WORDS.test(value)) return [{ code: "CONTRADICTS_FACT", field, message: "fala em queda num fato de melhora" }]
  if (direction === "DOWN" && POSITIVE_WORDS.test(value)) return [{ code: "CONTRADICTS_FACT", field, message: "fala em melhora num fato de queda" }]
  return []
}

export type MentorValidationResult =
  | { ok: true; value: MentorAIResponse }
  | { ok: false; reasons: string[]; rejections: MentorRejection[] }

export function parseMentorAIText(raw: string): unknown {
  if (raw.length > MAX_RAW_RESPONSE_CHARS) throw new Error("mentor-llm: resposta grande demais")
  const trimmed = raw.trim()
  // Aceita só o objeto JSON; cercas de código (```json) são removidas, nada mais.
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
  return JSON.parse(unfenced) as unknown
}

export function validateMentorAIResponse(raw: unknown, allowed: MentorAllowedRefs): MentorValidationResult {
  const version = allowed.promptVersion ?? MENTOR_PROMPT_VERSION
  const parsed = SCHEMAS[version].safeParse(raw)
  if (!parsed.success) {
    const rejections = parsed.error.issues.slice(0, 10).map((i): MentorRejection => ({ code: "SCHEMA", field: i.path.join(".") || "(raiz)", message: i.code }))
    return { ok: false, rejections, reasons: rejections.map((r) => `schema: ${r.field} ${r.message}`) }
  }
  const r: MentorAIResponse = { summaryRefs: [], ...parsed.data }
  const out: MentorRejection[] = []
  const push = (code: MentorRejectionCode, field: string, message: string) => out.push({ code, field, message })
  const discOfI = (ref: string) => allowed.insightDiscipline?.get(ref) ?? null
  const discOfR = (ref: string) => allowed.candidateDiscipline?.get(ref) ?? null
  const discOf = (ref: string) => (ref.startsWith("I") ? discOfI(ref) : discOfR(ref))
  const scopeOf = (refs: string[], extra: (string | null)[] = []) => {
    const s = new Set<string>()
    for (const ref of refs) {
      const d = discOf(ref)
      if (d) s.add(d)
    }
    for (const d of extra) if (d) s.add(d)
    return s
  }
  const existsIR = (ref: string) => (ref.startsWith("I") ? allowed.insightRefs.has(ref) : allowed.candidateRefs.has(ref))
  const noDup = (field: string, refs: string[]) => {
    const seen = new Set<string>()
    for (const ref of refs) {
      if (seen.has(ref)) push("REF_DUPLICATE", field, `referência repetida (${ref})`)
      seen.add(ref)
    }
  }

  // Resumo
  noDup("summaryRefs", r.summaryRefs)
  for (const ref of r.summaryRefs) if (!existsIR(ref)) push("REF_UNKNOWN", "summaryRefs", `referência inexistente (${ref})`)
  out.push(...textProblems("summary", r.summary, allowed, version === "mentor-v2" ? scopeOf(r.summaryRefs) : null))

  // Destaques
  noDup("highlights", r.highlights.map((h) => h.insightRef))
  r.highlights.forEach((h, i) => {
    const f = `highlights.${i}`
    if (!allowed.insightRefs.has(h.insightRef)) push("REF_UNKNOWN", f, `insightRef inexistente (${h.insightRef})`)
    out.push(...textProblems(f, h.text, allowed, scopeOf([h.insightRef])))
    out.push(...contradiction(f, h.text, allowed.insightDirection?.get(h.insightRef)))
  })

  // Pontos de atenção
  noDup("attentionPoints", r.attentionPoints.map((a) => a.insightRef))
  r.attentionPoints.forEach((a, i) => {
    const f = `attentionPoints.${i}`
    if (!allowed.insightRefs.has(a.insightRef)) push("REF_UNKNOWN", f, `insightRef inexistente (${a.insightRef})`)
    if (a.disciplineRef !== null && !allowed.disciplineRefs.has(a.disciplineRef)) push("REF_UNKNOWN", f, `disciplineRef inexistente (${a.disciplineRef})`)
    const expected = allowed.insightDiscipline?.get(a.insightRef)
    if (a.disciplineRef !== null && expected !== undefined && expected !== a.disciplineRef) push("DISCIPLINE_MISMATCH", f, "disciplineRef não é a matéria do insight")
    out.push(...textProblems(f, a.text, allowed, scopeOf([a.insightRef], [a.disciplineRef])))
    out.push(...contradiction(f, a.text, allowed.insightDirection?.get(a.insightRef)))
  })

  // Recomendações
  const ids = new Set<string>()
  noDup("recommendations.candidateId", r.recommendations.map((x) => x.candidateId))
  r.recommendations.forEach((rec, i) => {
    const f = `recommendations.${i}`
    if (ids.has(rec.id)) push("REF_DUPLICATE", f, "id repetido")
    ids.add(rec.id)
    if (!allowed.candidateRefs.has(rec.candidateId)) push("REF_UNKNOWN", f, `candidateId inexistente (${rec.candidateId})`)
    noDup(`${f}.evidenceIds`, rec.evidenceIds)
    const candDisc = discOfR(rec.candidateId)
    for (const e of rec.evidenceIds) {
      if (!existsIR(e)) {
        push("REF_UNKNOWN", f, `evidenceId inexistente (${e})`)
        continue
      }
      const eDisc = discOf(e)
      if (candDisc && eDisc && eDisc !== candDisc) push("EVIDENCE_MISMATCH", f, `evidência ${e} é de outra disciplina`)
    }
    const scope = scopeOf([rec.candidateId, ...rec.evidenceIds])
    out.push(...textProblems(`${f}.title`, rec.title, allowed, scope))
    out.push(...textProblems(`${f}.explanation`, rec.explanation, allowed, scope))
  })

  // Confiança × qualidade do contexto (nunca acima do que os dados permitem).
  const q = allowed.quality
  if ((q === "EMPTY" || q === "LOW") && r.confidence !== "low") push("CONFIDENCE", "confidence", `"${r.confidence}" incompatível com qualidade ${q}`)
  if (q === "MEDIUM" && r.confidence === "high") push("CONFIDENCE", "confidence", `"high" incompatível com qualidade MEDIUM`)
  if (q === "EMPTY" && !r.insufficientData) push("CONFIDENCE", "insufficientData", "contexto EMPTY exige insufficientData")
  if (version === "mentor-v2") {
    if (q === "LOW" && !r.insufficientData) push("CONFIDENCE", "insufficientData", "contexto LOW exige insufficientData")
    if (r.insufficientData && r.confidence !== "low") push("CONFIDENCE", "confidence", "insufficientData exige confiança baixa")
  }

  if (out.length === 0) return { ok: true, value: r }
  return { ok: false, rejections: out, reasons: out.map((x) => `${x.field}: ${x.message}`) }
}
