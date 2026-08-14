import { redirect } from "next/navigation"

import { ShieldCheck } from "lucide-react"

import { HomologationPanel } from "@/features/testing/components/homologation-panel"
import { createClient } from "@/infrastructure/supabase/server"

export const metadata = {
  title: "Homologação",
  description: "Painel de homologação e testes do NomeIA.",
}

export default async function HomologationPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-12">
      <div className="flex items-center gap-3 bg-amber-500/10 text-amber-500 border border-amber-500/20 p-4 rounded-xl">
        <ShieldCheck className="w-8 h-8 shrink-0" />
        <div>
          <h1 className="text-xl font-bold">Ambiente de Homologação (Sprint H1)</h1>
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
