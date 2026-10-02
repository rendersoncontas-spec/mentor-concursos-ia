"use server"

import { revalidatePath } from "next/cache"

import * as Sentry from "@sentry/nextjs"

import { createClient } from "@/infrastructure/supabase/server"
import { registerStudyToCycle } from "@/application/study-cycle/cycle-study-registration.service"
import { invalidateStatisticsCenterCache } from "@/application/study-analytics/statistics-center.action"
import {
  studyMinutesFromMinutesInput,
  studyMinutesFromMs,
} from "@/domain/study-session/study-duration"
import {
  clampIntOrNull,
  finiteOrNull,
  isParsableSaoPauloDateTime,
  isUuid,
  nonNegativeIntOrNull,
} from "@/domain/study-session/study-input"
import { buildIsoFromSaoPauloDateTime } from "@/lib/sao-paulo"
import { saveOrReplayStudyHistory } from "./study-session-idempotency"

export async function saveStudySessionAction(data: Record<string, unknown>) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: "Usuário não autenticado. Faça login novamente." }
    }

    // Fase C.1 — idempotência: quando a camada offline (cronômetro/manual,
    // salvamento direto ou retry via sync worker) já gerou um operationId,
    // ele viaja neste payload e é gravado como client_operation_id (coluna
    // nullable, migration 20260923_1). Chamadores que nunca passam por essa
    // camada (ex.: chamadas diretas antigas, se existirem) continuam
    // funcionando exatamente como antes: sem operationId, client_operation_id
    // fica NULL e nenhum comportamento muda.
    // G1.6 (G-36/G-41): a coluna é UUID — rejeita formato inválido aqui com
    // erro claro em vez de deixar o banco devolver 22P02 genérico (que além
    // de tudo não aciona o caminho de replay idempotente).
    const rawOperationId = data["operationId"] ? String(data["operationId"]).trim() : null
    if (rawOperationId !== null && !isUuid(rawOperationId)) {
      return { success: false, error: "Identificador da operação inválido. Tente salvar novamente." }
    }
    const operationId = rawOperationId

    // 1. Busca Disciplina (não cria mais - RLS impede INSERT na tabela disciplines)
    // G1.6 (G-41): ID informado fora do formato UUID é rejeitado aqui com erro
    // claro, antes de virar erro genérico de FK/UUID no banco.
    let disciplineId = data["discipline_id"]
    if (disciplineId) {
      if (!isUuid(disciplineId)) {
        return { success: false, error: "Disciplina inválida. Selecione novamente a disciplina." }
      }
      disciplineId = String(disciplineId).trim()
    }
    if (!disciplineId && data["discipline_name"]) {
      const { data: existingDisc, error: findError } = await supabase
        .from("disciplines")
        .select("id")
        .ilike("name", String(data["discipline_name"]).trim())
        .order("name")
        .order("id")
        .limit(1)
        .maybeSingle()

      if (findError) {
        console.error("Erro ao buscar disciplina:", findError)
      }

      if (existingDisc) {
        disciplineId = existingDisc.id
      } else {
        return {
          success: false,
          error: `Disciplina "${data["discipline_name"]}" não encontrada no sistema. Selecione uma disciplina existente na lista.`,
        }
      }
    }

    if (!disciplineId) {
      return { success: false, error: "Disciplina não encontrada e não foi possível criar." }
    }

    // 2. Monta o Metadata
    const metadata: Record<string, unknown> = {
      pages_read: data["pages_read"] || 0,
      questions_answered: data["questions_answered"] || 0,
      questions_correct: data["questions_correct"] || 0,
      flashcards_reviewed: data["flashcards_reviewed"] || 0,
      flashcards_correct: data["flashcards_correct"] || 0,
      audio_name: data["audio_name"] || null,
      audio_author: data["audio_author"] || null,
      audio_platform: data["audio_platform"] || null,
      audio_speed: data["audio_speed"] || null,
      audio_url: data["audio_url"] || null,
      // Foco: só grava quando existe medição REAL. Ausência (null/undefined/string
      // vazia) vira NULL — nunca 0. "Foco 0%" exige medição real de 0%.
      // G1.6: finiteOrNull — "abc"/NaN/Infinity viram NULL em vez de NaN
      // silencioso (que o driver serializaria como null sem avisar).
      focus_percentage: finiteOrNull(data["focusPercentage"]),
      completed_cycles: data["completedCycles"] || 0,
      topic_name: data["topic_name"] || null,
      focus_sound: data["focus_sound"] || null,
      focus_sound_volume: data["focus_sound_volume"] ?? null,
      is_manual_mode: data["is_manual_mode"] === true || data["is_manual_mode"] === "true",
      // Vínculo com o ciclo de estudo
      cycle_id: data["cycle_id"] || null,
      cycle_item_id: data["cycle_item_id"] || null,
    }

    // 3. Calcular duração real
    let activeMinutesFinal = 0
    let pausedMinutesFinal = 0
    let startedAtISO: string | null = null
    let finishedAtISO: string | null = null

    if (!data["is_manual_mode"] && data["sessionStartTime"]) {
      const startTime = Number(data["sessionStartTime"])
      // G2.3 — congela o fim no Encerrar: o dwell parado na avaliação não
      // entra em `paused` (foco% exibido == salvo). Inválido/ausente = agora.
      const rawEvalStart = Number(
        data["evaluationStartedAt"] ?? data["evaluation_started_at"] ?? NaN,
      )
      const now =
        Number.isFinite(rawEvalStart) && rawEvalStart > startTime && rawEvalStart <= Date.now()
          ? rawEvalStart
          : Date.now()
      // Desconta o total de pausas já finalizadas E a pausa em andamento (se houver),
      // espelhando o cálculo do client (calculateTimes).
      let totalPausedMs = Number(data["sessionTotalPausedMs"] || 0)
      const lastPauseStartTime = Number(data["sessionLastPauseStartTime"])
      if (lastPauseStartTime > 0) {
        totalPausedMs += Math.max(0, now - lastPauseStartTime)
      }

      const totalElapsedMs = now - startTime
      const activeMs = Math.max(0, totalElapsedMs - totalPausedMs)

      // Banco espera integer — arredondar para inteiro
      activeMinutesFinal = studyMinutesFromMs(activeMs)
      pausedMinutesFinal = studyMinutesFromMs(totalPausedMs)

      startedAtISO = new Date(startTime).toISOString()
      finishedAtISO = new Date(now).toISOString()
    } else {
      // Modo manual: garantir que sejam inteiros
      activeMinutesFinal = studyMinutesFromMinutesInput(data["activeMinutes"])
      pausedMinutesFinal = studyMinutesFromMinutesInput(data["pausedMinutes"])
    }

    // 4. Mapear studyType → study_source (campo NOT NULL com CHECK constraint)
    // Valores permitidos: 'PLAN', 'FREE', 'REVIEW', 'SIMULADO', 'QUESTOES', 'VIDEO', 'PDF'
    const studySourceMap: Record<string, string> = {
      TEORIA: "FREE",
      QUESTOES: "QUESTOES",
      REVISAO: "REVIEW",
      AUDIO: "FREE",
      VIDEOAULA: "VIDEO",
      SIMULADO: "SIMULADO",
      OUTRO: "FREE",
      RESUMO: "FREE",
      MAPA_MENTAL: "FREE",
      FLASHCARDS: "FREE",
      LEITURA: "FREE",
      LEI_SECA: "FREE",
      JURISPRUDENCIA: "FREE",
      INFORMATIVOS: "FREE",
      DOUTRINA: "FREE",
      MONITORIA: "FREE",
      ESTUDO_IA: "FREE",
      DISCUSSAO: "FREE",
    }
    // Origem explícita (ex.: "PLAN" vinda do Cronograma) tem prioridade sobre o tipo de estudo.
    const explicitSource = data["study_source"] ? String(data["study_source"]) : null
    const studySource =
      explicitSource &&
      ["PLAN", "FREE", "REVIEW", "SIMULADO", "QUESTOES", "VIDEO", "PDF"].includes(explicitSource)
        ? explicitSource
        : studySourceMap[String(data["studyType"])] || "FREE"

    // Sessão interrompida (Cronograma): tempo estudado abaixo de 90% do planejado
    const interrupted = Boolean(data["interrupted"])

    // G1.6 (G-41): vínculo com o planejamento validado antes do banco — ID
    // fora do formato virava erro opaco de FK/UUID no insert.
    if (data["study_plan_item_id"] && !isUuid(data["study_plan_item_id"])) {
      return { success: false, error: "Item de planejamento inválido. Tente salvar novamente." }
    }

    // 5. Monta o payload base do study_history
    const insertPayload: Record<string, unknown> = {
      user_id: user.id,
      discipline_id: disciplineId,
      study_source: studySource, // OBRIGATÓRIO com CHECK constraint
      study_type: data["studyType"] || null,
      technique: data["technique"] || null,
      active_minutes: activeMinutesFinal,
      paused_minutes: pausedMinutesFinal,
      duration_minutes: activeMinutesFinal,
      completed: !interrupted,
      interrupted,
      notes: data["notes"] || null,
      metadata: metadata,
      // Vínculo com o planejamento (quando a sessão veio do Cronograma)
      study_plan_item_id: data["study_plan_item_id"] ? String(data["study_plan_item_id"]) : null,
      planned_minutes: nonNegativeIntOrNull(data["planned_minutes"]),
      // Energia é entrada manual do usuário (não existe medição automática).
      // G1.6: NaN/"abc" viram NULL em vez de NaN silencioso.
      energy_level: clampIntOrNull(data["energy_level"], 1, 5),
    }

    // Fase C.1: só grava quando fornecido — nunca inventa um operationId no
    // servidor (o brief é explícito: "não gerar outro UUID no servidor").
    if (operationId) {
      insertPayload["client_operation_id"] = operationId
    }

    // Se for cronômetro, usar timestamps reais
    if (startedAtISO) {
      insertPayload["started_at"] = startedAtISO
      insertPayload["finished_at"] = finishedAtISO
    } else if (data["study_date"]) {
      // Manual com data e horário informados.
      // G1.6 (G-41): data informada mas inválida é erro honesto — antes caía
      // no fallback silencioso de buildIsoFromSaoPauloDateTime e a sessão era
      // gravada "agora" sem avisar. Ausência continua significando "agora".
      const studyDate = String(data["study_date"]).trim()
      const studyTime = data["study_time"] ? String(data["study_time"]).trim() : null
      if (!isParsableSaoPauloDateTime(studyDate, studyTime)) {
        return { success: false, error: "Data de estudo inválida. Verifique dia e horário." }
      }
      const startedAt = buildIsoFromSaoPauloDateTime(studyDate, studyTime)
      insertPayload["started_at"] = startedAt
      const durationMs = (activeMinutesFinal || 0) * 60 * 1000
      insertPayload["finished_at"] = new Date(
        new Date(startedAt).getTime() + durationMs,
      ).toISOString()
    } else {
      // Manual sem data específica -> horário atual
      const now = new Date().toISOString()
      insertPayload["started_at"] = now
      const durationMs = (activeMinutesFinal || 0) * 60 * 1000
      insertPayload["finished_at"] = new Date(new Date(now).getTime() + durationMs).toISOString()
    }

    // 6-7. Salva em study_history (ou resolve como replay idempotente de uma
    // operação já processada) e, só no caminho de INSERT normal, atualiza o
    // progresso do ciclo — nunca no replay (item 5 do pedido de Fase C.1).
    // Ver `saveOrReplayStudyHistory` para a lógica completa e testável.
    return await saveOrReplayStudyHistory({
      operationId,
      insert: () =>
        supabase
          .from("study_history")
          .insert(insertPayload)
          .select("*, disciplines ( id, name, area )")
          .single(),
      lookupByOperationId: () =>
        supabase
          .from("study_history")
          .select("*, disciplines ( id, name, area )")
          .eq("client_operation_id", operationId as string)
          .maybeSingle(),
      shouldRegisterCycle: activeMinutesFinal > 0,
      registerCycle: () => registerStudyToCycle(),
      onRevalidate: () => {
        revalidatePath("/dashboard")
        revalidatePath("/dashboard/history")
        revalidatePath("/estatisticas")
        revalidatePath("/disciplines")
        revalidatePath("/home")
        revalidatePath("/ciclos")
        // G1.14 — o cache em memória de Estatísticas (TTL 5min) não é
        // invalidado por revalidatePath; sem isso, salvar estudo mostrava
        // "Hoje" obsoleto nas Estatísticas por até 5 minutos.
        void invalidateStatisticsCenterCache(user.id)
      },
      onInsertError: (historyError) => {
        console.error("[STUDY_SAVE] Erro ao inserir study_history:", historyError)
        Sentry.captureMessage("Falha ao salvar sessão de estudo", {
          extra: { feature: "study-session", code: historyError.code ?? null },
        })
      },
      onLookupFailed: (lookupError) => {
        console.error(
          "[STUDY_SAVE] Conflito de client_operation_id mas registro não encontrado:",
          lookupError,
        )
        Sentry.captureMessage("Idempotência: registro não encontrado após conflito de operationId", {
          extra: { feature: "study-session", operationId },
        })
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro inesperado ao salvar."
    console.error("[saveStudySession] Erro inesperado:", err)
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
      extra: { feature: "study-session" },
    })
    return { success: false, error: message }
  }
}
