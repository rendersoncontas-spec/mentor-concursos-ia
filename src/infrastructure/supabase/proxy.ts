import { type NextRequest, NextResponse } from "next/server"

import { createServerClient } from "@supabase/ssr"

import { env } from "@/config/env"

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options)
          })
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  const isAuthRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password")

  const isProtectedRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/planejamento") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/estudos") ||
    pathname.startsWith("/revisoes") ||
    pathname.startsWith("/historico") ||
    pathname.startsWith("/estatisticas") ||
    pathname.startsWith("/concursos") ||
    pathname.startsWith("/simulados") ||
    pathname.startsWith("/biblioteca") ||
    pathname.startsWith("/comunidade") ||
    pathname.startsWith("/ranking") ||
    pathname.startsWith("/conquistas") ||
    pathname.startsWith("/notas") ||
    pathname.startsWith("/planos")

  if (isProtectedRoute && !user) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = "/login"
    redirectUrl.searchParams.set("redirectedFrom", pathname)
    return NextResponse.redirect(redirectUrl)
  }

  if (user && isAuthRoute) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = "/dashboard"
    return NextResponse.redirect(redirectUrl)
  }

  return supabaseResponse
}
