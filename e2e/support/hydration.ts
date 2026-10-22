import type { Locator } from "@playwright/test"
import { expect } from "@playwright/test"

/**
 * Espera o React "assumir" o elemento (hidratação). Em modo dev um clique dado
 * antes disso se perde; repetir o clique é perigoso quando a ação NÃO é
 * idempotente (marcar/desmarcar). O React grava `__reactProps$…` no nó DOM ao
 * hidratar, então este é um sinal direto, sem dormir.
 */
export async function whenHydrated(target: Locator, timeout = 15_000): Promise<void> {
  await expect
    .poll(() => target.first().evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps"))), { timeout })
    .toBe(true)
}
