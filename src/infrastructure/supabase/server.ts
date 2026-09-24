import { cache } from "react"

import { cookies } from "next/headers"

import { createServerClient } from "@supabase/ssr"

import { env } from "@/config/env"

/**
 * Fase F (performance) — um único client Supabase por requisição de render.
 *
 * `cache()` do React memoriza por requisição de Server Components: layout,
 * página e loaders chamados na mesma renderização passam a receber a MESMA
 * instância. Isso é o que permite a `getEffectiveSessionUser` (também
 * memorizada, por instância) não repetir `auth.getUser()` + consultas de
 * papel/perfil várias vezes por navegação. Fora do render de Server
 * Components (Route Handlers e Server Actions), `cache()` apenas repassa a
 * chamada — cada chamada continua criando um client novo, como antes.
 */
export const createClient = cache(async function createClient() {
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
        } catch {
          // Em Server Components puros, cookies não podem ser modificados.
          // O Middleware intercepta respostas e atualiza tokens via Set-Cookie.
        }
      },
    },
  })
})
