import type { StudySource, StudyType } from "@/domain/study-history/study-history.types"

export const DEFAULT_STUDY_SOURCE: StudySource = "FREE"
export const DEFAULT_IMPORT_STUDY_TYPE: StudyType = "OUTRO"

const EXTERNAL_TYPE_ALIASES: { type: StudyType; aliases: string[] }[] = [
  {
    type: "VIDEOAULA",
    aliases: [
      "video",
      "videos",
      "videoaula",
      "video aula",
      "aula",
      "aula gravada",
      "course",
      "curso em video",
      "video lesson",
    ],
  },
  {
    type: "AUDIO",
    aliases: [
      "audio",
      "audioaula",
      "audio aula",
      "podcast",
      "audio book",
      "audiolivro",
      "audio e video",
      "audio video",
      "audio/video",
    ],
  },
  {
    type: "FLASHCARDS",
    aliases: [
      "flashcards",
      "flash cards",
      "flashcard",
      "baralho anki",
      "anki",
      "baralho",
      "cartoes",
      "cards",
      "flashcard deck",
    ],
  },
  {
    type: "QUESTOES",
    aliases: [
      "exercicios",
      "exercicio",
      "exercicios feitos",
      "questoes",
      "questao",
      "praticas",
      "pratica",
      "practice",
      "questoes comentadas",
      "banco de questoes",
      "respondendo questoes",
    ],
  },
  {
    type: "SIMULADO",
    aliases: ["simulado", "simulados", "prova", "provas", "simulado completo", "mock exam"],
  },
  {
    type: "LEITURA",
    aliases: ["leitura", "reading", "leitura de conteudo", "leitura dirigida"],
  },
  {
    type: "REVISAO",
    aliases: ["revisao", "review", "revisao de conteudo", "revisao por questoes"],
  },
  {
    type: "RESUMO",
    aliases: ["resumo", "resumos", "summary", "resumo esquematico", "resumindo"],
  },
  {
    type: "MAPA_MENTAL",
    aliases: ["mapa mental", "mapas mentais", "mindmap", "mapa mental e resumo", "mapamental", "mapasmentais"],
  },
  {
    type: "TEORIA",
    aliases: ["teoria", "theory", "estudo teorico", "conteudo teorico", "teorico"],
  },
  {
    type: "LEI_SECA",
    aliases: ["lei seca", "leitura de lei", "leitura da lei"],
  },
  {
    type: "JURISPRUDENCIA",
    aliases: ["jurisprudencia", "jurisprudencia e informativos"],
  },
  {
    type: "INFORMATIVOS",
    aliases: ["informativos", "informativo", "informativo stf", "informativo stj"],
  },
  {
    type: "DOUTRINA",
    aliases: ["doutrina", "doutrinario", "leitura de doutrina"],
  },
  {
    type: "AULA_VIVO",
    aliases: ["aula ao vivo", "aula ao vivo gravada", "live", "aula presencial"],
  },
  {
    type: "MONITORIA",
    aliases: ["monitoria", "tira duvidas", "plantao de duvidas"],
  },
  {
    type: "DISCUSSAO",
    aliases: ["discussao", "grupo de estudos", "estudo em grupo"],
  },
  {
    type: "ESTUDO_IA",
    aliases: ["estudo com ia", "estudo ia", "chatgpt", "ia", "inteligencia artificial"],
  },
]

const ALIAS_LOOKUP: { alias: string; type: StudyType }[] = EXTERNAL_TYPE_ALIASES.flatMap(
  (entry) => entry.aliases.map((alias) => ({ alias: alias.toLowerCase().trim(), type: entry.type })),
)

/**
 * Mapeia o valor livre de "Tipo" de plataformas externas (ex.: "Video",
 * "FlashCards", "Baralho Anki", "Audio") para um StudyType interno.
 */
export function detectStudyType(raw: string | null): StudyType | null {
  if (!raw) return null
  const normalized = raw.toLowerCase().trim().replace(/\s+/g, " ")
  if (!normalized) return null

  const exact = ALIAS_LOOKUP.find((entry) => entry.alias === normalized)
  if (exact) return exact.type

  const partial = ALIAS_LOOKUP.find(
    (entry) => normalized.includes(entry.alias) || entry.alias.includes(normalized),
  )
  return partial ? partial.type : null
}

/**
 * Deriva StudySource a partir do StudyType, seguindo a convenção da ação
 * de registro manual (VIDEOAULA->VIDEO, QUESTOES->QUESTOES, REVISAO->REVIEW,
 * SIMULADO->SIMULADO; demais -> FREE).
 */
export function studyTypeToSource(studyType: StudyType | null): StudySource {
  switch (studyType) {
    case "VIDEOAULA":
      return "VIDEO"
    case "QUESTOES":
      return "QUESTOES"
    case "REVISAO":
      return "REVIEW"
    case "SIMULADO":
      return "SIMULADO"
    default:
      return DEFAULT_STUDY_SOURCE
  }
}
