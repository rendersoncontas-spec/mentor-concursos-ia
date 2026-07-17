import type { Metadata } from "next"
import Link from "next/link"

import { LoginForm } from "@/features/auth/components/login-form"

export const metadata: Metadata = {
  title: "Login",
  description: "Acesse sua conta no Mentor Concursos IA.",
}

export default function LoginPage() {
  return (
    <>
      <div className="flex flex-col space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Bem-vindo de volta</h1>
        <p className="text-sm text-muted-foreground">
          Insira seu e-mail e senha para acessar sua conta.
        </p>
      </div>

      <LoginForm />

      <p className="px-8 text-center text-sm text-muted-foreground">
        <Link href="/register" className="hover:text-brand underline underline-offset-4">
          Não tem uma conta? Cadastre-se
        </Link>
      </p>
      <p className="px-8 text-center text-sm text-muted-foreground">
        <Link href="/forgot-password" className="hover:text-brand underline underline-offset-4">
          Esqueceu sua senha?
        </Link>
      </p>
    </>
  )
}
