import type { Page } from "@playwright/test"

import { expect, test } from "../support/test"

// G2.22 — regressão do "flash de 3 colunas" do Dashboard no celular.
//
// Causa (G2.21/G2.22): a grade só descobre a largura da tela com JS
// (matchMedia em dashboard-dnd-context.tsx). O HTML do servidor — e a primeira
// renderização do cliente — usa a estrutura de desktop (3 colunas), e o
// celular a pintava assim até a hidratação terminar.
//
// Como observar o "antes da hidratação" de forma determinística: bloqueamos os
// bundles JS do Next (/_next/static/**.js). O HTML e os scripts inline do
// streaming continuam rodando (o conteúdo do Suspense aparece), mas o React
// nunca hidrata — é exatamente o que o usuário vê nos primeiros instantes.
// Depois carregamos normalmente e comparamos: mesma quantidade de colunas e
// mesma distribuição dos cards antes e depois.

type Layout = { columns: number; perColumn: string[][] }

async function readLayout(page: Page): Promise<Layout> {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('[aria-roledescription="sortable"]')]
      .map((h) => h.parentElement as HTMLElement)
      .map((c) => {
        const r = c.getBoundingClientRect()
        return { x: Math.round(r.left), y: Math.round(r.top), title: (c.innerText.split("\n")[0] ?? "").trim() }
      })
    const xs = [...new Set(cards.map((c) => c.x))].sort((a, b) => a - b)
    return {
      columns: xs.length,
      perColumn: xs.map((x) => cards.filter((c) => c.x === x).sort((a, b) => a.y - b.y).map((c) => c.title)),
    }
  })
}

const SIZES = [
  { width: 320, height: 480, mobile: true, columns: 1 },
  { width: 375, height: 812, mobile: true, columns: 1 },
  { width: 768, height: 1024, mobile: true, columns: 2 },
  { width: 1280, height: 800, mobile: false, columns: 3 },
] as const

for (const size of SIZES) {
  test.describe(`Dashboard ${size.width}px — sem troca de colunas na hidratação`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, isMobile: size.mobile, hasTouch: size.mobile })
    test.beforeEach(async ({ page }, testInfo) => {
      void page
      test.skip(testInfo.project.name !== "desktop", "o tamanho de tela vem do próprio teste; roda uma vez")
    })

    test(`antes e depois da hidratação: ${size.columns} coluna(s), mesma distribuição`, async ({ page, consoleErrors }) => {
      // 1) Antes da hidratação (bundles JS bloqueados).
      await page.route(/\/_next\/static\/.*\.js(\?.*)?$/, (route) => route.abort())
      await page.goto("/e2e-harness/dashboard")
      await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible()
      await expect(page.locator('[aria-roledescription="sortable"]').first()).toBeVisible()
      const before = await readLayout(page)
      expect(before.columns, "colunas no primeiro desenho (antes do JS)").toBe(size.columns)
      await page.unroute(/\/_next\/static\/.*\.js(\?.*)?$/)

      // 2) Carregamento normal, depois da hidratação.
      await page.goto("/e2e-harness/dashboard")
      await expect(page.locator('[id^="DndDescribedBy-"]').first()).toBeAttached()
      await page.waitForLoadState("networkidle")
      const after = await readLayout(page)
      expect(after.columns, "colunas depois da hidratação").toBe(size.columns)
      expect(after.perColumn, "cada card na mesma coluna e na mesma ordem").toEqual(before.perColumn)
      expect(consoleErrors.filter((e) => /hydrat/i.test(e)), "sem erro de hidratação").toEqual([])
    })
  })
}
