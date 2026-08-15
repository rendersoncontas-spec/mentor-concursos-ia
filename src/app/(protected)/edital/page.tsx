import Link from "next/link"

import { ArrowRight, FileText, GraduationCap } from "lucide-react"

import { getUserDisciplines } from "@/application/disciplines/disciplines.service"
import {
  type DisciplineData,
  EditalAccordion,
  type TopicItem,
} from "@/features/edital/components/edital-accordion"
import { EditalImporter } from "@/features/edital-importer/components/edital-importer"
import { createClient } from "@/infrastructure/supabase/server"

export const metadata = {
  title: "Edital Verticalizado",
  description: "Visualize e acompanhe seu progresso em cada tópico do edital no NomeIA.",
}

const COLOR_PALETTE = ["#2563EB", "#f97316", "#3b82f6", "#10b981", "#8b5cf6", "#ef4444", "#f59e0b"]

// Base de dados local para tópicos pré-cadastrados do NomeIA
function getPreRegisteredTopics(disciplineName: string): TopicItem[] | null {
  const normalized = disciplineName.trim().toLowerCase()

  if (normalized.includes("raciocínio lógico") || normalized.includes("matemática")) {
    return [
      {
        id: "rlm-1",
        number: 1,
        title: "PROPOSIÇÕES, CONECTIVOS, EQUIVALÊNCIAS LÓGICAS, QUANTIFICADORES E NEGAÇÕES.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
      {
        id: "rlm-2",
        number: 2,
        title: "NÚMEROS INTEIROS, RACIONAIS E REAIS E SUAS OPERAÇÕES, PORCENTAGEM E PROPORÇÃO.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
      {
        id: "rlm-3",
        number: 3,
        title: "PROPORCIONALIDADE DIRETA E INVERSA.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
      {
        id: "rlm-4",
        number: 4,
        title: "MEDIDAS DE COMPRIMENTO, ÁREA, VOLUME, MASSA E TEMPO.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
      {
        id: "rlm-5",
        number: 5,
        title:
          "ESTRUTURA LÓGICA DE RELAÇÕES ARBITRÁRIAS ENTRE PESSOAS, LUGARES, OBJETOS E EVENTOS.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
      {
        id: "rlm-6",
        number: 6,
        title:
          "COMPREENSÃO E ANÁLISE DA LÓGICA DE UMA SITUAÇÃO, UTILIZANDO AS FUNÇÕES DO RACIOCÍNIO.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
      {
        id: "rlm-7",
        number: 7,
        title: "COMPREENSÃO DE DADOS APRESENTADOS EM GRÁFICOS E TABELAS.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
    ]
  }

  if (normalized.includes("administrativo")) {
    return [
      {
        id: "adm-1",
        number: 1,
        title: "ESTADO, GOVERNO E ADMINISTRAÇÃO PÚBLICA: CONCEITOS E ELEMENTOS.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
      {
        id: "adm-2",
        number: 2,
        title: "DIREITO ADMINISTRATIVO: CONCEITO, FONTES E PRINCÍPIOS EXPRESSOS E IMPLÍCITOS.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
      {
        id: "adm-3",
        number: 3,
        title: "ATOS ADMINISTRATIVOS: CONCEITO, REQUISITOS, ATRIBUTOS, CLASSIFICAÇÃO E ESPÉCIES.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
      {
        id: "adm-4",
        number: 4,
        title: "AGENTES PÚBLICOS: ESPÉCIES E CLASSIFICAÇÃO.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
      {
        id: "adm-5",
        number: 5,
        title: "PODERES ADMINISTRATIVOS.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
    ]
  }

  if (normalized.includes("constitucional")) {
    return [
      {
        id: "const-1",
        number: 1,
        title: "CONSTITUIÇÃO DA REPÚBLICA FEDERATIVA DO BRASIL DE 1988: PRINCÍPIOS FUNDAMENTAIS.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
      {
        id: "const-2",
        number: 2,
        title: "DIREITOS E GARANTIAS FUNDAMENTAIS: DIREITOS E DEVERES INDIVIDUAIS E COLETIVOS.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
      {
        id: "const-3",
        number: 3,
        title: "DIREITOS SOCIAIS, DE NACIONALIDADE E POLÍTICOS.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
      {
        id: "const-4",
        number: 4,
        title: "ORGANIZAÇÃO POLÍTICO-ADMINISTRATIVA DO ESTADO.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
      {
        id: "const-5",
        number: 5,
        title: "ADMINISTRAÇÃO PÚBLICA (ART. 37 A 41 DA CF).",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
    ]
  }

  if (normalized.includes("portugu") || normalized.includes("portuguesa")) {
    return [
      {
        id: "port-1",
        number: 1,
        title: "COMPREENSÃO E INTERPRETAÇÃO DE TEXTOS DE GÊNEROS VARIADOS.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
      {
        id: "port-2",
        number: 2,
        title: "RECONHECIMENTO DE TIPOS E GÊNEROS TEXTUAIS.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
      {
        id: "port-3",
        number: 3,
        title: "DOMÍNIO DA ORTOGRAFIA OFICIAL.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
      {
        id: "port-4",
        number: 4,
        title: "DOMÍNIO DOS MECANISMOS DE COESÃO TEXTUAL.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
      {
        id: "port-5",
        number: 5,
        title: "EMPREGO DE TEMPOS E MODOS VERBAIS.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
      {
        id: "port-6",
        number: 6,
        title: "SINTAXE DA ORAÇÃO E DO PERÍODO.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
      {
        id: "port-7",
        number: 7,
        title: "PONTUAÇÃO E CONCORDÂNCIA NOMINAL E VERBAL.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
    ]
  }

  if (normalized.includes("penal")) {
    return [
      {
        id: "penal-1",
        number: 1,
        title: "PRINCÍPIOS BÁSICOS DO DIREITO PENAL.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
      {
        id: "penal-2",
        number: 2,
        title: "APLICAÇÃO DA LEI PENAL.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
      {
        id: "penal-3",
        number: 3,
        title: "O FATO TÍPICO E SEUS ELEMENTOS.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
      {
        id: "penal-4",
        number: 4,
        title: "IMPUTABILIDADE PENAL E CONCURSO DE PESSOAS.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
      {
        id: "penal-5",
        number: 5,
        title: "CRIMES CONTRA A PESSOA E CONTRA O PATRIMÔNIO.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
      {
        id: "penal-6",
        number: 6,
        title: "CRIMES CONTRA A ADMINISTRAÇÃO PÚBLICA.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
    ]
  }

  if (normalized.includes("informática")) {
    return [
      {
        id: "info-1",
        number: 1,
        title: "CONCEITOS BÁSICOS E MODOS DE UTILIZAÇÃO DE TECNOLOGIAS.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
      {
        id: "info-2",
        number: 2,
        title: "SISTEMAS OPERACIONAIS WINDOWS E LINUX.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
      {
        id: "info-3",
        number: 3,
        title: "EDIÇÃO DE TEXTOS, PLANILHAS E APRESENTAÇÕES (OFFICE E LIBREOFFICE).",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
      {
        id: "info-4",
        number: 4,
        title: "REDES DE COMPUTADORES E INTERNET.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
      {
        id: "info-5",
        number: 5,
        title: "NOÇÕES DE SEGURANÇA DA INFORMAÇÃO.",
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      },
    ]
  }

  return null
}

async function getActiveConcursoData() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const { data: targetData } = await supabase
      .from("user_targets")
      .select("id, target_exam, target_role, main_study_source")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()

    let name = targetData?.target_exam || "Concurso Alvo"
    let customEdital: Record<string, TopicItem[]> = {}
    try {
      if (targetData?.main_study_source) {
        let meta: { examName?: string; customEdital?: Record<string, TopicItem[]> } = {}
        if (typeof targetData.main_study_source === "object") {
          meta = targetData.main_study_source
        } else if (
          typeof targetData.main_study_source === "string" &&
          targetData.main_study_source.startsWith("{")
        ) {
          meta = JSON.parse(targetData.main_study_source)
        }
        if (meta.examName) name = meta.examName
        if (meta.customEdital) customEdital = meta.customEdital
      }
    } catch {
      /* noop */
    }

    // 1. Busca as disciplinas REAIS do usuário
    const userDisciplines = await getUserDisciplines(supabase, user.id, targetData?.id)

    // 2. Transforma no formato DisciplineData esperado pelo Accordion
    const editalData: DisciplineData[] = userDisciplines.map((ud, idx) => {
      const name = ud.discipline?.name || "Desconhecida"
      const discId = ud.discipline_id || `disc-${idx}`

      const customTopics = customEdital[discId] || getPreRegisteredTopics(name)
      return {
        id: discId,
        name: name,
        color: COLOR_PALETTE[idx % COLOR_PALETTE.length] || "#000000",
        // Usa os tópicos customizados/pré-cadastrados se existirem, senão cria um default 0% genérico
        topics: customTopics || [
          {
            id: `gen-${idx}`,
            number: 1,
            title: `ESTUDO COMPLETO DA DISCIPLINA DE ${name.toUpperCase()}.`,
            correct: 0,
            wrong: 0,
            questions: 0,
            accuracy: 0,
            lastStudy: null,
            studyCount: 0,
            link: null,
          },
        ],
      }
    })

    if (!targetData && editalData.length === 0) return null

    return {
      id: targetData?.id,
      name,
      role: targetData?.target_role || null,
      disciplines: editalData.length > 0 ? editalData : undefined,
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
              <p className="text-xs text-muted-foreground mt-0.5">
                Progresso por disciplina e tópico
              </p>
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

        {active?.id && <EditalImporter targetId={active.id} />}
      </div>

      <div className="flex-1 p-4 md:p-6">
        {!active || !active.disciplines || active.disciplines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <FileText className="h-8 w-8 text-primary/60" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-black text-foreground">Nenhuma disciplina cadastrada</h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                Adicione disciplinas ou gere seu planejamento inteligente para visualizar o edital
                verticalizado.
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
          <EditalAccordion
            initialDisciplines={active.disciplines}
            activeTargetName={active.name}
            activeTargetId={active.id}
          />
        )}
      </div>
    </div>
  )
}
