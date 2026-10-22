import type { DisciplineData, TopicItem } from "@/features/edital/components/edital-accordion"
import type { EditalActions } from "@/features/edital/edital-actions"

/**
 * G2.24 — Edital SINTÉTICO e com estado em memória (progresso por tópico,
 * disciplinas e tópicos personalizados). Nenhum dado pessoal e nenhuma chamada
 * de rede.
 *
 * Estados: `data`; `progress-error` (a leitura do progresso falha — a tela não
 * pode fingir "0 concluídos" como se fosse verdade); `save-error` (salvar o
 * progresso falha — a marcação otimista é desfeita e o aluno é avisado).
 */
export type EditalHarnessState = "data" | "progress-error" | "save-error"

export const EDITAL_HARNESS_TARGET_ID = "e2e0e2e0-0000-4000-8000-000000000001"
export const EDITAL_HARNESS_TARGET_NAME = "Concurso fictício (E2E)"

const topic = (
  id: string,
  number: number,
  title: string,
  stats: Partial<TopicItem> = {},
): TopicItem => ({
  id,
  number,
  title,
  correct: 0,
  wrong: 0,
  questions: 0,
  accuracy: 0,
  lastStudy: null,
  studyCount: 0,
  link: null,
  ...stats,
})

export function buildEditalFixture(): DisciplineData[] {
  return [
    {
      id: "d0a1b2c3-0001-4000-8000-000000000001",
      name: "Língua Portuguesa",
      color: "#2563EB",
      topics: [
        topic("port-1", 1, "COMPREENSÃO E INTERPRETAÇÃO DE TEXTOS.", { correct: 18, wrong: 6, questions: 24, accuracy: 75, lastStudy: "05/10/2026", studyCount: 4, link: "https://example.com/caderno-1" }),
        topic("port-2", 2, "PONTUAÇÃO E CONCORDÂNCIA NOMINAL E VERBAL.", { correct: 9, wrong: 11, questions: 20, accuracy: 45, lastStudy: "02/10/2026", studyCount: 2 }),
        topic("custom-1", 3, "CRASE (TÓPICO PERSONALIZADO)."),
      ],
    },
    {
      id: "d0a1b2c3-0002-4000-8000-000000000002",
      name: "Contabilidade Geral",
      color: "#10b981",
      topics: [
        topic("cont-1", 1, "DEPRECIAÇÃO, AMORTIZAÇÃO E EXAUSTÃO.", { correct: 5, wrong: 5, questions: 10, accuracy: 50, lastStudy: "28/09/2026", studyCount: 1 }),
        topic("cont-2", 2, "REGIME DE COMPETÊNCIA."),
      ],
    },
    {
      id: "d0a1b2c3-0003-4000-8000-000000000003",
      name: "Direito Tributário",
      color: "#f59e0b",
      topics: [topic("trib-1", 1, "IMUNIDADES E LIMITAÇÕES AO PODER DE TRIBUTAR.")],
    },
  ]
}

export function createFakeEditalActions(state: EditalHarnessState): EditalActions {
  const delay = () => new Promise<void>((resolve) => setTimeout(resolve, 100))
  // progresso salvo no "servidor" (memória): 1 tópico já concluído
  const checked: Record<string, boolean> = { "port-1": true }
  let seq = 0

  return {
    async getEditalTopicProgressAction() {
      await delay()
      if (state === "progress-error") {
        return { success: false, checked: {}, storageUnavailable: false, error: "Falha simulada de leitura." }
      }
      return { success: true, checked: { ...checked }, storageUnavailable: false }
    },
    async setEditalTopicProgressAction(_target, topicKey, value) {
      await delay()
      if (state === "save-error") return { success: false, storageUnavailable: false, error: "Falha simulada ao salvar." }
      if (value) checked[topicKey] = true
      else delete checked[topicKey]
      return { success: true, storageUnavailable: false }
    },
    async deleteEditalTopicProgressAction(_target, topicKey) {
      await delay()
      delete checked[topicKey]
      return { success: true, storageUnavailable: false }
    },
    async importEditalTopicProgressAction() {
      await delay()
      return { success: true, imported: 0, storageUnavailable: false }
    },
    async searchDisciplinesAction(query: string) {
      await delay()
      const all = ["Direito Penal", "Direito Constitucional", "Informática"]
      return { success: true, data: all.filter((n) => n.toLowerCase().includes(query.trim().toLowerCase())) }
    },
    async addCustomDisciplineAction(name) {
      await delay()
      seq += 1
      return { success: true, data: { id: `d0a1b2c3-0100-4000-8000-${String(seq).padStart(12, "0")}`, name: name.trim() } }
    },
    async saveCustomTopicsAction() {
      await delay()
      return { success: true }
    },
    async removeCustomTopicAction() {
      await delay()
      return { success: true }
    },
    async removeDisciplineAction(disciplineId) {
      await delay()
      // a Contabilidade também está em ciclos ativos: o aviso informativo aparece
      return disciplineId.endsWith("0002") ? { success: true, activeCyclesWithDiscipline: 1 } : { success: true }
    },
    async createCustomTopicAction() {
      await delay()
      return { success: true }
    },
  }
}
