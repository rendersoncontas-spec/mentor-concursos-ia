/**
 * Texto do selo "1º lugar" do card "Sua Classificação" (Ranking).
 *
 * `get_ranking_top1_counts` devolve DOIS contadores independentes: em quantos
 * DIAS e em quantas SEMANAS o aluno fechou em 1º no ranking de tempo estudado.
 * A frase antiga ("40 dias e 7 semanas em 1º lugar") parecia uma duração
 * somada; aqui cada contador aparece como "N vezes" no seu próprio período, e
 * o contador zerado é omitido.
 */
export function top1CountsLabel(counts: { daysAtTop: number; weeksAtTop: number }): string {
  const times = (n: number) => `${n} ${n === 1 ? "vez" : "vezes"}`
  const parts: string[] = []
  if (counts.daysAtTop > 0) parts.push(`${times(counts.daysAtTop)} no dia`)
  if (counts.weeksAtTop > 0) parts.push(`${times(counts.weeksAtTop)} na semana`)
  return `1º no tempo estudado: ${parts.join(" · ")}`
}
