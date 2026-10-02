/**
 * Fase F.4 (performance/infra) — mitigação para o PWA demorando ~10s para
 * abrir no celular do usuário. Causa raiz identificada: o projeto Supabase
 * está no plano gratuito, que pausa o banco após ~7 dias sem nenhuma
 * requisição de API. Ao "acordar" na próxima requisição, a resposta demora
 * vários segundos — e como o middleware (`src/proxy.ts`) chama
 * `auth.getUser()` em toda navegação (inclusive `/login`), a primeira
 * abertura após um período de inatividade paga esse custo inteiro antes de
 * mostrar qualquer coisa na tela.
 *
 * Esta rota (`src/app/api/cron/keep-alive/route.ts`) é chamada uma vez por
 * dia por um Vercel Cron Job (ver `vercel.json`) só para gerar uma
 * requisição de API ao Supabase — bem abaixo do limite de 7 dias de
 * inatividade — e assim o projeto nunca pausa. Não cria tabela, não lê nem
 * grava dado nenhum, não altera autenticação nem nenhuma regra de negócio.
 *
 * Protegida por um segredo (`CRON_SECRET`) para que não seja um endpoint
 * público chamável por qualquer um.
 */

const AUTH_HEALTH_PATH = "/auth/v1/health"

export function isAuthorizedCronRequest(
  authorizationHeader: string | null | undefined,
  expectedSecret: string | undefined | null,
): boolean {
  // Fail-closed: sem CRON_SECRET configurado, a rota nunca autoriza nada —
  // evita um endpoint aberto por esquecimento de configurar a variável.
  if (!expectedSecret) return false
  if (!authorizationHeader) return false
  return authorizationHeader === `Bearer ${expectedSecret}`
}

export function buildSupabaseHealthCheckUrl(supabaseUrl: string): string {
  const normalized = supabaseUrl.replace(/\/+$/, "")
  return `${normalized}${AUTH_HEALTH_PATH}`
}
