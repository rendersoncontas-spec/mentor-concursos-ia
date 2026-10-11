// ============================================================================
// G2.13 — simulados por disciplina nas Estatísticas (puro, testável).
// ----------------------------------------------------------------------------
// Os registros chegam do servidor JÁ na identidade canônica (payload da
// Central de Estatísticas). Aqui só se aplica o período e o filtro de matéria
// da página e se reaproveita o MESMO cálculo da tela de Simulados
// (`buildSubjectAnalysis`, G2.10) — nenhuma conta nova.
// ============================================================================

import { buildSubjectAnalysis } from "@/application/simulados/simulado-stats.service"
import type { SimuladoRecord, SimuladoSubjectAnalysis } from "@/domain/simulados/types"

/**
 * Simulados do período (data do simulado entre o 1º e o último dia da janela;
 * "Tudo" = todos) e, com filtro de matéria, só os que têm essa matéria.
 * O filtro de TIPO de estudo não se aplica: simulado externo não é sessão.
 */
export function filterSimuladosForStatistics(
  records: SimuladoRecord[],
  rangeKeys: string[],
  isAllRange: boolean,
  disciplineId: string,
): SimuladoRecord[] {
  const min = rangeKeys[0]
  const max = rangeKeys[rangeKeys.length - 1]
  return records.filter((r) => {
    if (!isAllRange) {
      if (!min || !max || !r.simuladoDate) return false
      if (r.simuladoDate < min || r.simuladoDate > max) return false
    }
    if (disciplineId !== "all" && !r.subjects.some((s) => s.disciplineId === disciplineId)) return false
    return true
  })
}

/** Análise por disciplina (só matérias com id: são as que casam com as sessões). */
export function simuladoAnalysisByDiscipline(records: SimuladoRecord[]): Map<string, SimuladoSubjectAnalysis> {
  const map = new Map<string, SimuladoSubjectAnalysis>()
  for (const a of buildSubjectAnalysis(records)) {
    if (a.disciplineId) map.set(a.disciplineId, a)
  }
  return map
}
