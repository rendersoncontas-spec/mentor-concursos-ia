import { redirect } from "next/navigation"

/**
 * G2.16 — feed antigo do Mentor (heurístico) APOSENTADO.
 *
 * Havia dois "Mentores": este feed (MentorAIService + burnout heurístico, que
 * gravava uma linha em `mentor_history` a cada visita) e o Mentor
 * determinístico de /mentor (G2.15/G2.16). Esta rota agora só encaminha para
 * /mentor — nenhuma consulta, nenhum cálculo e nenhuma gravação acontecem
 * aqui. A tabela `mentor_history` e as 5 linhas antigas NÃO foram apagadas
 * (nenhuma tela as lê; ver docs/g2-16-mentor-llm-report.md).
 */
export default function LegacyMentorPage() {
  redirect("/mentor")
}
