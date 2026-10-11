"use server"

import { revalidatePath } from "next/cache"

import { deleteSimuladoRecord, saveSimuladoRecord } from "@/application/simulados/simulado-record-persistence"
import {
  readSimuladoRecords,
  readSimuladoSubjects,
  toRecord,
  type SimuladoRecordsFilters,
  type SimuladoRow,
} from "@/application/simulados/simulado-records.read"
import { getEffectiveUserId } from "@/application/admin/auth-guard"
import { invalidateStatisticsCenterCache } from "@/application/study-analytics/statistics-center.action"
import { hideCatalogAliases, loadCatalogAliasIds } from "@/application/disciplines/discipline-aliases"
import { loadDisciplineIdentity } from "@/application/disciplines/discipline-identity.loader"
import { EMPTY_DISCIPLINE_IDENTITY, type DisciplineIdentitySnapshot } from "@/domain/disciplines/discipline-identity"
import { todayKeyInSaoPaulo } from "@/lib/sao-paulo"
import type { SimuladoRecord, SimuladoRecordInput } from "@/domain/simulados/types"
import { createClient } from "@/infrastructure/supabase/server"

type Supabase = Awaited<ReturnType<typeof createClient>>

async function requireUser(supabase: Supabase, auditContext?: Parameters<typeof getEffectiveUserId>[1]) {
  return await getEffectiveUserId(supabase, auditContext)
}

/**
 * Registra (ou atualiza, quando input.id presente) um simulado feito fora do sistema.
 * NÃO toca em ciclo, planejamento, histórico de estudo ou questões.
 *
 * G2.10: validação completa no servidor, matérias conferidas contra o
 * catálogo, totais derivados das matérias, idempotência por `requestId` e
 * atualização sem janela de perda de dados (simulado-record-persistence.ts).
 */
export async function saveSimuladoRecordAction(input: SimuladoRecordInput): Promise<{
  data: { id: string } | null
  error: string | null
}> {
  try {
    const supabase = await createClient()
    const userId = await requireUser(supabase, { action: "SAVE_SIMULADO_RECORD", resource: input?.id ?? "" })
    if (!userId) return { data: null, error: "Usuário não autenticado." }
    const result = await saveSimuladoRecord(supabase, userId, input, todayKeyInSaoPaulo())
    if (!result.error) {
      revalidatePath("/simulados")
      // G2.13: as Estatísticas mostram simulados por matéria — sem cache velho.
      await invalidateStatisticsCenterCache(userId)
      revalidatePath("/estatisticas")
    }
    return result
  } catch (e) {
    return { data: null, error: (e as { message?: string })?.message ?? "Erro ao salvar simulado." }
  }
}

/**
 * Lista os simulados registrados do usuário (novos registros + antigos finalizados),
 * ordenados do mais recente para o mais antigo.
 */
export async function getSimuladoRecordsAction(filters?: SimuladoRecordsFilters & {
  /** G2.12: quem já carrega a identidade por conta própria pula esta leitura. */
  skipIdentity?: boolean
}): Promise<{ data: SimuladoRecord[] | null; error: string | null; identity?: DisciplineIdentitySnapshot }> {
  try {
    const supabase = await createClient()
    const userId = await requireUser(supabase)
    if (!userId) return { data: null, error: "Usuário não autenticado." }

    // G2.10: só registros manuais (mode nulo); leitura única em
    // simulado-records.read.ts (G2.13), compartilhada com as Estatísticas.
    const { data: records, error } = await readSimuladoRecords(supabase, userId, filters)
    if (error || !records) return { data: null, error: error ?? "Erro ao carregar simulados." }

    // G2.12: identidade canônica das matérias (aliases do catálogo + nome
    // pessoal). Só as ANÁLISES usam; a lista/edição seguem com os ids gravados.
    // Falha aqui não derruba a tela: sem identidade, cada id é ele mesmo.
    let identity: DisciplineIdentitySnapshot = EMPTY_DISCIPLINE_IDENTITY
    if (!filters?.skipIdentity) {
      const subjectIds = records.flatMap((r) => r.subjects.map((s) => s.disciplineId).filter((id): id is string => !!id))
      const loaded = await loadDisciplineIdentity(supabase, userId, subjectIds)
      if (!loaded.error) identity = loaded.data
    }

    return { data: records, error: null, identity }
  } catch (e) {
    return { data: null, error: (e as { message?: string })?.message ?? "Erro ao carregar simulados." }
  }
}

/**
 * Busca um simulado registrado por ID (isolado por usuário).
 */
export async function getSimuladoRecordAction(
  simuladoId: string
): Promise<{ data: SimuladoRecord | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const userId = await requireUser(supabase)
    if (!userId) return { data: null, error: "Usuário não autenticado." }

    const { data: row, error } = await supabase
      .from("simulados")
      .select("*")
      .eq("id", simuladoId)
      .eq("user_id", userId)
      .is("mode", null)
      .maybeSingle()
    if (error || !row) return { data: null, error: "Simulado não encontrado." }

    // G2.13: sem as matérias não há registro íntegro para editar (salvar
    // gravaria o simulado sem elas) — erro, nunca registro vazio.
    const subjects = await readSimuladoSubjects(supabase, userId, [simuladoId])
    if (subjects.error) return { data: null, error: subjects.error }
    return { data: toRecord(row as SimuladoRow, subjects.data.get(simuladoId) ?? []), error: null }
  } catch (e) {
    return { data: null, error: (e as { message?: string })?.message ?? "Erro ao carregar simulado." }
  }
}

/**
 * Exclui um simulado registrado (isolado por usuário).
 */
export async function deleteSimuladoRecordAction(
  simuladoId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const userId = await requireUser(supabase, { action: "DELETE_SIMULADO_RECORD", resource: simuladoId })
    if (!userId) return { error: "Usuário não autenticado." }
    const result = await deleteSimuladoRecord(supabase, userId, simuladoId)
    if (!result.error) {
      revalidatePath("/simulados")
      await invalidateStatisticsCenterCache(userId)
      revalidatePath("/estatisticas")
    }
    return result
  } catch (e) {
    return { error: (e as { message?: string })?.message ?? "Erro ao excluir simulado." }
  }
}

/**
 * Lista matérias (disciplinas) para o formulário de registro.
 */
export async function getSimuladoFormDisciplinesAction(): Promise<{
  data: { id: string; name: string; area: string | null }[] | null
  error: string | null
}> {
  try {
    const supabase = await createClient()
    const userId = await requireUser(supabase)
    if (!userId) return { data: [], error: null }

    // G2.14: aliases comprovados saem da lista de ESCOLHA (a canônica fica).
    // Matérias já lançadas num simulado não dependem desta lista.
    const [{ data, error }, aliasIds] = await Promise.all([
      supabase
        .from("disciplines")
        .select("id, name, area")
        .order("name", { ascending: true })
        .limit(300),
      loadCatalogAliasIds(supabase),
    ])
    if (error) return { data: null, error: error.message }
    return { data: hideCatalogAliases(data ?? [], aliasIds), error: null }
  } catch (e) {
    return { data: null, error: (e as { message?: string })?.message ?? "Erro ao carregar matérias." }
  }
}
