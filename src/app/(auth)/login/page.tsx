import { Suspense } from "react"

import type { Metadata } from "next"
import Link from "next/link"

import { isSafeRedirectPath } from "@/domain/auth/auth-redirect"
import { LoginForm } from "@/features/auth/components/login-form"
import { OAuthErrorToast } from "@/features/auth/components/oauth-error-toast"

export const metadata: Metadata = {
  title: "Login — NomeIA",
  description: "Acesse sua conta no NomeIA. Sua preparação rumo à nomeação.",
}

interface LoginPageProps {
  searchParams: Promise<{ redirectedFrom?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { redirectedFrom } = await searchParams
  const next = isSafeRedirectPath(redirectedFrom) ? redirectedFrom : null

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <OAuthErrorToast />
      </Suspense>

      <div className="space-y-2 text-center sm:text-left">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Acesse sua conta
        </h1>
        <p className="text-sm text-muted-foreground">
          Insira suas credenciais abaixo para acessar o NomeIA.
        </p>
      </div>

      <LoginForm next={next} />

      <div className="pt-4 text-center text-sm text-muted-foreground border-t border-border/60">
        Não tem uma conta ainda?{" "}
        <Link
          href="/register"
          className="font-semibold text-primary hover:underline underline-offset-4"
        >
          Cadastre-se grátis
        </Link>
      </div>
    </div>
  )
}
