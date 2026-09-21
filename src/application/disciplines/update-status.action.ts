"use server"

import { createClient } from "@/infrastructure/supabase/server"
import { getEffectiveUserId } from "@/application/admin/auth-guard"
import { updateUserDisciplineStatus } from "@/application/disciplines/disciplines.service"
import { type DisciplineStatus } from "@/domain/disciplines/disciplines.types"
import { isMaintenanceMode } from "@/lib/maintenance"

// Fase 5 da auditoria de estabilização (seguranca/ownership): esta action
// recebia "userId" diretamente do cliente e repassava para o filtro
// .eq("user_id", userId) em updateUserDisciplineStatus, em vez de derivar o
// usuario autenticado no servidor como todas as outras actions do projeto.
// Sem nenhum caller hoje (funcao nao utilizada em src/), mas se um dia for
// usada, um cliente malicioso poderia enviar o userId de outra pessoa —
// so nao era explorável hoje porque a RLS de user_disciplines (auth.uid() =
// user_id) barra a escrita cruzada, mas a propria app confiava no valor do
// cliente como se fosse uma segunda camada real de proteção (não era).
// Corrigido para seguir o mesmo padrão usado em todo o resto do código:
// o id do usuario vem sempre de getEffectiveUserId(supabase), nunca de um
// parâmetro do cliente.
export async function updateDisciplineStatusAction(
  userDisciplineId: string,
  status: DisciplineStatus
) {
  if (isMaintenanceMode()) return { success: false, error: "Sistema temporariamente indisponível." }
  const supabase = await createClient()
  const effectiveUserId = await getEffectiveUserId(supabase)
  if (!effectiveUserId) return { success: false, error: "Não autenticado." }

  const ok = await updateUserDisciplineStatus(supabase, effectiveUserId, userDisciplineId, status)

  if (!ok) {
    return { success: false }
  }

  return { success: true }
}
