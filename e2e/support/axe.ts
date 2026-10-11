import AxeBuilder from "@axe-core/playwright"
import type { Page } from "@playwright/test"

import { expect } from "./test"

/**
 * G2.21 — verificação automática de acessibilidade (axe-core) nas páginas de
 * harness. Regras WCAG 2.0/2.1 nível A e AA.
 *
 * IMPORTANTE: zero violações aqui NÃO prova acessibilidade completa — o axe
 * detecta só parte dos problemas (nome acessível, contraste, ARIA inválido,
 * rótulos...). Teclado, foco, ordem de leitura e clareza do texto são
 * verificados nos testes de teclado/foco e na validação manual.
 *
 * Exceções: só com justificativa, listadas em `AXE_EXCEPTIONS` e no relatório
 * docs/g2-21-e2e-accessibility-report.md. Nenhuma regra é desligada em silêncio.
 */
export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]

export interface AxeException {
  rule: string
  /** Seletor CSS dos elementos excluídos daquela regra (nunca a página inteira). */
  selector?: string
  reason: string
}

/** Exceções globais justificadas (mantidas em sincronia com o relatório G2.21). */
export const AXE_EXCEPTIONS: AxeException[] = []

export async function expectNoAxeViolations(
  page: Page,
  options: { include?: string; exclude?: string[]; exceptions?: AxeException[] } = {},
) {
  // Espera transições/animações FINITAS terminarem (ex.: toast entrando com
  // fade): no meio do fade a cor é uma mistura e o contraste medido é falso.
  // Animações infinitas (spinners) são ignoradas.
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity)
    await Promise.race([
      Promise.all(finite.map((a) => a.finished.catch(() => undefined))),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ])
  })
  let builder = new AxeBuilder({ page }).withTags(AXE_TAGS)
  if (options.include) builder = builder.include(options.include)
  for (const sel of options.exclude ?? []) builder = builder.exclude(sel)
  const exceptions = [...AXE_EXCEPTIONS, ...(options.exceptions ?? [])]
  const disabledWholeRule = exceptions.filter((e) => !e.selector).map((e) => e.rule)
  if (disabledWholeRule.length > 0) builder = builder.disableRules(disabledWholeRule)
  const results = await builder.analyze()
  const violations = results.violations
    .map((v) => ({
      ...v,
      nodes: v.nodes.filter(
        (n) => !exceptions.some((e) => e.rule === v.id && e.selector && n.target.join(" ").includes(e.selector)),
      ),
    }))
    .filter((v) => v.nodes.length > 0)
  const summary = violations.map(
    (v) => `${v.id} [${v.impact}] ${v.help}\n${v.nodes
      .slice(0, 5)
      .map((n) => `   - ${n.target.join(" ")} :: ${n.failureSummary?.split("\n").slice(0, 3).join(" | ")}`)
      .join("\n")}`,
  )
  expect(summary, `violações axe (WCAG A/AA):\n${summary.join("\n")}`).toEqual([])
  return results
}
