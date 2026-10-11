/**
 * Dados do concurso-alvo ativo (`user_targets`), com a sobreposição que o
 * cadastro grava em `main_study_source` como JSON ({ examDate, examTime,
 * examLocation, examName }). Extraído de dashboard.service.ts (G2.15) para o
 * Dashboard e o contexto do Mentor lerem o alvo da MESMA forma.
 *
 * Sem valor inventado: campo ausente → null (o Dashboard aplica os rótulos
 * padrão de exibição por conta própria).
 */
export interface ResolvedTargetFields {
  examDate: string | null
  examTime: string | null
  examLocation: string | null
  examName: string | null
}

export function resolveTargetFields(raw: {
  exam_date?: string | null
  exam_time?: string | null
  exam_location?: string | null
  exam_name?: string | null
  main_study_source?: string | null
} | null | undefined): ResolvedTargetFields {
  let examDate = raw?.exam_date || null
  let examTime = raw?.exam_time || null
  let examLocation = raw?.exam_location || null
  let examName = raw?.exam_name || null
  const source = raw?.main_study_source
  if (source) {
    try {
      if (source.startsWith("{") && source.endsWith("}")) {
        const meta = JSON.parse(source) as Record<string, unknown>
        if (typeof meta["examDate"] === "string" && meta["examDate"]) examDate = meta["examDate"]
        if (typeof meta["examTime"] === "string" && meta["examTime"]) examTime = meta["examTime"]
        if (typeof meta["examLocation"] === "string" && meta["examLocation"]) examLocation = meta["examLocation"]
        if (typeof meta["examName"] === "string" && meta["examName"]) examName = meta["examName"]
      }
    } catch {
      // Ignorar se não for JSON válido
    }
  }
  return { examDate, examTime, examLocation, examName }
}
