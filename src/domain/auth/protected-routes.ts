/**
 * Lista canonica de rotas protegidas (exigem sessao autenticada).
 *
 * Extraida de src/infrastructure/supabase/proxy.ts para ser testavel sem
 * precisar simular NextRequest/Supabase - e so uma checagem de prefixo.
 *
 * Historico: em 2026-09, um QA funcional encontrou que /assinatura,
 * /ciclos, /disciplines, /doacao, /edital, /pedidos-editais e /study-plan existiam
 * como rotas reais em paginas dentro de src/app/(protected)/ mas nao estavam
 * nesta lista - ou seja, o middleware nao redirecionava usuario anonimo
 * para /login nessas paginas (o impacto real era baixo, porque as
 * server actions por tras de cada uma ja validam auth.getUser() e
 * devolvem "nao autenticado" sem vazar dado de outro usuario, mas a
 * pagina em si nao deveria ficar acessivel sem sessao). Ao adicionar uma
 * nova rota em src/app/(protected)/, adicione o prefixo aqui tambem -
 * o teste protected-routes.test.ts falha propositalmente se um caminho
 * conhecido do app nao estiver coberto.
 */
export const PROTECTED_ROUTE_PREFIXES = [
  "/dashboard",
  "/profile",
  "/planejamento",
  "/onboarding",
  "/estudos",
  "/revisoes",
  "/historico",
  "/estatisticas",
  "/concursos",
  "/simulados",
  "/biblioteca",
  "/comunidade",
  "/ranking",
  "/conquistas",
  "/notas",
  "/planos",
  "/admin",
  "/assinatura",
  "/ciclos",
  "/disciplines",
  "/doacao",
  "/edital",
  "/pedidos-editais",
  "/study-plan",
] as const

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}
