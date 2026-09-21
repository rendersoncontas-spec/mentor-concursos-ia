import { type NextRequest, NextResponse } from "next/server"

import {
  backfillProfileFromGoogle,
  getOnboardingCompleted,
} from "@/application/auth/google-oauth-profile"
import { resolvePostAuthDestination } from "@/domain/auth/auth-redirect"
import { createClient } from "@/infrastructure/supabase/server"

/**
 * Callback do OAuth (Google, e qualquer outro provider habilitado no futuro).
 *
 * Fluxo (Fase 3 do pedido):
 *  1. recebe `code` (ou `error`/`error_description`, se o usuário cancelou no
 *     Google ou o provider recusou);
 *  2. troca o code por sessão usando o Supabase SERVER client (cookies
 *     httpOnly — nunca expõe o token de acesso no client, nunca usa service role);
 *  3. identifica o usuário autenticado (supabase.auth.getUser() via a própria
 *     sessão recém-trocada);
 *  4. sincroniza o profile com os dados do Google, só preenchendo o que
 *     estiver vazio (backfillProfileFromGoogle — nunca sobrescreve dados
 *     personalizados, nunca faz INSERT: quem cria a linha é o trigger
 *     handle_new_user() do banco, igual já acontece hoje no cadastro por
 *     e-mail/senha);
 *  5. verifica onboarding e decide o destino final (Fase 7):
 *     onboarding pendente → /onboarding; concluído → /dashboard; ou o `next`
 *     explícito, mas só se for uma rota interna segura (isSafeRedirectPath —
 *     nunca um redirect externo arbitrário).
 *
 * Qualquer falha aqui redireciona para /login com um código de erro curto em
 * `oauthError` — nunca com a mensagem técnica do Supabase (isso é tratado na
 * tela de login, que mapeia o código para uma mensagem amigável; o detalhe
 * técnico só vai para o console.error do servidor).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl

  const toLogin = (oauthError: string) => {
    const url = new URL("/login", origin)
    url.searchParams.set("oauthError", oauthError)
    return NextResponse.redirect(url)
  }

  const providerError = searchParams.get("error") || searchParams.get("error_description")
  if (providerError) {
    console.warn("[GOOGLE_OAUTH] provider retornou erro no callback:", providerError)
    return toLogin(
      providerError.toLowerCase().includes("access_denied") ? "google_cancelled" : "provider_error",
    )
  }

  const code = searchParams.get("code")
  if (!code) {
    console.warn("[GOOGLE_OAUTH] callback chamado sem `code` e sem `error`")
    return toLogin("missing_code")
  }

  const nextParam = searchParams.get("next")

  const supabase = await createClient()

  let userId: string
  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error || !data.session || !data.user) {
      console.error(
        "[GOOGLE_OAUTH] exchangeCodeForSession falhou:",
        error?.message,
        "code:",
        error?.code,
        "status:",
        error?.status,
      )
      // Supabase recusa o exchange quando já existe uma conta com o mesmo
      // e-mail em outro provider e o linking automático não está habilitado
      // no projeto (ver docs/google-auth-setup.md — Fase 5: usuário existente).
      //
      // BUG CORRIGIDO (hardening 2026-09-21): a classificação dependia
      // exclusivamente do texto de error.message (message.includes(...)),
      // que a própria API do Supabase não garante como estável entre
      // versões. A versão instalada (@supabase/auth-js, via
      // @supabase/supabase-js 2.112.2) expõe error.code tipado
      // (ErrorCode, ver node_modules/@supabase/auth-js/.../error-codes.d.ts)
      // com códigos estáveis para exatamente este cenário:
      // identity_already_exists, email_conflict_identity_not_deletable,
      // email_exists, user_already_exists e manual_linking_disabled. Agora
      // error.code é a checagem primária (fonte confiável e versionada pela
      // API); o texto de error.message continua como fallback apenas para
      // o caso de um AuthUnknownError sem code (erro que não veio de uma
      // resposta HTTP da API, ver AuthError.code em errors.d.ts).
      const ACCOUNT_EXISTS_ERROR_CODES = new Set([
        "identity_already_exists",
        "email_conflict_identity_not_deletable",
        "email_exists",
        "user_already_exists",
        "manual_linking_disabled",
      ])
      const message = error?.message?.toLowerCase() ?? ""
      const hasReliableCode = Boolean(error?.code && ACCOUNT_EXISTS_ERROR_CODES.has(error.code))
      const matchesLegacyMessage =
        message.includes("already registered") || message.includes("identity")
      if (hasReliableCode || matchesLegacyMessage) {
        return toLogin("account_exists_different_method")
      }
      return toLogin("exchange_failed")
    }

    userId = data.user.id

    await backfillProfileFromGoogle(supabase, data.user)
  } catch (err) {
    console.error("[GOOGLE_OAUTH] erro inesperado no callback:", err)
    return toLogin("unexpected_error")
  }

  const onboardingCompleted = await getOnboardingCompleted(supabase, userId)
  const destination = resolvePostAuthDestination({ onboardingCompleted, nextParam })

  return NextResponse.redirect(new URL(destination, origin))
}
