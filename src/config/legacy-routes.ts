/**
 * Fase G.1 — rotas antigas do Dashboard que foram substituídas.
 *
 * Aplicadas em `next.config.ts` (`redirects()`), que o Next avalia ANTES do
 * proxy de autenticação e antes de renderizar qualquer página: a rota antiga
 * não roda mais nenhuma consulta. Quem não está logado segue para o destino e
 * o proxy manda para /login normalmente.
 *
 * `permanent: false` (HTTP 307) de propósito: são rotas internas autenticadas
 * (sem SEO a preservar) e um 308 fica gravado no cache do navegador por tempo
 * indeterminado — se algum desses caminhos voltar a ser usado (ex.: um módulo
 * de questões de verdade em /dashboard/questions), um 307 não prende ninguém
 * no redirect antigo.
 *
 * Sem imports: este arquivo é carregado pelo `next.config.ts`.
 *
 * Mantidas (não estão aqui): /dashboard/adaptive (histórico do motor
 * adaptativo, sem substituta) e /dashboard/mentor (feed do Mentor IA).
 */
export interface LegacyRouteRedirect {
  source: string
  destination: string
  permanent: false
}

export const LEGACY_ROUTE_REDIRECTS: readonly LegacyRouteRedirect[] = [
  // Estatísticas antigas: 4 números que /estatisticas já mostra + gráficos
  // com dados fixos de exemplo (distribuição por categoria e horas por dia da
  // semana) ou sempre vazios (linha de acertos).
  { source: "/dashboard/analytics", destination: "/estatisticas", permanent: false },
  // Radar/acertos por disciplina a partir de question_attempts — a mesma
  // fonte que /estatisticas já usa (Desempenho, Mapa de erros, Desempenho
  // por disciplina) — e um alerta "Assunto Crítico" com texto fixo.
  { source: "/dashboard/performance", destination: "/estatisticas", permanent: false },
  // Casca "em construção" sem funcionalidade; os números de questões vivem
  // em /estatisticas.
  { source: "/dashboard/questions", destination: "/estatisticas", permanent: false },
]
