import type { Page } from "@playwright/test"

import { expect, expectNoHorizontalOverflow, test } from "../support/test"

// G2.21 — matriz de responsividade: 320×480, 375×812, 768×1024 e 1280×800.
// Asserções SEMÂNTICAS (nada estoura a largura, modais cabem, botões
// principais alcançáveis) em vez de comparação de pixels. Emulação de
// navegador: não substitui o teste em aparelho físico.
// Roda só no projeto "desktop" (a matriz já define o tamanho de tela; o
// projeto "mobile" — Pixel 5 — continua rodando todos os outros specs).

const SIZES = [
  { name: "320x480", width: 320, height: 480, mobile: true },
  { name: "375x812", width: 375, height: 812, mobile: true },
  { name: "768x1024", width: 768, height: 1024, mobile: true },
  { name: "1280x800", width: 1280, height: 800, mobile: false },
] as const

/** Botões, campos e links visíveis dentro de `root` não passam das bordas da janela (exceto dentro de áreas com rolagem horizontal própria). */
async function expectControlsInsideViewport(page: Page, root = "body") {
  const offenders = await page.evaluate((sel) => {
    const rootEl = document.querySelector(sel)
    if (!rootEl) return ["raiz não encontrada: " + sel]
    const vw = window.innerWidth
    const out: string[] = []
    for (const el of rootEl.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [role=button], [role=tab]")) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const style = getComputedStyle(el)
      if (style.visibility === "hidden" || style.display === "none") continue
      let scroller = false
      for (let p = el.parentElement; p && p !== rootEl; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX
        if (ox === "auto" || ox === "scroll" || ox === "hidden") { scroller = true; break }
      }
      if (scroller) continue
      if (r.left < -1 || r.right > vw + 1) {
        out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40)}" [${Math.round(r.left)}–${Math.round(r.right)}] > ${vw}`)
      }
    }
    return out
  }, root)
  expect(offenders, "controles fora da largura da tela").toEqual([])
}

/** Modal cabe na janela (largura e altura) e o botão principal é alcançável por rolagem interna. */
async function expectDialogFits(page: Page, primaryButton: RegExp | string) {
  const dialog = page.getByRole("dialog").last()
  await expect(dialog).toBeVisible()
  const box = await dialog.boundingBox()
  const vp = page.viewportSize()
  expect(box).not.toBeNull()
  if (box && vp) {
    expect(box.x, "modal não começa fora da tela").toBeGreaterThanOrEqual(-1)
    expect(box.x + box.width, "modal não passa da largura").toBeLessThanOrEqual(vp.width + 1)
    expect(box.height, "modal não passa da altura").toBeLessThanOrEqual(vp.height + 1)
  }
  const button = dialog.getByRole("button", { name: primaryButton })
  await button.scrollIntoViewIfNeeded()
  await expect(button).toBeInViewport()
  await expectControlsInsideViewport(page, '[role="dialog"]')
}

for (const size of SIZES) {
  test.describe(`responsivo ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, isMobile: size.mobile, hasTouch: size.mobile })
    test.beforeEach(async ({ page }, testInfo) => {
      void page
      test.skip(testInfo.project.name !== "desktop", "a matriz define o tamanho de tela; roda uma vez")
    })

    test("Simulados: página, gráfico, modal de registro e detalhe", async ({ page }) => {
      await page.goto("/e2e-harness/simulados")
      await expect(page.getByText("4 registros")).toBeVisible()
      await expectNoHorizontalOverflow(page)
      await expectControlsInsideViewport(page)
      // Gráfico de evolução não é mais largo que o próprio card.
      const chart = await page.locator("svg[viewBox='0 0 600 160']").evaluate((svg) => {
        const card = svg.closest(".rounded-xl") as HTMLElement
        return { svg: svg.getBoundingClientRect().width, card: card.getBoundingClientRect().width }
      })
      expect(chart.svg).toBeLessThanOrEqual(chart.card)
      await page.getByRole("button", { name: "Registrar simulado" }).click()
      await expectDialogFits(page, "Salvar simulado")
      await page.keyboard.press("Escape")
      await page.getByRole("button", { name: "Análise de 3º Simulado Receita Federal" }).click()
      const detail = page.getByRole("dialog")
      await expect(detail).toBeVisible()
      const box = await detail.boundingBox()
      expect(box && box.x + box.width).toBeLessThanOrEqual(size.width + 1)
      expect(box && box.height).toBeLessThanOrEqual(size.height + 1)
    })

    test("Dashboard: cabeçalho, Foco de hoje e grade sem estouro", async ({ page }) => {
      await page.goto("/e2e-harness/dashboard")
      await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible()
      await page.waitForLoadState("networkidle")
      // A grade chega do servidor com 3 colunas e passa para 1/2/3 conforme a
      // largura assim que hidrata (dashboard-dnd-context.tsx) — espera a troca.
      let expectedColumns = 1
      if (size.width >= 1280) expectedColumns = 3
      else if (size.width >= 768) expectedColumns = 2
      await expect
        .poll(() => page.locator("[data-dashboard-grid]").first().evaluate((el) => el.children.length))
        .toBe(expectedColumns)
      await expectNoHorizontalOverflow(page)
      await expectControlsInsideViewport(page)
      await expect(page.getByRole("button", { name: "Adicionar estudo" })).toBeInViewport()
    })

    test("Central de estudos (modo Manual): modal cabe e 'Salvar estudo' é alcançável", async ({ page }) => {
      await page.goto("/e2e-harness/study-register")
      await page.waitForLoadState("networkidle")
      await page.getByRole("button", { name: "Abrir Central de estudos" }).click()
      await page.getByRole("tab", { name: "Manual" }).click()
      await expectDialogFits(page, "Salvar estudo")
      await expectNoHorizontalOverflow(page)
    })

    test("Mentor, menu da conta e login sem estouro", async ({ page }) => {
      await page.goto("/e2e-harness/mentor?state=valid")
      await expect(page.getByRole("button", { name: "Gerar análise" })).toBeVisible()
      await expectNoHorizontalOverflow(page)
      await expectControlsInsideViewport(page)
      await page.goto("/e2e-harness/account-menu")
      await page.getByRole("button", { name: "Menu do usuário" }).click()
      await expect(page.getByRole("menu")).toBeVisible()
      await expectControlsInsideViewport(page, '[role="menu"]')
      await page.goto("/login")
      await expectNoHorizontalOverflow(page)
      await expectControlsInsideViewport(page)
    })
  })
}
