import { redirect } from "next/navigation"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { env } from "@/config/env"
import { MentorAIService } from "@/application/mentor-ai/mentor-ai.service"
import { MentorFeed } from "@/features/mentor-ai/components/mentor-feed"

export const metadata = {
  title: "Mentor IA | Mentor Concursos",
  description: "Seu copiloto de estudos",
}

export default async function MentorPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignore in server components
          }
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Gera a sessão heurística
  const mentorResponse = await MentorAIService.generateMentorSession(supabase, user.id)

  return (
    <main className="p-4 sm:p-6 lg:p-8 min-h-screen bg-gray-50/50">
      <MentorFeed response={mentorResponse} />
    </main>
  )
}
