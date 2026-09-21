"use client"

import { useState } from "react"

import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { isSafeRedirectPath } from "@/domain/auth/auth-redirect"
import { createClient } from "@/infrastructure/supabase/client"

interface GoogleAuthButtonProps {
  /** Ajusta só o texto do botão ao contexto da tela (Fase 6). */
  mode?: "login" | "register"
  /**
   * Rota interna para onde voltar depois do login (ex.: veio de um
   * `?redirectedFrom=` do middleware). Validada de novo no servidor
   * (/auth/callback) — isso aqui é só para não nem tentar mandar algo que já
   * sabemos ser inseguro.
   */
  next?: string | null | undefined
  className?: string
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.78-2.4 3.63v3.02h3.88c2.27-2.09 3.57-5.17 3.57-8.84z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.94-2.9l-3.88-3.02c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.94H1.27v3.11C3.25 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.29A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.29V6.6H1.27A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.27 5.4l4.01-3.11z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.94 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.6l4.01 3.11C6.23 6.88 8.88 4.77 12 4.77z"
      />
    </svg>
  )
}

export function GoogleAuthButton({ mode = "login", next, className }: GoogleAuthButtonProps) {
  const [isLoading, setIsLoading] = useState(false)

  async function handleClick() {
    if (isLoading) return
    setIsLoading(true)

    try {
      const supabase = createClient()

      const callbackUrl = new URL("/auth/callback", window.location.origin)
      if (isSafeRedirectPath(next)) {
        callbackUrl.searchParams.set("next", next)
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl.toString(),
        },
      })

      if (error) {
        console.error("[GOOGLE_OAUTH] signInWithOAuth falhou:", error.message)
        toast.error("Não foi possível continuar com o Google agora. Tente novamente em instantes.")
        setIsLoading(false)
      }
      // Em caso de sucesso o navegador é redirecionado para o Google — não há
      // mais nada para fazer aqui (nem faz sentido setIsLoading(false), a
      // página está de saída).
    } catch (err) {
      console.error("[GOOGLE_OAUTH] erro inesperado ao iniciar o fluxo Google:", err)
      toast.error("Não foi possível continuar com o Google agora. Tente novamente em instantes.")
      setIsLoading(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className={`w-full h-11 gap-2 font-semibold ${className ?? ""}`}
      onClick={handleClick}
      disabled={isLoading}
    >
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleLogo />}
      {mode === "register" ? "Continuar com Google" : "Entrar com Google"}
    </Button>
  )
}
