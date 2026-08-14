import type { Metadata } from "next"
import Link from "next/link"

import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form"

export const metadata: Metadata = {
  title: "Recuperar Senha — NomeIA",
  description: "Recupere o acesso à sua conta no NomeIA.",
}

export default function ForgotPasswordPage() {
  return (
    <>
      <div className="flex flex-col space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Recuperar Senha</h1>
        <p className="text-sm text-muted-foreground">
          Digite seu e-mail para receber um link de redefinição de senha no NomeIA.
        </p>
      </div>

      <ForgotPasswordForm />

      <p className="px-8 text-center text-sm text-muted-foreground">
        <Link href="/login" className="hover:text-brand underline underline-offset-4">
          Lembrou a senha? Faça login
        </Link>
      </p>
    </>
  )
}
