import type { Metadata } from "next"

import { UpdatePasswordForm } from "@/features/auth/components/update-password-form"

export const metadata: Metadata = {
  title: "Redefinir Senha — NomeIA",
  description: "Defina uma nova senha para sua conta no NomeIA.",
}

export default function UpdatePasswordPage() {
  return (
    <>
      <div className="flex flex-col space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Redefinir Senha</h1>
        <p className="text-sm text-muted-foreground">
          Escolha uma nova senha para acessar sua conta no NomeIA.
        </p>
      </div>

      <UpdatePasswordForm />
    </>
  )
}
