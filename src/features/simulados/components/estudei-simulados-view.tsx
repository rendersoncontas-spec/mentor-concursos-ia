"use client"

import { useState, useEffect } from "react"
import {
  ListCheck,
  Plus,
  ChevronDown,
  FileCheck,
  TrendingUp,
  BarChart2,
  Trash2,
  Calendar,
  CheckCircle,
  XCircle,
  HelpCircle,
  GraduationCap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { toast } from "sonner"

export interface DisciplineSimuladoRow {
  id: string
  name: string
  peso: number
  totalQuestions: number
  correct: number
  blank: number
  wrong: number
}

export interface SimuladoItem {
  id: string
  name: string
  date: string
  banca: string
  style: "Múltipla Escolha" | "Certo/Errado"
  timeSpent: string
  disciplines: DisciplineSimuladoRow[]
  comments: string
  totalQuestions: number
  totalCorrect: number
  totalBlank: number
  totalWrong: number
  scorePercentage: number
}

const DEFAULT_DISCIPLINES: DisciplineSimuladoRow[] = [
  { id: "d1", name: "Administração Geral", peso: 1, totalQuestions: 0, correct: 0, blank: 0, wrong: 0 },
  { id: "d2", name: "Administração Pública", peso: 1, totalQuestions: 0, correct: 0, blank: 0, wrong: 0 },
  { id: "d3", name: "Contabilidade Geral", peso: 1, totalQuestions: 0, correct: 0, blank: 0, wrong: 0 },
  { id: "d4", name: "Direito Administrativo", peso: 1, totalQuestions: 0, correct: 0, blank: 0, wrong: 0 },
  { id: "d5", name: "Direito Constitucional", peso: 1, totalQuestions: 0, correct: 0, blank: 0, wrong: 0 },
  { id: "d6", name: "Direito Previdenciário", peso: 1, totalQuestions: 0, correct: 0, blank: 0, wrong: 0 },
  { id: "d7", name: "Direito Tributário", peso: 1, totalQuestions: 0, correct: 0, blank: 0, wrong: 0 },
  { id: "d8", name: "Estatística", peso: 1, totalQuestions: 0, correct: 0, blank: 0, wrong: 0 },
  { id: "d9", name: "Fluência em Dados", peso: 1, totalQuestions: 0, correct: 0, blank: 0, wrong: 0 },
  { id: "d10", name: "Legislação Aduaneira", peso: 1, totalQuestions: 0, correct: 0, blank: 0, wrong: 0 },
  { id: "d11", name: "Legislação Tributária", peso: 1, totalQuestions: 0, correct: 0, blank: 0, wrong: 0 },
  { id: "d12", name: "Língua Inglesa", peso: 1, totalQuestions: 0, correct: 0, blank: 0, wrong: 0 },
  { id: "d13", name: "Língua Portuguesa", peso: 1, totalQuestions: 0, correct: 0, blank: 0, wrong: 0 },
  { id: "d14", name: "Raciocínio Lógico", peso: 1, totalQuestions: 0, correct: 0, blank: 0, wrong: 0 },
]

export function EstudeiSimuladosView() {
  const [simulados, setSimulados] = useState<SimuladoItem[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [chartMode, setChartMode] = useState<"DESEMPENHO" | "PONTUACAO">("DESEMPENHO")

  // Modal Form State (Screenshots 2 e 3 100% Estudei)
  const [simuladoDate, setSimuladoDate] = useState("06/08/2026")
  const [simuladoName, setSimuladoName] = useState("")
  const [estiloProva, setEstiloProva] = useState<"Múltipla Escolha" | "Certo/Errado">("Múltipla Escolha")
  const [banca, setBanca] = useState("")
  const [tempoGasto, setTempoGasto] = useState("00:00:00")
  const [comments, setComments] = useState("")
  const [rows, setRows] = useState<DisciplineSimuladoRow[]>(DEFAULT_DISCIPLINES)

  useEffect(() => {
    const saved = localStorage.getItem("mentor_simulados_data")
    if (saved) {
      try {
        setSimulados(JSON.parse(saved))
      } catch (e) {}
    }
  }, [])

  const handleUpdateRow = (id: string, field: keyof DisciplineSimuladoRow, value: any) => {
    setRows(
      rows.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    )
  }

  const handleRemoveRow = (id: string) => {
    setRows(rows.filter((r) => r.id !== id))
  }

  // Cálculos do Modal
  const totalCorrectModal = rows.reduce((acc, r) => acc + Number(r.correct || 0), 0)
  const totalBlankModal = rows.reduce((acc, r) => acc + Number(r.blank || 0), 0)
  const totalWrongModal = rows.reduce((acc, r) => acc + Number(r.wrong || 0), 0)
  const totalQuestionsModal = rows.reduce((acc, r) => acc + Number(r.totalQuestions || 0), 0)
  const totalPointsModal = totalCorrectModal // Ou cálculo de pontos líquidos se Certo/Errado (1 acerto - 1 erro)
  const accuracyPercentageModal =
    totalQuestionsModal > 0 ? Math.round((totalCorrectModal / totalQuestionsModal) * 100) : 0

  const handleSaveSimulado = () => {
    if (!simuladoName.trim()) {
      toast.error("Informe o nome do simulado.")
      return
    }

    const newSimulado: SimuladoItem = {
      id: `sim-${Date.now()}`,
      name: simuladoName.trim(),
      date: simuladoDate,
      banca: banca || "FGV",
      style: estiloProva,
      timeSpent: tempoGasto,
      disciplines: rows,
      comments: comments,
      totalQuestions: totalQuestionsModal,
      totalCorrect: totalCorrectModal,
      totalBlank: totalBlankModal,
      totalWrong: totalWrongModal,
      scorePercentage: accuracyPercentageModal,
    }

    const updated = [newSimulado, ...simulados]
    setSimulados(updated)
    localStorage.setItem("mentor_simulados_data", JSON.stringify(updated))
    toast.success("Simulado registrado com sucesso!")

    setIsModalOpen(false)
    setSimuladoName("")
    setComments("")
    setRows(DEFAULT_DISCIPLINES)
  }

  const handleRemoveSimulado = (id: string) => {
    const updated = simulados.filter((s) => s.id !== id)
    setSimulados(updated)
    localStorage.setItem("mentor_simulados_data", JSON.stringify(updated))
    toast.success("Simulado removido com sucesso!")
  }

  const lastSimulado = simulados[0]

  return (
    <div className="space-y-6">
      {/* Header Actions — Paridade 100% Estudei Imagem 1 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-black text-foreground">Simulados</h1>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Button
            onClick={() => setIsModalOpen(true)}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-5 shadow-xs"
          >
            Novo Simulado
          </Button>

          <Button variant="outline" className="border-[#2563EB] text-[#2563EB] hover:bg-[#2563EB]/10 font-bold text-xs gap-2">
            <GraduationCap className="h-4 w-4" />
            Analista Tributário
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Top 3 Metric Cards Grid (Sua Foto 1 100% Estudei) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Card 1 & 3: SIMULADOS REALIZADOS + ÚLTIMO SIMULADO */}
        <div className="space-y-5">
          {/* Card SIMULADOS REALIZADOS */}
          <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between h-28">
            <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
              SIMULADOS REALIZADOS
            </span>
            <div className="text-right">
              <span className="text-3xl font-black text-foreground font-mono">{simulados.length}</span>
            </div>
          </div>

          {/* Card ÚLTIMO SIMULADO */}
          <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between h-32">
            <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
              ÚLTIMO SIMULADO
            </span>

            <div className="flex items-end justify-between pt-1">
              <div className="text-[11px] font-bold space-y-0.5">
                <span className="text-emerald-600 block">{lastSimulado ? lastSimulado.totalCorrect : 0} acertos</span>
                <span className="text-sky-500 block">{lastSimulado ? lastSimulado.totalBlank : 0} brancos</span>
                <span className="text-rose-500 block">{lastSimulado ? lastSimulado.totalWrong : 0} erros</span>
              </div>

              <span className="text-3xl font-black text-foreground font-mono">
                {lastSimulado ? `${lastSimulado.scorePercentage}%` : "0%"}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: SEU DESEMPENHO (Com os botões DESEMPENHO / PONTUAÇÃO no topo) */}
        <div className="lg:col-span-2 rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider">
              SEU DESEMPENHO
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setChartMode("DESEMPENHO")}
                className={`px-3 py-1 text-[10px] font-extrabold rounded-md transition-colors ${
                  chartMode === "DESEMPENHO"
                    ? "bg-[#2563EB] text-white shadow-xs"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                DESEMPENHO
              </button>

              <button
                type="button"
                onClick={() => setChartMode("PONTUACAO")}
                className={`px-3 py-1 text-[10px] font-extrabold rounded-md transition-colors ${
                  chartMode === "PONTUACAO"
                    ? "bg-[#2563EB] text-white shadow-xs"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                PONTUAÇÃO
              </button>
            </div>
          </div>

          <div className="min-h-[140px] flex items-center justify-center text-muted-foreground text-xs font-semibold">
            {simulados.length === 0 ? "Sem dados para exibir no gráfico" : "Gráfico de evolução do desempenho"}
          </div>
        </div>
      </div>

      {/* Área Principal (Estado Vazio ou Lista de Simulados - Foto 1 100% Estudei) */}
      {simulados.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 shadow-xs flex flex-col items-center justify-center text-center space-y-5 my-4">
          {/* Ilustração da Prancheta Dupla com Presilha Verde */}
          <div className="relative w-36 h-32 flex items-center justify-center">
            <div className="w-24 h-28 bg-muted/40 border-2 border-muted rounded-xl transform -rotate-6 flex flex-col p-3">
              <div className="w-8 h-2 bg-[#2563EB] rounded-xs mx-auto -mt-4 shadow-xs" />
            </div>

            <div className="w-24 h-28 bg-card border-2 border-[#2563EB] rounded-xl shadow-lg absolute transform rotate-6 flex flex-col p-3">
              <div className="w-8 h-2 bg-[#2563EB] rounded-xs mx-auto -mt-4 shadow-xs" />
            </div>
          </div>

          <div className="space-y-1 max-w-sm">
            <h3 className="text-base font-extrabold text-foreground">
              Você ainda não registrou nenhum simulado
            </h3>
            <p className="text-xs text-muted-foreground font-medium">Vamos registrar?</p>
          </div>

          <Button
            onClick={() => setIsModalOpen(true)}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-6 h-9 rounded-xl shadow-xs"
          >
            Novo Simulado
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-xs overflow-hidden">
          <div className="p-4 border-b bg-card flex items-center justify-between">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
              HISTÓRICO DE SIMULADOS
            </h3>
            <Badge variant="outline" className="text-[10px] font-semibold">
              {simulados.length} simulados
            </Badge>
          </div>

          <div className="divide-y">
            {simulados.map((s) => (
              <div key={s.id} className="p-4 flex items-center justify-between hover:bg-muted/20 transition-colors">
                <div className="space-y-1">
                  <h4 className="font-extrabold text-sm text-foreground">{s.name}</h4>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground font-semibold">
                    <span>{s.date}</span>
                    <span>•</span>
                    <span>{s.banca}</span>
                    <span>•</span>
                    <Badge variant="secondary" className="text-[10px] font-mono">{s.style}</Badge>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right text-xs font-mono">
                    <span className="text-emerald-600 font-bold">{s.totalCorrect}✔</span>{" "}
                    {s.style === "Certo/Errado" && <span className="text-sky-500 font-bold">{s.totalBlank}— </span>}
                    <span className="text-rose-500 font-bold">{s.totalWrong}✖</span>
                    <span className="block font-black text-foreground text-sm">{s.scorePercentage}%</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveSimulado(s.id)}
                    className="text-muted-foreground/50 hover:text-rose-500 p-1 rounded transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal NOVO SIMULADO (100% Paridade Estudei Fotos 2 e 3) */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-4xl p-6 rounded-2xl max-h-[90vh] overflow-y-auto">
          <div className="space-y-6">
            <h2 className="text-2xl font-black text-foreground tracking-tight">Novo Simulado</h2>

            {/* Linha Superior dos 5 Campos com Underline Verde-Água (Fotos 2 e 3) */}
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
              {/* 1. DATA */}
              <div className="space-y-1">
                <label className="text-[9px] font-extrabold uppercase text-muted-foreground tracking-wider block">
                  DATA
                </label>
                <div className="flex items-center gap-1 border-b border-[#2563EB] pb-1">
                  <input
                    type="text"
                    value={simuladoDate}
                    onChange={(e) => setSimuladoDate(e.target.value)}
                    className="w-full bg-transparent text-xs font-bold text-foreground focus:outline-none font-mono"
                  />
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </div>
              </div>

              {/* 2. NOME */}
              <div className="space-y-1 sm:col-span-1">
                <label className="text-[9px] font-extrabold uppercase text-muted-foreground tracking-wider block">
                  NOME
                </label>
                <input
                  type="text"
                  placeholder="Nome do Simulado"
                  value={simuladoName}
                  onChange={(e) => setSimuladoName(e.target.value)}
                  className="w-full bg-transparent border-b border-[#2563EB] text-xs font-bold text-foreground pb-1 focus:outline-none placeholder:text-muted-foreground/50"
                />
              </div>

              {/* 3. ESTILO DE PROVA */}
              <div className="space-y-1">
                <label className="text-[9px] font-extrabold uppercase text-muted-foreground tracking-wider block">
                  ESTILO DE PROVA
                </label>
                <select
                  value={estiloProva}
                  onChange={(e) => setEstiloProva(e.target.value as any)}
                  className="w-full bg-transparent border-b border-[#2563EB] text-xs font-bold text-foreground pb-1 focus:outline-none cursor-pointer"
                >
                  <option value="Múltipla Escolha">Múltipla Escolha</option>
                  <option value="Certo/Errado">Certo/Errado</option>
                </select>
              </div>

              {/* 4. BANCA */}
              <div className="space-y-1">
                <label className="text-[9px] font-extrabold uppercase text-muted-foreground tracking-wider block">
                  BANCA
                </label>
                <input
                  type="text"
                  placeholder="Banca (ex: FGV)"
                  value={banca}
                  onChange={(e) => setBanca(e.target.value)}
                  className="w-full bg-transparent border-b border-[#2563EB] text-xs font-bold text-foreground pb-1 focus:outline-none"
                />
              </div>

              {/* 5. TEMPO GASTO */}
              <div className="space-y-1">
                <label className="text-[9px] font-extrabold uppercase text-muted-foreground tracking-wider block">
                  TEMPO GASTO
                </label>
                <input
                  type="text"
                  value={tempoGasto}
                  onChange={(e) => setTempoGasto(e.target.value)}
                  className="w-full bg-transparent border-b border-[#2563EB] text-xs font-bold text-foreground pb-1 focus:outline-none font-mono"
                />
              </div>
            </div>

            {/* Tabela de Disciplinas (Diferenciada por Múltipla Escolha vs Certo/Errado - Fotos 2 e 3) */}
            <div className="border rounded-xl overflow-hidden max-h-72 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/30 border-b font-extrabold text-muted-foreground sticky top-0 bg-card z-10">
                  <tr>
                    <th className="px-4 py-2.5">Disciplina</th>
                    <th className="px-3 py-2.5 text-center w-16">Peso</th>
                    <th className="px-3 py-2.5 text-center w-14" title="Questões">📝</th>
                    <th className="px-3 py-2.5 text-center w-14 text-emerald-600" title="Acertos">✔</th>
                    {estiloProva === "Certo/Errado" && (
                      <th className="px-3 py-2.5 text-center w-14 text-sky-500" title="Brancos">—</th>
                    )}
                    <th className="px-3 py-2.5 text-center w-14 text-rose-500" title="Erros">✖</th>
                    <th className="px-3 py-2.5 text-center w-14" title="Pontos">📄</th>
                    <th className="px-3 py-2.5 text-center w-14">%</th>
                    <th className="px-3 py-2.5 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y font-semibold">
                  {rows.map((r) => {
                    const rowAcc = r.totalQuestions > 0 ? Math.round((r.correct / r.totalQuestions) * 100) : 0

                    return (
                      <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5 text-foreground font-bold">{r.name}</td>
                        <td className="px-3 py-2.5 text-center">
                          <input
                            type="number"
                            value={r.peso}
                            onChange={(e) => handleUpdateRow(r.id, "peso", parseInt(e.target.value) || 1)}
                            className="w-10 bg-transparent border-b border-[#2563EB] text-center font-mono focus:outline-none"
                            min={1}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <input
                            type="number"
                            value={r.totalQuestions}
                            onChange={(e) => handleUpdateRow(r.id, "totalQuestions", parseInt(e.target.value) || 0)}
                            className="w-10 bg-transparent border-b border-muted-foreground/40 text-center font-mono focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <input
                            type="number"
                            value={r.correct}
                            onChange={(e) => handleUpdateRow(r.id, "correct", parseInt(e.target.value) || 0)}
                            className="w-10 bg-transparent border-b border-emerald-500 text-center font-mono font-bold text-emerald-600 focus:outline-none"
                          />
                        </td>

                        {/* Coluna Brancos — Apenas no Certo/Errado (Screenshot 3) */}
                        {estiloProva === "Certo/Errado" && (
                          <td className="px-3 py-2.5 text-center">
                            <input
                              type="number"
                              value={r.blank}
                              onChange={(e) => handleUpdateRow(r.id, "blank", parseInt(e.target.value) || 0)}
                              className="w-10 bg-transparent border-b border-sky-500 text-center font-mono font-bold text-sky-600 focus:outline-none"
                            />
                          </td>
                        )}

                        <td className="px-3 py-2.5 text-center">
                          <input
                            type="number"
                            value={r.wrong}
                            onChange={(e) => handleUpdateRow(r.id, "wrong", parseInt(e.target.value) || 0)}
                            className="w-10 bg-transparent border-b border-rose-500 text-center font-mono font-bold text-rose-600 focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono text-muted-foreground">
                          {r.correct}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono text-muted-foreground">
                          {rowAcc}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(r.id)}
                            className="text-muted-foreground/40 hover:text-rose-500 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Linha de RESULTADO Total (Linha Verde Translucida no Rodapé da Tabela) */}
            <div className="bg-[#dbeafe]/50 border border-[#2563EB]/30 rounded-xl p-3 flex items-center justify-between text-xs font-bold font-mono text-[#2563EB]">
              <span className="text-[10px] tracking-wider uppercase">RESULTADO</span>
              <div className="flex items-center gap-6">
                <span>{totalQuestionsModal}</span>
                <span className="text-emerald-600">{totalCorrectModal}</span>
                {estiloProva === "Certo/Errado" && <span className="text-sky-600">{totalBlankModal}</span>}
                <span className="text-rose-600">{totalWrongModal}</span>
                <span>{totalPointsModal}</span>
                <span>{accuracyPercentageModal}%</span>
              </div>
            </div>

            {/* Seção COMENTÁRIOS */}
            <div className="space-y-1">
              <label className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
                COMENTÁRIOS
              </label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder=""
                rows={2}
                className="w-full bg-transparent border-b border-[#2563EB] text-xs font-semibold text-foreground focus:outline-none resize-none"
              />
            </div>

            {/* Botões do Rodapé do Modal */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                className="border-[#2563EB] text-[#2563EB] hover:bg-[#2563EB]/10 font-bold text-xs px-6 h-9 rounded-xl"
              >
                Cancelar
              </Button>

              <Button
                type="button"
                onClick={handleSaveSimulado}
                className="bg-[#dbeafe] hover:bg-[#2563EB] text-[#2563EB] hover:text-white font-bold text-xs px-6 h-9 rounded-xl transition-all shadow-xs"
              >
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

