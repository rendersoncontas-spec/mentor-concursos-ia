"use server"

import { createHash } from "node:crypto"

import { revalidatePath } from "next/cache"
import * as Sentry from "@sentry/nextjs"
import { z } from "zod"

import { createClient } from "@/infrastructure/supabase/server"
import { matchDraftToCatalog } from "@/features/edital-importer/lib/matcher"
import { mergeCustomTopics, persistEditalImport, DuplicateEditalError } from "@/features/edital-importer/lib/persist"
import { structureEditalText } from "@/features/edital-importer/lib/structurer"
import {
  extractTextFromFile,
  extensionOf,
  isAcceptedExtension,
  isAcceptedMime,
  MAX_UPLOAD_BYTES,
} from "@/features/edital-importer/lib/text-extract"
import type { CatalogDiscipline, CatalogSubTopic, CatalogTopic, EditalImportConfirmPayload, EditalImportConfirmResult, EditalImportResult } from "@/features/edital-importer/lib/types"

const FEATURE = "edital-import"

export async function parseEditalFileAction(
  formData: FormData,
): Promise<{ success: boolean; data?: EditalImportResult; error?: string }> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Não autenticado." }

    const file = formData.get("file")
    if (!(file instanceof File)) return { success: false, error: "Nenhum arquivo enviado." }
    if (file.size === 0) return { success: false, error: "O arquivo está vazio." }
    if (file.size > MAX_UPLOAD_BYTES) {
      return { success: false, error: "O arquivo excede o limite de 10 MB." }
    }

    const ext = extensionOf(file.name)
    if (!ext || !isAcceptedExtension(ext)) {
      return { success: false, error: "Formato não suportado. Envie um arquivo PDF, DOCX ou TXT." }
    }
    if (!isAcceptedMime(ext, file.type)) {
      return { success: false, error: "Tipo do arquivo inválido." }
    }

    const buffer = await file.arrayBuffer()
    const fileHash = createHash("sha256").update(Buffer.from(buffer)).digest("hex")

    const extraction = await extractTextFromFile(buffer, ext)
    if (extraction.text.trim().length < 10) {
      return {
        success: false,
        error:
          extraction.warning ??
          "Não foi possível extrair texto do arquivo. Verifique se o arquivo não está corrompido.",
      }
    }

    const draft = structureEditalText(extraction.text)
    if (draft.disciplines.length === 0) {
      return {
        success: false,
        error:
          "Não foi possível identificar o conteúdo programático no arquivo. Verifique se o arquivo contém as disciplinas e tópicos do edital.",
      }
    }

    const [{ data: discRows }, { data: topicRows }, { data: subRows }] = await Promise.all([
      supabase.from("disciplines").select("id, name").limit(5000),
      supabase.from("topics").select("id, discipline_id, name").limit(10000),
      supabase.from("subtopics").select("id, topic_id, name").limit(20000),
    ])

    const catalogDisciplines: CatalogDiscipline[] = (discRows ?? []).map((d) => ({
      id: d.id,
      name: d.name,
    }))
    const catalogTopics: CatalogTopic[] = (topicRows ?? []).map((t) => ({
      id: t.id,
      disciplineId: t.discipline_id,
      name: t.name,
    }))
    const catalogSubtopics: CatalogSubTopic[] = (subRows ?? []).map((s) => ({
      id: s.id,
      topicId: s.topic_id,
      name: s.name,
    }))

    const matched = matchDraftToCatalog(draft, catalogDisciplines, catalogTopics, catalogSubtopics)

    const stats = {
      disciplines: matched.disciplines.length,
      topics: matched.disciplines.reduce((acc, d) => acc + d.topics.length, 0),
      subtopics: matched.disciplines.reduce(
        (acc, d) => acc + d.topics.reduce((a, t) => a + t.subtopics.length, 0),
        0,
      ),
      newDisciplines: matched.disciplines.filter((d) => d.isNew).length,
      newTopics: matched.disciplines.reduce(
        (acc, d) => acc + d.topics.filter((t) => t.isNew).length,
        0,
      ),
      newSubtopics: matched.disciplines.reduce(
        (acc, d) => acc + d.topics.reduce((a, t) => a + t.subtopics.filter((s) => s.isNew).length, 0),
        0,
      ),
      lowConfidence: matched.lowConfidenceCount,
    }

    Sentry.captureMessage("Edital: arquivo analisado", {
      extra: { feature: FEATURE, step: "parse", stats, method: extraction.method },
    })

    return { success: true, data: { draft: matched, fileName: file.name, fileHash, stats } }
  } catch (error) {
    Sentry.captureException(error, { extra: { feature: FEATURE, step: "parse" } })
    return { success: false, error: "Erro inesperado ao analisar o arquivo." }
  }
}

const metadataSchema = z.object({
  name: z.string().max(160).optional(),
  organizer: z.string().max(120).optional(),
  positionName: z.string().max(120).optional(),
  banca: z.string().max(120).optional(),
  examDate: z.string().max(10).optional(),
  publicationDate: z.string().max(10).optional(),
  registrationDate: z.string().max(10).optional(),
})

const confirmPayloadSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/),
  targetId: z.string().uuid(),
  metadata: metadataSchema,
  structure: z
    .array(
      z.object({
        name: z.string().min(1).max(320),
        topics: z.array(
          z.object({
            title: z.string().min(1).max(320),
            subtopics: z
              .array(z.object({ title: z.string().min(1).max(320) }))
              .max(300)
              .optional(),
          }),
        ),
      }),
    )
    .min(1)
    .max(200),
})

export async function confirmEditalImportAction(
  payload: EditalImportConfirmPayload & { targetId: string },
): Promise<EditalImportConfirmResult> {
  try {
    const parsed = confirmPayloadSchema.safeParse(payload)
    if (!parsed.success) {
      return { success: false, error: "Dados inválidos para importação." }
    }
    const valid = parsed.data

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Não autenticado." }

    const { data: target } = await supabase
      .from("user_targets")
      .select("id")
      .eq("id", valid.targetId)
      .eq("user_id", user.id)
      .maybeSingle()
    if (!target) return { success: false, error: "Concurso alvo não encontrado." }

    const persisted = await persistEditalImport(supabase, user.id, valid.targetId, {
      fileName: valid.fileName,
      fileHash: valid.fileHash,
      metadata: valid.metadata,
      structure: valid.structure,
    })

    const structureWithIds = persisted.structureForMerge

    await mergeCustomTopics(supabase, user.id, valid.targetId, structureWithIds)

    revalidatePath("/edital")
    revalidatePath("/planejamento")
    revalidatePath("/dashboard")

    Sentry.captureMessage("Edital importado", {
      extra: { feature: FEATURE, step: "confirm", stats: persisted.stats },
    })

    return {
      success: true,
      editalId: persisted.editalId,
      stats: persisted.stats,
    }
  } catch (error) {
    if (error instanceof DuplicateEditalError) {
      return {
        success: false,
        alreadyImported: true,
        editalId: error.editalId,
        error: "Este edital já foi importado anteriormente.",
      }
    }
    Sentry.captureException(error, { extra: { feature: FEATURE, step: "confirm" } })
    return { success: false, error: "Erro ao importar o edital. Tente novamente." }
  }
}
