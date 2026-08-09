import type { Metadata } from "next"
import Link from "next/link"

import { LoginForm } from "@/features/auth/components/login-form"

export const metadata: Metadata = {
  title: "Login | Mentor Concursos IA",
  description: "Acesse sua conta no Mentor Concursos IA.",
}

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center sm:text-left">
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          Acesse sua conta
        </h1>
        <p className="text-sm text-muted-foreground">
          Insira suas credenciais abaixo para acessar a plataforma.
        </p>
      </div>

      <LoginForm />

      <div className="pt-4 text-center text-sm text-muted-foreground border-t border-border/60">
        Não tem uma conta ainda?{" "}
        <Link href="/register" className="font-semibold text-primary hover:underline underline-offset-4">
          Cadastre-se grátis
        </Link>
      </div>
    </div>
  )
}

