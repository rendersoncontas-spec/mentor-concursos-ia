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
        } catch {
          // Em Server Components puros, cookies não podem ser modificados.
          // O Middleware intercepta respostas e atualiza tokens via Set-Cookie.
        }
      },
    },
  })
}
