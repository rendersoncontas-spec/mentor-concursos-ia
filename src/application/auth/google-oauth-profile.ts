import type { SupabaseClient, User } from "@supabase/supabase-js"

/**
 * Login com Google — sincronização de profile.
 *
 * IMPORTANTE (ver docs/google-auth-setup.md e docs/database/01-supabase-setup.md):
 * a linha em `public.profiles` para um usuário novo é criada pelo TRIGGER de banco
 * `handle_new_user()` disparado em INSERT em `auth.users` — isso já acontece hoje
 * para cadastro por e-mail/senha, e o mesmo trigger dispara igual para um usuário
 * novo via Google, já que ele reage à tabela `auth.users`, não ao método de login.
 *
 * Por isso este módulo NUNCA faz INSERT em `profiles`: só existe policy de RLS de
 * SELECT/UPDATE para o próprio usuário (não há policy de INSERT para o client
 * autenticado — só o trigger, que roda com privilégio de definer, pode inserir).
 * Criar um caminho de INSERT aqui seria (a) uma lógica paralela de criação de conta
 * que a Parte-Regra deste projeto pede para evitar, e (b) uma escrita que falharia
 * por RLS de qualquer forma. Se por algum motivo a linha ainda não existir quando
 * o callback roda, apenas logamos e seguimos — o restante do app já tolera um
 * profile ausente (ver getEffectiveSessionUser em application/admin/auth-guard.ts).
 */

export interface ProfileBackfillRow {
  name: string | null
  full_name: string | null
  avatar_url: string | null
  email: string | null
}

/**
 * Calcula (função pura, sem I/O) quais campos do profile devem ser preenchidos
 * com dados do Google — só os que estão vazios hoje. Dados que o usuário já
 * personalizou no NomeIA nunca são sobrescritos; o Google serve apenas como
 * fallback de inicialização (Fase 10 do pedido).
 *
 * Retorna `null` quando não há nada a atualizar.
 */
export function computeGoogleProfileBackfill(
  profile: ProfileBackfillRow,
  googleUser: Pick<User, "email" | "user_metadata">,
): Partial<ProfileBackfillRow> | null {
  const meta = (googleUser.user_metadata ?? {}) as Record<string, unknown>

  const googleName =
    (typeof meta["full_name"] === "string" && meta["full_name"]) ||
    (typeof meta["name"] === "string" && meta["name"]) ||
    null

  const googleAvatar =
    (typeof meta["avatar_url"] === "string" && meta["avatar_url"]) ||
    (typeof meta["picture"] === "string" && meta["picture"]) ||
    null

  const updates: Partial<ProfileBackfillRow> = {}

  if (!profile.name && googleName) updates.name = googleName
  if (!profile.full_name && googleName) updates.full_name = googleName
  if (!profile.avatar_url && googleAvatar) updates.avatar_url = googleAvatar
  if (!profile.email && googleUser.email) updates.email = googleUser.email

  return Object.keys(updates).length > 0 ? updates : null
}

/**
 * Lê o profile atual e aplica o backfill (se houver algo a preencher) via UPDATE.
 * Nunca lança: falhas aqui não podem derrubar o login — só ficam registradas no
 * log do servidor (Fase 12: detalhes técnicos só no log, nunca para o usuário).
 */
export async function backfillProfileFromGoogle(
  supabase: SupabaseClient,
  user: User,
): Promise<void> {
  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("name, full_name, avatar_url, email")
    .eq("id", user.id)
    .maybeSingle<ProfileBackfillRow>()

  if (readError) {
    console.error("[GOOGLE_OAUTH] falha ao ler profile para backfill:", readError.message)
    return
  }

  if (!profile) {
    console.warn(
      "[GOOGLE_OAUTH] profile ainda não existe para o usuário",
      user.id,
      "— aguardando o trigger handle_new_user() do banco (ver docs/google-auth-setup.md)",
    )
    return
  }

  const updates = computeGoogleProfileBackfill(profile, user)
  if (!updates) return

  const { error: updateError } = await supabase.from("profiles").update(updates).eq("id", user.id)
  if (updateError) {
    console.error("[GOOGLE_OAUTH] falha ao atualizar profile com dados do Google:", updateError.message)
  }
}

/**
 * Verifica se o usuário já concluiu o onboarding (Fase 7 — decide o redirect
 * pós-callback). Em caso de erro de leitura, assume "não concluído" — é a opção
 * segura: na pior hipótese o usuário revê o wizard de onboarding, nunca cai
 * silenciosamente numa dashboard sem os dados básicos configurados.
 */
export async function getOnboardingCompleted(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .eq("id", userId)
    .maybeSingle<{ onboarding_completed: boolean | null }>()

  if (error) {
    console.error("[GOOGLE_OAUTH] falha ao verificar onboarding_completed:", error.message)
    return false
  }

  return Boolean(data?.onboarding_completed)
}
