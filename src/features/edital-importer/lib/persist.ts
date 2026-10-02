import type { SupabaseClient } from "@supabase/supabase-js"

import { pickNextDisciplineColor } from "@/application/disciplines/discipline-color.service"
import { canonicalDisciplineKey } from "@/domain/disciplines/discipline-naming"
import { sameNormalized } from "@/features/edital-importer/lib/normalize"

import type { EditalImportConfirmPayload } from "./types"

const MAX_DISCIPLINES = 200
const MAX_TOPICS_PER_DISCIPLINE = 500
const MAX_SUBTOPICS_PER_TOPIC = 300

function dateBRToISO(dateBR: string | undefined): string | null {
  if (!dateBR) return null
  const m = dateBR.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

async function resolveDiscipline(
  supabase: SupabaseClient,
  name: string,
  known: { id: string; name: string }[],
): Promise<{ id: string; isNew: boolean }> {
  const exact = known.find((d) => sameNormalized(d.name, name))
  if (exact) return { id: exact.id, isNew: false }

  // G1.1 (G-27): igualdade em `name_key` primeiro (indexada, sem limite de
  // página — elimina o teto de 500 do dedupe). `sameNormalized` delega à
  // mesma chave canônica do resto do sistema.
  const key = canonicalDisciplineKey(name.trim())
  try {
    const { data, error } = await supabase
      .from("disciplines")
      .select("id, name")
      .eq("name_key", key)
      .maybeSingle()
    if (!error && data) {
      known.push(data)
      return { id: data.id, isNew: false }
    }
  } catch {
    // Coluna ainda não existe → legado abaixo.
  }

  const { data: existing } = await supabase
    .from("disciplines")
    .select("id, name")
    .order("name")
    .limit(500)
  const found = existing?.find((d) => sameNormalized(d.name, name)) ?? null
  if (found) {
    known.push(found)
    return { id: found.id, isNew: false }
  }

  const color = await pickNextDisciplineColor(supabase)
  const base = { name: name.trim(), area: "Geral", ...(color ? { color_hex: color } : {}) }
  const withKey = await supabase
    .from("disciplines")
    .insert({ ...base, name_key: key })
    .select("id, name")
    .maybeSingle()

  if (!withKey.error && withKey.data) {
    known.push(withKey.data)
    return { id: withKey.data.id, isNew: true }
  }

  // Pré-migration (sem name_key) ou corrida: insere sem a chave e resolve.
  if (withKey.error) {
    const legacy = await supabase.from("disciplines").insert(base).select("id, name").maybeSingle()
    if (!legacy.error && legacy.data) {
      known.push(legacy.data)
      return { id: legacy.data.id, isNew: true }
    }
  }

  const inserted = !withKey.error ? withKey.data : null
  if (inserted) {
    known.push(inserted)
    return { id: inserted.id, isNew: true }
  }

  const { data: retry } = await supabase
    .from("disciplines")
    .select("id, name")
    .ilike("name", name)
    .order("name")
    .order("id")
    .limit(1)
    .maybeSingle()
  if (retry) {
    known.push(retry)
    return { id: retry.id, isNew: false }
  }

  throw new Error("Falha ao resolver disciplina global")
}

async function ensureTopic(
  supabase: SupabaseClient,
  disciplineId: string,
  title: string,
  known: { id: string; disciplineId: string; name: string }[],
): Promise<string> {
  const exact = known.find(
    (t) => t.disciplineId === disciplineId && sameNormalized(t.name, title),
  )
  if (exact) return exact.id

  const { data: existing } = await supabase
    .from("topics")
    .select("id, discipline_id, name")
    .eq("discipline_id", disciplineId)
  const found = existing?.find((t) => sameNormalized(t.name, title)) ?? null
  if (found) {
    known.push({ id: found.id, disciplineId, name: found.name })
    return found.id
  }

  const { data: inserted } = await supabase
    .from("topics")
    .insert({ discipline_id: disciplineId, name: title })
    .select("id, discipline_id, name")
    .maybeSingle()
  if (inserted) {
    known.push({ id: inserted.id, disciplineId, name: inserted.name })
    return inserted.id
  }

  const { data: retry } = await supabase
    .from("topics")
    .select("id, discipline_id, name")
    .eq("discipline_id", disciplineId)
    .ilike("name", title)
    .order("name")
    .order("id")
    .limit(1)
    .maybeSingle()
  if (retry) {
    known.push({ id: retry.id, disciplineId, name: retry.name })
    return retry.id
  }

  throw new Error("Falha ao resolver tópico global")
}

async function ensureSubTopic(
  supabase: SupabaseClient,
  topicId: string,
  title: string,
  known: { id: string; topicId: string; name: string }[],
): Promise<string> {
  const exact = known.find((s) => s.topicId === topicId && sameNormalized(s.name, title))
  if (exact) return exact.id

  const { data: existing } = await supabase
    .from("subtopics")
    .select("id, topic_id, name")
    .eq("topic_id", topicId)
  const found = existing?.find((s) => sameNormalized(s.name, title)) ?? null
  if (found) {
    known.push({ id: found.id, topicId, name: found.name })
    return found.id
  }

  const { data: inserted } = await supabase
    .from("subtopics")
    .insert({ topic_id: topicId, name: title })
    .select("id, topic_id, name")
    .maybeSingle()
  if (inserted) {
    known.push({ id: inserted.id, topicId, name: inserted.name })
    return inserted.id
  }

  const { data: retry } = await supabase
    .from("subtopics")
    .select("id, topic_id, name")
    .eq("topic_id", topicId)
    .ilike("name", title)
    .order("name")
    .order("id")
    .limit(1)
    .maybeSingle()
  if (retry) {
    known.push({ id: retry.id, topicId, name: retry.name })
    return retry.id
  }

  throw new Error("Falha ao resolver subtópico global")
}

export interface ResolvedEditalStructure {
  name: string
  disciplineId: string
  topics: { title: string; topicId: string; subtopics: { title: string; subtopicId: string }[] }[]
}

/**
 * G1.2 (G-26) — Fase 1 do import: garante as linhas GLOBAIS de catálogo
 * (disciplines/topics/subtopics, dedupe-safe) SEM escrever dado de usuário.
 * Os writes de usuário vão na RPC `confirm_edital_import` (atômica).
 * Reutilizável e segura para retry: só cria o que ainda não existe.
 */
export async function ensureEditalCatalogRows(
  supabase: SupabaseClient,
  structure: EditalImportConfirmPayload["structure"],
): Promise<{ structure: ResolvedEditalStructure[]; newDisciplines: number }> {
  const disciplines = structure.slice(0, MAX_DISCIPLINES)
  const knownDisciplines: { id: string; name: string }[] = []
  const knownTopics: { id: string; disciplineId: string; name: string }[] = []
  const knownSubtopics: { id: string; topicId: string; name: string }[] = []
  let newDisciplines = 0

  const resolved: ResolvedEditalStructure[] = []

  for (const discipline of disciplines) {
    const name = discipline.name.trim()
    if (!name) continue
    const { id: disciplineId, isNew } = await resolveDiscipline(supabase, name, knownDisciplines)
    if (isNew) newDisciplines += 1

    const topics = discipline.topics.slice(0, MAX_TOPICS_PER_DISCIPLINE)
    const topicNodes: ResolvedEditalStructure["topics"] = []

    for (const topic of topics) {
      const title = topic.title.trim()
      if (!title) continue
      const topicId = await ensureTopic(supabase, disciplineId, title, knownTopics)
      const subtopics = (topic.subtopics ?? []).slice(0, MAX_SUBTOPICS_PER_TOPIC)
      const subNodes: { title: string; subtopicId: string }[] = []
      for (const sub of subtopics) {
        const subTitle = sub.title.trim()
        if (!subTitle) continue
        const subtopicId = await ensureSubTopic(supabase, topicId, subTitle, knownSubtopics)
        subNodes.push({ title: subTitle, subtopicId })
      }
      topicNodes.push({ title, topicId, subtopics: subNodes })
    }

    resolved.push({ name, disciplineId, topics: topicNodes })
  }

  return { structure: resolved, newDisciplines }
}

export interface ConfirmEditalRpcPayload {
  file_hash: string
  file_name: string
  edital: {
    name: string
    organizer: string | null
    position_name: string | null
    banca: string | null
    exam_date: string | null
    publication_date: string | null
    registration_date: string | null
    original_filename: string
    structure: unknown
  }
  links: {
    discipline_id: string
    discipline_name: string
    topics: { topic_id: string; title: string }[]
  }[]
}

/**
 * G1.2 (G-26) — monta o payload da RPC com os MESMOS limites do servidor
 * (espelha os caps da função; a RPC revalida e nunca confia no cliente).
 */
export function buildConfirmEditalPayload(input: {
  fileName: string
  fileHash: string
  metadata: EditalImportConfirmPayload["metadata"]
  structure: ResolvedEditalStructure[]
}): ConfirmEditalRpcPayload {
  const editalName =
    input.metadata.name?.trim() || input.fileName.replace(/\.(pdf|docx|txt)$/i, "") || "Edital importado"

  return {
    file_hash: input.fileHash,
    file_name: input.fileName.slice(0, 255),
    edital: {
      name: editalName.slice(0, 255),
      organizer: input.metadata.organizer?.slice(0, 120) ?? null,
      position_name: input.metadata.positionName?.slice(0, 120) ?? null,
      banca: input.metadata.banca?.slice(0, 120) ?? null,
      exam_date: dateBRToISO(input.metadata.examDate),
      publication_date: dateBRToISO(input.metadata.publicationDate),
      registration_date: dateBRToISO(input.metadata.registrationDate),
      original_filename: input.fileName.slice(0, 255),
      structure: input.structure as unknown as object,
    },
    links: input.structure.map((d) => ({
      discipline_id: d.disciplineId,
      discipline_name: d.name,
      topics: d.topics.map((t) => ({ topic_id: t.topicId, title: t.title })),
    })),
  }
}

// G1.2 (G-26): mergeCustomTopics foi absorvido pela RPC `confirm_edital_import`
// (passo 3, transacional). Removido para não manter um caminho paralelo sem
// atomicidade. O merge canônico do JS permanece documentado na RPC.
