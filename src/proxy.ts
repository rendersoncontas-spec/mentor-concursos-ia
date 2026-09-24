import { type NextRequest } from "next/server"

import { updateSession } from "@/infrastructure/supabase/proxy"

export async function proxy(request: NextRequest) {
  // Fase F.1: medição do custo do proxy (que chama auth.getUser() em toda
  // requisição, inclusive POSTs de Server Action). Só registra duração e o
  // primeiro segmento da rota — nenhum cookie, token, id ou parâmetro. A
  // autenticação em si NÃO foi alterada.
  if (process.env["NOMEIA_PERF_LOG"] !== "1" && process.env.NODE_ENV !== "development") {
    return await updateSession(request)
  }
  const t0 = performance.now()
  const response = await updateSession(request)
  const segment = request.nextUrl.pathname.split("/")[1] || ""
  // eslint-disable-next-line no-console -- log de métricas (só números), intencional
  console.info(
    `[perf] ${JSON.stringify({
      kind: "proxy",
      route: `/${segment}`,
      serverAction: request.headers.has("next-action"),
      totalMs: Math.round((performance.now() - t0) * 10) / 10,
    })}`,
  )
  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images, etc.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
