// Rotas revalidadas após qualquer mutação de study_history (criar, editar,
// excluir ou finalizar uma sessão manual, ou finalizar uma revisão que
// também grava study_history — ver finalizeReviewSessionAction em
// review.actions.ts). Fonte única evita o bug que existia antes: duas
// listas hardcoded que divergiam entre si (IMPORT_REVALIDATE_PATHS tinha
// /dashboard/analytics, esta não tinha).
//
// Deliberadamente SEM "use server": este arquivo foi extraído de
// study-history.actions.ts porque um arquivo "use server" só pode exportar
// funções async — exportar este array diretamente dali quebrava o build em
// runtime ("A \"use server\" file can only export async functions, found
// object"), erro real reproduzido em produção: toda Server Action da rota
// /dashboard passou a responder 500 em loop (Fast Refresh reconstruindo
// repetidamente), deixando o widget de Ciclo e a aba Ciclos sem carregar e
// o site inteiro lento. Não mover este array de volta para dentro de um
// arquivo "use server".
export const HISTORY_PATHS = [
  "/dashboard",
  "/dashboard/history",
  // Fase G.1: /dashboard/analytics saiu desta lista — a rota agora
  // redireciona para /estatisticas (src/config/legacy-routes.ts), que já
  // está aqui. Revalidar um redirect não atualiza nada.
  "/estatisticas",
  "/disciplines",
  "/planejamento",
  "/ciclos",
]
