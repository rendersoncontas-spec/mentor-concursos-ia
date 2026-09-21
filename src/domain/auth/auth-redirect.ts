/**
 * Segurança de redirect pós-autenticação (login por senha ou Google OAuth).
 *
 * Regra: nunca aceitar um destino de redirect que não seja uma rota interna
 * do próprio NomeIA. Isso evita "open redirect" — alguém forjando um link de
 * login com `?next=https://site-malicioso.com` (ou `?redirectedFrom=...`) não
 * pode fazer o app mandar o usuário autenticado para fora do domínio.
 *
 * Usado tanto no botão "Continuar com Google" (para montar a URL de retorno)
 * quanto no callback /auth/callback (para decidir o redirect final) — a
 * validação do callback (servidor) é a que realmente importa; a do botão é
 * só para não nem tentar mandar algo inseguro.
 */
export function isSafeRedirectPath(path: string | null | undefined): path is string {
  if (!path) return false
  if (typeof path !== "string") return false
  // Precisa ser um caminho relativo à raiz do app.
  if (!path.startsWith("/")) return false
  // "//host/..." é interpretado pelo navegador como protocol-relative URL
  // (mesmo protocolo, host diferente) — bloqueia.
  if (path.startsWith("/\\") || path.startsWith("//")) return false
  // Qualquer esquema embutido (https://, javascript:, data:, etc.) — bloqueia.
  if (path.includes("://")) return false
  if (path.toLowerCase().includes("javascript:")) return false
  // Espaços/controles podem ser usados para escapar de validações ingênuas.
  if (/[\s\u0000-\u001f]/.test(path)) return false
  return true
}

/**
 * Decide o destino pós-login/pós-callback:
 *  - se houver um `next` explícito e seguro, ele tem prioridade (ex.: usuário
 *    tentou acessar uma rota protegida, foi mandado para /login com
 *    ?redirectedFrom=..., e deve voltar para lá depois de autenticar);
 *  - senão, onboarding pendente manda para /onboarding;
 *  - onboarding concluído manda para /dashboard.
 */
export function resolvePostAuthDestination(params: {
  onboardingCompleted: boolean
  nextParam: string | null | undefined
}): string {
  if (isSafeRedirectPath(params.nextParam)) {
    return params.nextParam
  }
  return params.onboardingCompleted ? "/dashboard" : "/onboarding"
}
