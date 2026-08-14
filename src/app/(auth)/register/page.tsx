import type { Metadata } from "next"
import Link from "next/link"

import { RegisterForm } from "@/features/auth/components/register-form"

export const metadata: Metadata = {
  title: "Cadastro — NomeIA",
  description: "Crie sua conta no NomeIA e organize sua preparação rumo à nomeação.",
}

export default function RegisterPage() {
  return (
    <>
      <div className="flex flex-col space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Crie sua conta</h1>
        <p className="text-sm text-muted-foreground">
          Preencha os dados abaixo para iniciar sua jornada no NomeIA.
        </p>
      </div>

      <RegisterForm />

      <p className="px-8 text-center text-sm text-muted-foreground">
        <Link href="/login" className="hover:text-brand underline underline-offset-4">
          Já tem uma conta? Faça login
        </Link>
      </p>
    </>
  )
}
