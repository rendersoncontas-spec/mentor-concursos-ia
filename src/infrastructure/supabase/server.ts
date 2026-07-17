import { cookies } from "next/headers"

import { createServerClient } from "@supabase/ssr"

import { env } from "@/config/env"

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch (error) {
          // Este catch previne erro ao chamar setAll em Server Components puros,
          // onde os cookies não podem ser modificados após a resposta iniciar.
          // O Middleware lidará com atualizações de token de qualquer forma.
          console.error("Falha ao configurar cookie no server client:", error)
        }
      },
    },
  })
}
