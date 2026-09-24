import { createClient } from "@/infrastructure/supabase/client"

/**
 * Descobre o userId atual no CLIENTE, sem depender de rede — essencial para
 * a camada offline: se precisássemos de uma chamada de rede só para saber
 * "de quem" é o IndexedDB, o app não funcionaria nem para ler o cronômetro
 * offline.
 *
 * Por isso usamos `supabase.auth.getSession()` (lê a sessão local já
 * armazenada pelo próprio @supabase/ssr, só volta à rede se o token
 * precisar de refresh) e NUNCA `supabase.auth.getUser()` (sempre contata o
 * servidor Auth para revalidar — correto para autorização, errado para
 * decidir uma chave de armazenamento local).
 *
 * Retorna null quando não há sessão local (usuário deslogado) — a camada
 * offline simplesmente não persiste nada nesse caso, sem tentar criar uma
 * autenticação offline paralela (regra do pedido, item 17).
 */
export async function getClientUserId(): Promise<string | null> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase.auth.getSession()
    if (error) return null
    return data.session?.user.id ?? null
  } catch {
    return null
  }
}
