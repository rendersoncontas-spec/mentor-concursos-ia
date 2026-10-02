import { NextResponse } from "next/server"

import { env } from "@/config/env"
import { buildSupabaseHealthCheckUrl, isAuthorizedCronRequest } from "@/application/ops/keep-alive"

// Fase F.4 (performance/infra) — mantém o projeto Supabase (plano gratuito)
// ativo, evitando a pausa automática por inatividade que causava a demora
// de ~10s na primeira abertura do app após alguns dias sem uso. Ver
// src/application/ops/keep-alive.ts para o raciocínio completo.
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  const authorizationHeader = request.headers.get("authorization")
  if (!isAuthorizedCronRequest(authorizationHeader, process.env["CRON_SECRET"])) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  try {
    const response = await fetch(buildSupabaseHealthCheckUrl(env.NEXT_PUBLIC_SUPABASE_URL), {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
      cache: "no-store",
    })
    return NextResponse.json({ ok: true, supabaseStatus: response.status })
  } catch {
    // Falha pontual ao contatar o Supabase não deve gerar alerta ruidoso:
    // o cron roda de novo no dia seguinte, bem dentro da janela de 7 dias.
    return NextResponse.json({ ok: false, error: "supabase_unreachable" }, { status: 502 })
  }
}
