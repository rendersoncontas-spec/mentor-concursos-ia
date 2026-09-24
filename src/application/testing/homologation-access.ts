import type { SupabaseClient } from "@supabase/supabase-js"

import { getUserRole } from "@/application/admin/auth-guard"

/**
 * Fase G.1 — autorização da ferramenta interna de homologação.
 *
 * A homologação roda fluxos de ponta a ponta que GRAVAM dados de teste
 * (cronograma, sessões de estudo, resposta do Mentor) na conta de quem a
 * executa. Antes desta fase bastava estar logado para abrir a página e chamar
 * as Server Actions. Agora é restrita a administradores, usando o mecanismo de
 * papéis que já existe (`user_roles`, lido por `getUserRole` no servidor):
 *
 * - admin      → permitido;
 * - moderator  → negado (o papel de suporte cobre o painel /admin e o modo
 *                suporte, não ferramentas que gravam dados de teste);
 * - user       → negado;
 * - sem sessão → negado.
 *
 * Falha fechada: se a leitura do papel falhar, `getUserRole` devolve "user"
 * e o acesso é negado.
 *
 * Arquivo sem "use server" de propósito: estas funções NÃO são endpoints.
 * O único ponto de entrada chamável pelo cliente são as Server Actions de
 * `homologation.actions.ts`, e todas passam por `runHomologationGuarded`.
 */

export type HomologationAccess =
  | { allowed: true; userId: string }
  | { allowed: false; reason: "UNAUTHENTICATED" | "FORBIDDEN" }

export const HOMOLOGATION_UNAUTHENTICATED_MESSAGE = "Não autenticado"
export const HOMOLOGATION_FORBIDDEN_MESSAGE =
  "Acesso negado: ferramenta interna restrita a administradores."

export async function checkHomologationAccess(
  supabase: SupabaseClient,
): Promise<HomologationAccess> {
  const { data } = await supabase.auth.getUser()
  const user = data?.user
  if (!user) return { allowed: false, reason: "UNAUTHENTICATED" }

  const role = await getUserRole(supabase, user.id)
  if (role !== "admin") return { allowed: false, reason: "FORBIDDEN" }

  return { allowed: true, userId: user.id }
}

/**
 * Executa `run` somente depois de autorizar no servidor. Sem permissão, `run`
 * nunca é chamado — nenhuma leitura ou escrita da homologação acontece.
 */
export async function runHomologationGuarded<T>(
  supabase: SupabaseClient,
  run: (userId: string) => Promise<T>,
): Promise<{ data: T | null; error: string | null }> {
  const access = await checkHomologationAccess(supabase)
  if (!access.allowed) {
    return {
      data: null,
      error:
        access.reason === "UNAUTHENTICATED"
          ? HOMOLOGATION_UNAUTHENTICATED_MESSAGE
          : HOMOLOGATION_FORBIDDEN_MESSAGE,
    }
  }
  return { data: await run(access.userId), error: null }
}
