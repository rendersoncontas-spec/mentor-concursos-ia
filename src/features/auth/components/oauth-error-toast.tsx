"use client"

import { useEffect } from "react"

import { useRouter, useSearchParams } from "next/navigation"

import { toast } from "sonner"

/**
 * Mensagens amigáveis para os códigos de erro que /auth/callback pode anexar
 * em `?oauthError=`. Nunca mostramos a mensagem técnica do Supabase
 * (Fase 12) — só o código curto chega até aqui; o detalhe fica no log do
 * servidor.
 */
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  google_cancelled: "Login com Google cancelado.",
  missing_code: "Não foi possível concluir o login com Google. Tente novamente.",
  exchange_failed: "Não foi possível concluir o login com Google. Tente novamente.",
  provider_error: "O Google não conseguiu confirmar seu login. Tente novamente.",
  unexpected_error: "Algo deu errado ao entrar com Google. Tente novamente em instantes.",
  account_exists_different_method:
    "Já existe uma conta com este e-mail cadastrada por senha. Entre com e-mail e senha, ou fale com o suporte para vincular sua conta Google.",
}

const DEFAULT_MESSAGE = "Não foi possível entrar com Google. Tente novamente."

/**
 * Componente invisível: lê `?oauthError=` da URL do /login, mostra um toast
 * amigável uma única vez e limpa o parâmetro da URL (evita repetir o toast se
 * o usuário atualizar a página).
 */
export function OAuthErrorToast() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const oauthError = searchParams.get("oauthError")

  useEffect(() => {
    if (!oauthError) return

    toast.error(OAUTH_ERROR_MESSAGES[oauthError] ?? DEFAULT_MESSAGE)

    const params = new URLSearchParams(searchParams.toString())
    params.delete("oauthError")
    const query = params.toString()
    router.replace(query ? `/login?${query}` : "/login", { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oauthError])

  return null
}
