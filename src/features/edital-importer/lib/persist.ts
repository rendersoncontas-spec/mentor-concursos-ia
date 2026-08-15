import type { SupabaseClient } from "@supabase/supabase-js"

import { pickNextDisciplineColor } from "@/application/disciplines/discipline-color.service"
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
  const { data: inserted } = await supabase
    .from("disciplines")
    .insert({ name, area: "Geral", ...(color ? { color_hex: color } : {}) })
    .select("id, name")
    .maybeSingle()

  if (inserted) {
    known.push(inserted)
    return { id: inserted.id, isNew: true }
  }

  const { data: retry } = await supabase
    .from("disciplines")
    .select("id, name")
    .ilike("name", name)
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
    .maybeSingle()
  if (retry) {
    known.push({ id: retry.id, topicId, name: retry.name })
    return retry.id
  }

  throw new Error("Falha ao resolver subtópico global")
}

export type PersistEditalResult = {
  editalId: string
  stats: { disciplines: number; topics: number; newDisciplines: number }
  structureForMerge: {
    name: string
    disciplineId: string
    topics: { title: string; topicId: string }[]
  }[]
}

export async function persistEditalImport(
  supabase: SupabaseClient,
  userId: string,
  targetId: string,
  payload: EditalImportConfirmPayload,
): Promise<PersistEditalResult> {
  const { data: duplicated } = await supabase
    .from("user_editais")
    .select("id")
    .eq("user_id", userId)
    .eq("file_hash", payload.fileHash)
    .maybeSingle()
  if (duplicated) {
    throw new DuplicateEditalError(duplicated.id)
  }

  const disciplines = payload.structure.slice(0, MAX_DISCIPLINES)
  const knownDisciplines: { id: string; name: string }[] = []
  const knownTopics: { id: string; disciplineId: string; name: string }[] = []
  const knownSubtopics: { id: string; topicId: string; name: string }[] = []
  let newDisciplines = 0

  const structure: {
    name: string
    disciplineId: string
    topics: { title: string; topicId: string; subtopics: { title: string; subtopicId: string }[] }[]
  }[] = []

  for (const discipline of disciplines) {
    const name = discipline.name.trim()
    if (!name) continue
    const { id: disciplineId, isNew } = await resolveDiscipline(supabase, name, knownDisciplines)
    if (isNew) newDisciplines += 1

    const { error: linkError } = await supabase.from("user_disciplines").upsert(
      {
        user_id: userId,
        target_id: targetId,
        discipline_id: disciplineId,
        status: "NOT_STARTED",
        mastery_level: 0,
      },
      { onConflict: "user_id,target_id,discipline_id", ignoreDuplicates: true },
    )
    if (linkError) throw linkError

      const topics = discipline.topics.slice(0, MAX_TOPICS_PER_DISCIPLINE)
      const topicNodes: {
        title: string
        topicId: string
        subtopics: { title: string; subtopicId: string }[]
      }[] = []

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

    structure.push({ name, disciplineId, topics: topicNodes })
  }

  const editalName =
    payload.metadata.name?.trim() || payload.fileName.replace(/\.(pdf|docx|txt)$/i, "") || "Edital importado"

  const { data: inserted, error } = await supabase
    .from("user_editais")
    .insert({
      user_id: userId,
      name: editalName.slice(0, 255),
      organizer: payload.metadata.organizer?.slice(0, 120) ?? null,
      position_name: payload.metadata.positionName?.slice(0, 120) ?? null,
      banca: payload.metadata.banca?.slice(0, 120) ?? null,
      exam_date: dateBRToISO(payload.metadata.examDate),
      publication_date: dateBRToISO(payload.metadata.publicationDate),
      registration_date: dateBRToISO(payload.metadata.registrationDate),
      source: "edital_import",
      original_filename: payload.fileName.slice(0, 255),
      file_hash: payload.fileHash,
      structure: structure as unknown as object,
    })
    .select("id")
    .single()

  if (error || !inserted) {
    throw error ?? new Error("Falha ao registrar edital")
  }

  return {
    editalId: inserted.id,
    stats: {
      disciplines: structure.length,
      topics: structure.reduce((acc, d) => acc + d.topics.length, 0),
      newDisciplines,
    },
    structureForMerge: structure.map((d) => ({
      name: d.name,
      disciplineId: d.disciplineId,
      topics: d.topics.map((t) => ({ title: t.title, topicId: t.topicId })),
    })),
  }
}

export class DuplicateEditalError extends Error {
  editalId: string
  constructor(editalId: string) {
    super("Edital já importado anteriormente")
    this.name = "DuplicateEditalError"
    this.editalId = editalId
  }
}

type CustomEditalTopic = {
  id: string
  number: number
  title: string
  correct: number
  wrong: number
  questions: number
  accuracy: number
  lastStudy: string | null
  studyCount: number
  link: string | null
}

export async function mergeCustomTopics(
  supabase: SupabaseClient,
  userId: string,
  targetId: string,
  structure: {
    name: string
    disciplineId: string
    topics: { title: string; topicId: string }[]
  }[],
): Promise<void> {
  const { data: targetData } = await supabase
    .from("user_targets")
    .select("main_study_source")
    .eq("id", targetId)
    .eq("user_id", userId)
    .maybeSingle()

  let meta: {
    customEdital?: Record<string, CustomEditalTopic[]>
    [key: string]: unknown
  } = {}
  if (targetData?.main_study_source) {
    if (typeof targetData.main_study_source === "object") {
      meta = { ...(targetData.main_study_source as Record<string, unknown>) }
    } else if (typeof targetData.main_study_source === "string") {
      try {
        const parsed = JSON.parse(targetData.main_study_source) as Record<string, unknown>
        meta = { ...parsed }
      } catch {
        meta = {}
      }
    }
  }

  if (!meta.customEdital) meta.customEdital = {}

  for (const d of structure) {
    const existing = meta.customEdital[d.disciplineId] ?? []
    const existingKeys = new Set(
      existing.map((t) => t.title.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")),
    )
    const merged = [...existing]
    for (const topic of d.topics) {
      const normalized = topic.title.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      if (existingKeys.has(normalized)) continue
      existingKeys.add(normalized)
      merged.push({
        id: topic.topicId,
        number: merged.length + 1,
        title: topic.title.trim(),
        correct: 0,
        wrong: 0,
        questions: 0,
        accuracy: 0,
        lastStudy: null,
        studyCount: 0,
        link: null,
      })
    }
    meta.customEdital[d.disciplineId] = merged
  }

  const { error } = await supabase
    .from("user_targets")
    .update({ main_study_source: JSON.stringify(meta) })
    .eq("id", targetId)
    .eq("user_id", userId)

  if (error) throw error
}
