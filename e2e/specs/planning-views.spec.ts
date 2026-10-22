import type { Page } from "@playwright/test"

import { expectNoAxeViolations } from "../support/axe"
import { expect, expectNoHorizontalOverflow, test, unexpected } from "../support/test"

// G2.24 — Planejamento: visões Dia e Semana com dados DETERMINÍSTICOS.
// Harness `/e2e-harness/planning` (PlanningView real; leituras sintéticas pela
// fronteira PlanningActionsProvider). Para não depender do dia da semana nem de
// escala de plantão, cada teste fixa "escala normal + estudo todos os dias".

const PLANNING = "/e2e-harness/planning"
const UNAVAILABLE = /Não foi possível atualizar o cronograma/

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("mentor_user_work_scale", "normal")
      localStorage.setItem("mentor_user_study_days", JSON.stringify(["dom", "seg", "ter", "qua", "qui", "sex", "sab"]))
      localStorage.removeItem("mentor_replan_info_cache")
    } catch {
      /* sem localStorage: a tela usa os padrões */
    }
  })
})

async function openView(page: Page, view: "Dia" | "Semana", state = "data") {
  await page.goto(`${PLANNING}?state=${state}`)
  const tablist = page.getByRole("tablist", { name: "Visões do planejamento" })
  await tablist.getByRole("tab", { name: view }).click()
  await expect(tablist.getByRole("tab", { name: view })).toHaveAttribute("aria-selected", "true")
  const panel = page.getByRole("tabpanel")
  await expect(panel).toBeVisible()
  return panel
}

/** Espera o carregamento das leituras sintéticas (≈120 ms) e os avisos de toast. */
async function settle(page: Page) {
  await page.waitForTimeout(600)
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 15_000 })
}

const saveSessionEvent = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event("study-session-saved")))

test.describe("Planejamento · Dia", () => {
  test("carregado: blocos do dia vêm da janela de replanejamento, sem aviso de erro", async ({ page }) => {
    const panel = await openView(page, "Dia")
    await expect(panel.getByText("Língua Portuguesa").first()).toBeVisible()
    await expect(panel.getByText("Contabilidade Geral").first()).toBeVisible()
    await expect(panel.getByText(UNAVAILABLE)).toHaveCount(0)
  })

  test("erro de leitura: aviso anunciável, e a tela segue utilizável (≠ 'sem planejamento')", async ({ page }) => {
    const panel = await openView(page, "Dia", "error")
    const notice = panel.getByRole("status").filter({ hasText: UNAVAILABLE })
    await expect(notice).toBeVisible()
    await expect(panel.getByRole("heading", { level: 2 }).first()).toBeVisible()
    await expect(page.getByText("Nenhum planejamento criado")).toHaveCount(0)
  })

  test("nova leitura (sessão salva) depois de falha: o aviso some e os blocos aparecem", async ({ page }) => {
    const panel = await openView(page, "Dia", "retry")
    await expect(panel.getByRole("status").filter({ hasText: UNAVAILABLE })).toBeVisible()
    await saveSessionEvent(page)
    await expect(panel.getByRole("status").filter({ hasText: UNAVAILABLE })).toHaveCount(0)
    await expect(panel.getByText("Língua Portuguesa").first()).toBeVisible()
  })
})

test.describe("Planejamento · Semana", () => {
  test("carregada: 7 dias, hoje destacado e blocos das disciplinas", async ({ page }) => {
    const panel = await openView(page, "Semana")
    await expect(panel.getByText("Língua Portuguesa").first()).toBeVisible()
    await expect(panel.getByText(UNAVAILABLE)).toHaveCount(0)
    await expect(panel.getByText(/Status da Meta Diária/)).toBeVisible()
  })

  test("erro de leitura: aviso anunciável e página segue", async ({ page }) => {
    const panel = await openView(page, "Semana", "error")
    await expect(panel.getByRole("status").filter({ hasText: UNAVAILABLE })).toBeVisible()
    await expect(panel.getByText(/Status da Meta Diária/)).toBeVisible()
  })

  test("nova leitura depois de falha: aviso some", async ({ page }) => {
    const panel = await openView(page, "Semana", "retry")
    await expect(panel.getByRole("status").filter({ hasText: UNAVAILABLE })).toBeVisible()
    await saveSessionEvent(page)
    await expect(panel.getByRole("status").filter({ hasText: UNAVAILABLE })).toHaveCount(0)
  })
})

for (const scheme of ["light", "dark"] as const) {
  test.describe(`Planejamento · axe (${scheme})`, () => {
    test.use({ colorScheme: scheme })

    for (const view of ["Dia", "Semana"] as const) {
      test(`${view}: carregado e com erro de leitura`, async ({ page }) => {
        await openView(page, view)
        await settle(page)
        await expect(page.getByRole("tabpanel").getByText("Língua Portuguesa").first()).toBeVisible()
        await expectNoAxeViolations(page)
        await openView(page, view, "error")
        await settle(page)
        await expect(page.getByRole("tabpanel").getByText(UNAVAILABLE)).toBeVisible()
        await expectNoAxeViolations(page)
      })
    }
  })
}

const SIZES = [
  { name: "320x480", width: 320, height: 480 },
  { name: "375x812", width: 375, height: 812 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1280x800", width: 1280, height: 800 },
] as const

for (const size of SIZES) {
  for (const view of ["Dia", "Semana"] as const) {
    test(`${view} em ${size.name}: sem overflow horizontal`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "a matriz define o tamanho de tela; roda uma vez")
      await page.setViewportSize({ width: size.width, height: size.height })
      const panel = await openView(page, view)
      await expect(panel.getByText("Língua Portuguesa").first()).toBeVisible()
      await settle(page)
      await expectNoHorizontalOverflow(page)
    })
  }
}

test("sem erros inesperados de página nas visões Dia e Semana", async ({ page, pageErrors }) => {
  await openView(page, "Dia")
  await settle(page)
  await openView(page, "Semana")
  await settle(page)
  expect(unexpected(pageErrors)).toEqual([])
})
