import { notFound, redirect } from "next/navigation"

import { ShieldCheck } from "lucide-react"

import { checkHomologationAccess } from "@/application/testing/homologation-access"
import { HomologationPanel } from "@/features/testing/components/homologation-panel"
import { createClient } from "@/infrastructure/supabase/server"

export const metadata = {
  title: "Homologação",
  description: "Painel de homologação e testes do NomeIA.",
}

export default async function HomologationPage() {
  const supabase = await createClient()
  const access = await checkHomologationAccess(supabase)

  if (!access.allowed) {
    if (access.reason === "UNAUTHENTICATED") redirect("/login")
    // Fase G.1: ferramenta interna, só administradores. Para os demais a rota
    // responde 404 — não revela que a ferramenta existe. As Server Actions
    // têm a mesma checagem (homologation.actions.ts).
    notFound()
  }

  return (
    <div className="space-y-8 w-full max-w-full p-4 sm:p-6 pb-12">
      <div className="flex items-center gap-3 bg-amber-500/10 text-amber-500 border border-amber-500/20 p-4 rounded-xl">
        <ShieldCheck className="w-8 h-8 shrink-0" />
        <div>
          <h1 className="text-xl font-semibold">Ambiente de Homologação (Sprint H1)</h1>
          <p className="text-sm">
            Esta área é restrita para testes de integração de ponta a ponta. Não execute testes
            concorrentes na mesma conta.
          </p>
        </div>
      </div>

      <HomologationPanel />
    </div>
  )
}
