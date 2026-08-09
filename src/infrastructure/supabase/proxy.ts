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
          cookiesToSet.forEach(({ name, value, options: _options }) => {
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

  // Atualiza a sessão e obtém o usuário
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/register") ||
    request.nextUrl.pathname.startsWith("/forgot-password")

  const isProtectedRoute =
    request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/profile") ||
    request.nextUrl.pathname.startsWith("/planejamento")
    
  const isOnboardingRoute = request.nextUrl.pathname.startsWith("/onboarding")

  // Se não estiver logado e tentar rota protegida ou onboarding
  if ((isProtectedRoute || isOnboardingRoute) && !user) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = "/login"
    redirectUrl.searchParams.set("redirectedFrom", request.nextUrl.pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // Se estiver logado
  if (user) {
    // Redirecionar auth para dashboard
    if (isAuthRoute) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = "/dashboard"
      return NextResponse.redirect(redirectUrl)
    }

      // Checagem de Novo Planejamento
      // Em vez de onboarding_completed, verificamos se existe algum plano ativo
      const { data: activePlan } = await supabase
        .from("study_plans")
        .select("id")
        .eq("user_id", user.id)
        .eq("active", true)
        .single()

      const hasActivePlan = !!activePlan

      // Se não possui plano e tenta acessar dashboard, manda pro novo /planejamento
      if (!hasActivePlan && isProtectedRoute) {
        const redirectUrl = request.nextUrl.clone()
        redirectUrl.pathname = "/planejamento"
        return NextResponse.redirect(redirectUrl)
      }

      // Se já possui plano e tenta acessar planejamento (wizard), manda pro dashboard
      if (hasActivePlan && request.nextUrl.pathname.startsWith("/planejamento")) {
        const redirectUrl = request.nextUrl.clone()
        redirectUrl.pathname = "/dashboard"
        return NextResponse.redirect(redirectUrl)
      }
  }

  return supabaseResponse
}
