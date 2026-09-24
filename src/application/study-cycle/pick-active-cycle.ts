import type { CycleOverview } from "@/domain/study-cycle/study-cycle.types"

/**
 * Fase F.1 — ciclo ativo a partir da lista de ciclos já carregada.
 *
 * Mesmo critério de `getActiveCycleAction` / `loadActiveCycleOverview`:
 * status "ACTIVE" e, se houver mais de um, o de `updated_at` mais recente.
 * Como a lista (getCyclesAction) já traz o overview completo de cada ciclo
 * — com as mesmas leituras e o mesmo buildCycleOverview —, a aba Ciclos não
 * precisa ler o ciclo ativo de novo (antes: sessões do ciclo ativo lidas
 * duas vezes em cada abertura e em cada "Atualizar").
 *
 * Função pura, sem dependências de servidor: pode ser usada no navegador.
 */
export function pickActiveCycleOverview(cycles: readonly CycleOverview[]): CycleOverview | null {
  let best: CycleOverview | null = null
  for (const overview of cycles) {
    if (overview.cycle.status !== "ACTIVE") continue
    if (!best || overview.cycle.updated_at > best.cycle.updated_at) best = overview
  }
  return best
}
