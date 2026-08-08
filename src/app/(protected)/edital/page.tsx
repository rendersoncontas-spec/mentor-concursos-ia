import { FileText, GraduationCap, ArrowRight } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/infrastructure/supabase/server"
import { EditalAccordion, type DisciplineData, type TopicItem } from "@/features/edital/components/edital-accordion"
import { getUserDisciplines } from "@/application/disciplines/disciplines.service"

export const metadata = {
  title: "Edital Verticalizado - Mentor Concursos IA",
  description: "Visualize e acompanhe seu progresso em cada tópico do edital.",
}

// Fallback de tópicos para não ficar vazio caso a base não tenha os tópicos da disciplina
const DEFAULT_TOPICS_BY_DISCIPLINE: Record<string, TopicItem[]> = {
  "Raciocínio Lógico": [
    { id: "rlm-1", number: 1, title: "PROPOSIÇÕES, CONECTIVOS, EQUIVALÊNCIAS LÓGICAS, QUANTIFICADORES E NEGAÇÕES.", correct: 0, wrong: 0, questions: 0, accuracy: 0, lastStudy: null, studyCount: 0, link: null },
    { id: "rlm-2", number: 2, title: "NÚMEROS INTEIROS, RACIONAIS E REAIS E SUAS OPERAÇÕES, PORCENTAGEM E PROPORÇÃO.", correct: 0, wrong: 0, questions: 0, accuracy: 0, lastStudy: null, studyCount: 0, link: null },
    { id: "rlm-3", number: 3, title: "PROPORCIONALIDADE DIRETA E INVERSA.", correct: 0, wrong: 0, questions: 0, accuracy: 0, lastStudy: null, studyCount: 0, link: null },
    { id: "rlm-4", number: 4, title: "COMPREENSÃO DE DADOS APRESENTADOS EM GRÁFICOS E TABELAS.", correct: 0, wrong: 0, questions: 0, accuracy: 0, lastStudy: null, studyCount: 0, link: null },
  ],
  "Direito Administrativo": [
    { id: "adm-1", number: 1, title: "ESTADO, GOVERNO E ADMINISTRAÇÃO PÚBLICA: CONCEITOS E ELEMENTOS.", correct: 14, wrong: 3, questions: 17, accuracy: 82, lastStudy: "2026-08-04", studyCount: 2, link: "https://qconcursos.com" },
    { id: "adm-2", number: 2, title: "DIREITO ADMINISTRATIVO: CONCEITO, FONTES E PRINCÍPIOS EXPRESSOS E IMPLÍCITOS.", correct: 18, wrong: 2, questions: 20, accuracy: 90, lastStudy: "2026-08-02", studyCount: 3, link: null },
    { id: "adm-3", number: 3, title: "ATOS ADMINISTRATIVOS: CONCEITO, REQUISITOS, ATRIBUTOS, CLASSIFICAÇÃO E ESPÉCIES.", correct: 25, wrong: 5, questions: 30, accuracy: 83, lastStudy: "2026-07-29", studyCount: 4, link: null },
  ],
  "Direito Constitucional": [
    { id: "const-1", number: 1, title: "CONSTITUIÇÃO DA REPÚBLICA FEDERATIVA DO BRASIL DE 1988: PRINCÍPIOS FUNDAMENTAIS.", correct: 20, wrong: 4, questions: 24, accuracy: 83, lastStudy: "2026-08-05", studyCount: 3, link: null },
    { id: "const-2", number: 2, title: "DIREITOS E GARANTIAS FUNDAMENTAIS: DIREITOS E DEVERES INDIVIDUAIS E COLETIVOS.", correct: 35, wrong: 5, questions: 40, accuracy: 87, lastStudy: "2026-08-03", studyCount: 5, link: null },
  ],
  "Administração Geral": [
    { id: "ag-1", number: 1, title: "ABORDAGENS DA ADMINISTRAÇÃO: CLÁSSICA, BUROCRÁTICA, SISTÊMICA.", correct: 0, wrong: 0, questions: 0, accuracy: 0, lastStudy: null, studyCount: 0, link: null },
    { id: "ag-2", number: 2, title: "PROCESSO ADMINISTRATIVO: PLANEJAMENTO, ORGANIZAÇÃO, DIREÇÃO E CONTROLE.", correct: 0, wrong: 0, questions: 0, accuracy: 0, lastStudy: null, studyCount: 0, link: null },
  ],
  "Administração Pública": [
    { id: "ap-1", number: 1, title: "REFORMAS ADMINISTRATIVAS NO BRASIL.", correct: 0, wrong: 0, questions: 0, accuracy: 0, lastStudy: null, studyCount: 0, link: null },
    { id: "ap-2", number: 2, title: "MODELOS DE ADMINISTRAÇÃO PÚBLICA: PATRIMONIALISTA, BUROCRÁTICO, GERENCIAL.", correct: 0, wrong: 0, questions: 0, accuracy: 0, lastStudy: null, studyCount: 0, link: null },
  ]
}

const COLOR_PALETTE = [
  "#2563EB", "#f97316", "#3b82f6", "#10b981", "#8b5cf6", "#ef4444", "#f59e0b"
]

async function getActiveConcursoData() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: targetData } = await supabase
      .from("user_targets")
      .select("id, target_exam, target_role, main_study_source")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()

    let name = targetData?.target_exam || "Concurso Alvo"
    let customEdital: any = {}
    try {
      if (targetData?.main_study_source) {
        let meta: any = {}
        if (typeof targetData.main_study_source === "object") {
          meta = targetData.main_study_source
        } else if (typeof targetData.main_study_source === "string" && targetData.main_study_source.startsWith("{")) {
          meta = JSON.parse(targetData.main_study_source)
        }
        if (meta.examName) name = meta.examName
        if (meta.customEdital) customEdital = meta.customEdital
      }
    } catch { /* noop */ }

    // 1. Busca as disciplinas REAIS do usuário
    const userDisciplines = await getUserDisciplines(supabase, user.id, targetData?.id)
    
    // 2. Transforma no formato DisciplineData esperado pelo Accordion
    const editalData: DisciplineData[] = userDisciplines.map((ud, idx) => {
      const name = ud.discipline?.name || "Desconhecida"
      const discId = ud.discipline_id || `disc-${idx}`
      
      const customTopics = customEdital[discId]
      return {
        id: discId,
        name: name,
        color: COLOR_PALETTE[idx % COLOR_PALETTE.length] || "#000000",
        // Usa os tópicos customizados se existirem, senão defaults, senão genérico
        topics: customTopics || DEFAULT_TOPICS_BY_DISCIPLINE[name] || [
          { id: `gen-${idx}`, number: 1, title: `ESTUDO COMPLETO DA DISCIPLINA DE ${name.toUpperCase()}.`, correct: 0, wrong: 0, questions: 0, accuracy: 0, lastStudy: null, studyCount: 0, link: null }
        ]
      }
    })

    if (!targetData && editalData.length === 0) return null

    return { 
      id: targetData?.id,
      name, 
      role: targetData?.target_role || null,
      disciplines: editalData.length > 0 ? editalData : undefined
    }
  } catch {
    return null
  }
}

export default async function EditalPage() {
  const active = await getActiveConcursoData()

  return (
    <div className="flex flex-col min-h-full">
      {/* Page Header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-sm border-b px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-bold leading-none">Edital Verticalizado</h1>
            {active ? (
              <p className="text-xs text-muted-foreground mt-0.5">
                <span className="font-semibold text-primary">{active.name}</span>
                {active.role && <span className="text-muted-foreground"> · {active.role}</span>}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5">Progresso por disciplina e tópico</p>
            )}
          </div>
        </div>

        {/* Link para Concursos */}
        {!active && (
          <Link
            href="/concursos"
            className="flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors"
          >
            <GraduationCap className="h-3.5 w-3.5" />
            Adicionar concurso
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      <div className="flex-1 p-4 md:p-6">
        {(!active || !active.disciplines || active.disciplines.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <FileText className="h-8 w-8 text-primary/60" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-black text-foreground">Nenhuma disciplina cadastrada</h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                Adicione disciplinas ou gere seu planejamento inteligente para visualizar o edital verticalizado.
              </p>
            </div>
            <Link
              href="/planejamento"
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-colors"
            >
              <GraduationCap className="h-4 w-4" />
              Criar Planejamento
            </Link>
          </div>
        ) : (
          <EditalAccordion initialDisciplines={active.disciplines} activeTargetName={active.name} activeTargetId={active.id} />
        )}
      </div>
    </div>
  )
}
