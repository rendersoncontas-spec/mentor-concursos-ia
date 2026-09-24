import { UserRound } from "lucide-react"

import { PageHeader } from "@/components/ui/page-header"
import { LogoutButton } from "@/features/auth/components/logout-button"
import { getEffectiveSessionUser } from "@/application/admin/auth-guard"
import { createClient } from "@/infrastructure/supabase/server"

export default async function ProfilePage() {
  const supabase = await createClient()

  const effectiveUser = await getEffectiveSessionUser(supabase)

  const ROLE_LABELS: Record<string, string> = { admin: "Administrador", moderator: "Moderador" }
  const roleLabel = ROLE_LABELS[effectiveUser?.role ?? ""] ?? "Estudante"

  // Fase E — mesmo cabeçalho e container das outras páginas (antes: caixa de
  // 672px presa à esquerda, com H1 próprio e textos em 18px).
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader icon={UserRound} title="Perfil" description="Dados da sua conta" />

      <div className="flex-1 page-container py-5">
        <section aria-label="Dados da conta" className="rounded-lg border border-border bg-card">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 p-5 sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Nome</dt>
              <dd className="mt-0.5 truncate text-sm font-medium text-foreground">{effectiveUser?.name}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">E-mail</dt>
              <dd className="mt-0.5 truncate text-sm text-foreground">{effectiveUser?.email}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Perfil de acesso</dt>
              <dd className="mt-0.5 text-sm text-foreground">{roleLabel}</dd>
            </div>
          </dl>
          <div className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] text-muted-foreground">
              Preferências, metas e dados pessoais ficam em “Minha conta”, no menu do avatar.
            </p>
            <LogoutButton />
          </div>
        </section>
      </div>
    </div>
  )
}
