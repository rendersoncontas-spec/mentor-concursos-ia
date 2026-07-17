import { LogoutButton } from "@/features/auth/components/logout-button"
import { createClient } from "@/infrastructure/supabase/server"

export default async function ProfilePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="container py-10 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Meu Perfil</h1>

      <div className="border rounded-lg p-6 space-y-4 shadow-sm bg-card">
        <div>
          <p className="text-sm text-muted-foreground font-medium">E-mail</p>
          <p className="text-lg">{user?.email}</p>
        </div>

        <div>
          <p className="text-sm text-muted-foreground font-medium">Data de Cadastro</p>
          <p className="text-md">
            {user?.created_at
              ? new Date(user.created_at).toLocaleDateString("pt-BR")
              : "Desconhecida"}
          </p>
        </div>

        <div className="pt-4 border-t">
          <LogoutButton />
        </div>
      </div>
    </div>
  )
}
