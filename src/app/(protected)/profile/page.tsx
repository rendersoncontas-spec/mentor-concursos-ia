import { LogoutButton } from "@/features/auth/components/logout-button"
import { getEffectiveSessionUser } from "@/application/admin/auth-guard"
import { createClient } from "@/infrastructure/supabase/server"

export default async function ProfilePage() {
  const supabase = await createClient()

  const effectiveUser = await getEffectiveSessionUser(supabase)

  return (
    <div className="container py-10 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Meu Perfil</h1>

      <div className="border rounded-lg p-6 space-y-4 shadow-sm bg-card">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Nome</p>
          <p className="text-lg">{effectiveUser?.name}</p>
        </div>

        <div>
          <p className="text-sm text-muted-foreground font-medium">E-mail</p>
          <p className="text-lg">{effectiveUser?.email}</p>
        </div>

        <div>
          <p className="text-sm text-muted-foreground font-medium">Status</p>
          <p className="text-md capitalize">
            {effectiveUser?.role === "admin" ? "Administrador" : effectiveUser?.role === "moderator" ? "Moderador" : "Estudante"}
          </p>
        </div>

        <div className="pt-4 border-t">
          <LogoutButton />
        </div>
      </div>
    </div>
  )
}
