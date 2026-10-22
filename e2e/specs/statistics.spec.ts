import type { Page } from "@playwright/test"

import { expectNoAxeViolations } from "../support/axe"
import { expect, expectNoHorizontalOverflow, test, unexpected } from "../support/test"

// G2.24 — Central de Estatísticas (StatisticsCenterView REAL) com payload
// SINTÉTICO. Harness `/e2e-harness/statistics`. Estados: data, empty, partial
// (leituras que falharam ≠ zero), error e retry.

const STATS = "/e2e-harness/statistics"

async function open(page: Page, state = "data") {
  await page.goto(`${STATS}?state=${state}`)
}

/** Qualquer aviso de falha de leitura (o anunciador de rotas do Next também é role=alert, sem texto). */
const failureAlert = (page: Page) => page.getByRole("alert").filter({ hasText: "Não foi possível" })
const UNAVAILABLE_MESSAGES = /Questões indisponíveis|Erros indisponíveis|Não foi possível carregar|Plano indisponível|Edital indisponível/

const sessionsCounter = (page: Page) => page.getByText(/\d+ sessões? no período/)

test.describe("Estatísticas — estados", () => {
  test("carregado: seções principais, sem aviso de indisponível", async ({ page }) => {
    await open(page)
    await expect(page.getByText("Hoje, semana, mês e janelas", { exact: false })).toBeVisible()
    await expect(page.getByText("Desempenho por disciplina")).toBeVisible()
    await expect(page.getByRole("button", { name: /Língua Portuguesa: .*ver detalhes/ }).first()).toBeVisible()
    await expect(page.getByText(UNAVAILABLE_MESSAGES)).toHaveCount(0)
    await expect(page.getByText("Nenhum estudo registrado no período")).toHaveCount(0)
    await expect(sessionsCounter(page)).toBeVisible()
  })

  test("vazio: diz que não há estudo e mostra a ação de registrar", async ({ page }) => {
    await open(page, "empty")
    await expect(page.getByText("Nenhum estudo registrado no período")).toBeVisible()
    await expect(page.getByRole("link", { name: "Registrar sessão" })).toBeVisible()
    await expect(page.getByText("0 sessões no período")).toBeVisible()
    await expect(page.getByText(UNAVAILABLE_MESSAGES)).toHaveCount(0)
  })

  test("leituras que falharam NÃO viram zero: cada seção diz 'indisponível' e o motivo", async ({ page }) => {
    await open(page, "partial")
    await expect(page.getByText("Questões indisponíveis")).toBeVisible()
    await expect(page.getByText("Não foi possível carregar as revisões")).toBeVisible()
    await expect(page.getByText("Plano indisponível")).toBeVisible()
    await expect(page.getByText("Edital indisponível")).toBeVisible()
    // as sessões carregaram: o resto da tela continua útil
    await expect(page.getByText("Hoje, semana, mês e janelas", { exact: false })).toBeVisible()
    // e nenhum vazio "de verdade" aparece no lugar da falha
    await expect(page.getByText("Sem revisões", { exact: true })).toHaveCount(0)
    await expect(page.getByText("Sem edital", { exact: true })).toHaveCount(0)
    await expect(page.getByText("Sem questões", { exact: true })).toHaveCount(0)
  })

  test("erro total: painel anunciável com 'Tentar novamente'", async ({ page }) => {
    await open(page, "error")
    const alert = page.getByRole("alert").filter({ hasText: "Não foi possível carregar suas estatísticas" })
    await expect(alert).toBeVisible()
    await expect(alert.getByRole("button", { name: "Tentar novamente" })).toBeEnabled()
    await expect(page.getByText("Desempenho por disciplina")).toHaveCount(0)
  })

  test("nova tentativa: depois da falha inicial, 'Tentar novamente' carrega os dados", async ({ page }) => {
    await open(page, "retry")
    const alert = page.getByRole("alert").filter({ hasText: "Não foi possível carregar suas estatísticas" })
    await expect(alert).toBeVisible()
    await alert.getByRole("button", { name: "Tentar novamente" }).click()
    await expect(alert).toHaveCount(0)
    await expect(page.getByText("Desempenho por disciplina")).toBeVisible()
  })
})

test.describe("Estatísticas — filtros e ações", () => {
  test("período: '7 dias' reduz as sessões e marca o botão (aria-pressed)", async ({ page }) => {
    await open(page)
    const all = await sessionsCounter(page).innerText()
    const seven = page.getByRole("button", { name: "7 dias", exact: true })
    await seven.click()
    await expect(seven).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByRole("button", { name: "Tudo", exact: true })).toHaveAttribute("aria-pressed", "false")
    await expect(sessionsCounter(page)).not.toHaveText(all)
  })

  test("disciplina: filtrar por uma disciplina muda o total e 'Todas' restaura", async ({ page }) => {
    await open(page)
    const total = await sessionsCounter(page).innerText()
    const select = page.locator("label").filter({ hasText: /^Disciplina/ }).locator("select")
    await select.selectOption({ label: "Contabilidade Geral" })
    await expect(sessionsCounter(page)).not.toHaveText(total)
    await select.selectOption({ label: "Todas" })
    await expect(sessionsCounter(page)).toHaveText(total)
  })

  test("'Atualizar' relê sem esconder a tela e sem erro", async ({ page }) => {
    await open(page)
    await page.getByRole("button", { name: "Atualizar" }).click()
    await expect(page.getByText("Desempenho por disciplina")).toBeVisible()
    await expect(failureAlert(page)).toHaveCount(0)
  })

  test("detalhe da disciplina: o botão expande com aria-expanded", async ({ page }) => {
    await open(page)
    const toggle = page.getByRole("button", { name: /Língua Portuguesa: .*ver detalhes/ }).first()
    await expect(toggle).toHaveAttribute("aria-expanded", "false")
    await toggle.click()
    await expect(toggle).toHaveAttribute("aria-expanded", "true")
  })
})

for (const scheme of ["light", "dark"] as const) {
  test.describe(`Estatísticas — axe (${scheme})`, () => {
    test.use({ colorScheme: scheme })

    for (const state of ["data", "empty", "partial", "error"] as const) {
      test(`estado ${state}`, async ({ page }) => {
        await open(page, state)
        if (state === "error") await expect(failureAlert(page)).toBeVisible()
        else await expect(page.getByText("Hoje, semana, mês e janelas", { exact: false })).toBeVisible()
        await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 15_000 })
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
  test(`dados e vazio em ${size.name}: sem overflow horizontal da página`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "a matriz define o tamanho de tela; roda uma vez")
    await page.setViewportSize({ width: size.width, height: size.height })
    for (const state of ["data", "partial", "empty"]) {
      await open(page, state)
      await expect(page.getByText("Hoje, semana, mês e janelas", { exact: false })).toBeVisible()
      await expectNoHorizontalOverflow(page)
    }
  })
}

test("sem erros inesperados de página (dados, parcial, erro e nova tentativa)", async ({ page, pageErrors }) => {
  for (const state of ["data", "partial", "empty", "error"]) {
    await open(page, state)
    await page.waitForTimeout(500)
  }
  await open(page, "retry")
  await page.getByRole("button", { name: "Tentar novamente" }).click()
  await expect(page.getByText("Desempenho por disciplina")).toBeVisible()
  expect(unexpected(pageErrors)).toEqual([])
})
