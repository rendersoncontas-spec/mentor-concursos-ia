import type { Page } from "@playwright/test"

import { expectNoAxeViolations } from "../support/axe"
import { expect, expectNoHorizontalOverflow, test, unexpected } from "../support/test"

// G2.24 — calendário do Histórico: carregado, vazio, ERRO (≠ vazio), nova
// tentativa e erro depois de trocar o mês. Harness `/e2e-harness/history`
// (HistoryView real; as leituras são sintéticas e controladas pelo estado).

const HISTORY = "/e2e-harness/history"
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]

async function openCalendar(page: Page, state: string) {
  await page.goto(`${HISTORY}?state=${state}`)
  await page.getByRole("tab", { name: "Calendário" }).click()
  await expect(page.getByRole("tab", { name: "Calendário" })).toHaveAttribute("aria-selected", "true")
}

/** Título do mês que o aluno está vendo (h2 do calendário). */
const monthHeading = (page: Page) => page.getByRole("tabpanel").getByRole("heading", { level: 2 })

/**
 * O sonner pausa o tempo do aviso enquanto o ponteiro está "sobre" a lista de
 * avisos; com toque emulado o `mouseleave` só chega ao tocar em outro lugar. O
 * teste solta o ponteiro (como o aluno ao tocar fora) e espera o aviso sumir,
 * em vez de abrir uma exceção no axe para ele.
 */
async function waitToastsGone(page: Page) {
  await page.mouse.move(2, 600)
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 15_000 })
}

const errorPanel = (page: Page) => page.getByRole("alert").filter({ hasText: "Não foi possível carregar" })

test.describe("calendário do Histórico — estados", () => {
  test("carregado: grade do mês, dias com estudo selecionáveis, sem aviso de erro", async ({ page }) => {
    await openCalendar(page, "data")
    await expect(page.getByRole("tabpanel").getByRole("button", { name: /estudados em \d+ sess/ }).first()).toBeVisible()
    await expect(errorPanel(page)).toHaveCount(0)
    await expect(page.getByText(/Nenhum estudo registrado em/)).toHaveCount(0)
    await expect(page.getByText("indisponível neste mês")).toHaveCount(0)
  })

  test("vazio: mês sem estudos diz isso com texto (status), sem tratar como erro", async ({ page }) => {
    await openCalendar(page, "data")
    // dois meses para trás: as sessões sintéticas cobrem só os últimos 9 dias
    await page.getByRole("button", { name: "Anterior" }).click()
    await expect(page.getByRole("tabpanel").getByText("Carregando…")).toHaveCount(0)
    await page.getByRole("button", { name: "Anterior" }).click()
    const empty = page.getByRole("status").filter({ hasText: /Nenhum estudo registrado em/ })
    await expect(empty).toBeVisible()
    await expect(errorPanel(page)).toHaveCount(0)
    // a grade continua lá (mês vazio é um calendário normal, só sem estudo)
    await expect(page.getByRole("tabpanel").getByRole("button", { name: /Nenhum estudo\./ }).first()).toBeVisible()
  })

  test("erro: aviso anunciável no lugar da grade, mês preservado, resumo 'indisponível' (nunca 0)", async ({ page }) => {
    await openCalendar(page, "calendar-error")
    const alert = errorPanel(page)
    await expect(alert).toBeVisible()
    const heading = await monthHeading(page).innerText()
    await expect(alert).toContainText(heading.replace(" de ", " de "))
    await expect(alert.getByRole("button", { name: "Tentar novamente" })).toBeEnabled()
    // falha de leitura NÃO se parece com "mês sem estudos"
    await expect(page.getByText(/Nenhum estudo registrado em/)).toHaveCount(0)
    await expect(page.getByRole("tabpanel").getByRole("button", { name: /Nenhum estudo\./ })).toHaveCount(0)
    await expect(page.getByText("indisponível neste mês")).toBeVisible()
    // o aviso não depende do toast
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(1)
  })

  test("nova tentativa: a segunda leitura funciona e o erro some", async ({ page }) => {
    await openCalendar(page, "calendar-retry")
    await expect(errorPanel(page)).toBeVisible()
    const before = await monthHeading(page).innerText()
    await page.getByRole("button", { name: "Tentar novamente" }).click()
    await expect(errorPanel(page)).toHaveCount(0)
    await expect(page.getByRole("tabpanel").getByRole("button", { name: /estudados em \d+ sess/ }).first()).toBeVisible()
    await expect(monthHeading(page)).toHaveText(before) // mesmo mês
    await expect(page.getByText("indisponível neste mês")).toHaveCount(0)
  })

  test("repetir 'Tentar novamente' em falha contínua não empilha avisos idênticos", async ({ page }) => {
    await openCalendar(page, "calendar-error")
    for (let i = 0; i < 3; i += 1) {
      await expect(errorPanel(page)).toBeVisible()
      await page.getByRole("button", { name: "Tentar novamente" }).click()
      await expect(errorPanel(page)).toBeVisible()
    }
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(1)
    await expect(errorPanel(page)).toHaveCount(1)
  })

  test("erro depois de trocar o período: o mês escolhido é mantido; voltar ao mês bom recupera", async ({ page }) => {
    await openCalendar(page, "calendar-month-error")
    await expect(errorPanel(page)).toHaveCount(0)
    const current = await monthHeading(page).innerText()
    await page.getByRole("button", { name: "Anterior" }).click()
    await expect(errorPanel(page)).toBeVisible()
    const failed = await monthHeading(page).innerText()
    expect(failed).not.toBe(current)
    const [monthName] = failed.split(" de ")
    expect(MONTHS).toContain(monthName)
    await expect(errorPanel(page)).toContainText(failed) // a mensagem cita o mês que o aluno escolheu
    // a navegação continua disponível durante o erro
    await expect(page.getByRole("button", { name: "Próximo" })).toBeEnabled()
    await page.getByRole("button", { name: "Próximo" }).click()
    await expect(monthHeading(page)).toHaveText(current)
    await expect(errorPanel(page)).toHaveCount(0)
    await expect(page.getByRole("tabpanel").getByRole("button", { name: /estudados em \d+ sess/ }).first()).toBeVisible()
  })

  test("o painel de erro não trava a tela: abas, teclado e foco seguem funcionando", async ({ page }) => {
    await openCalendar(page, "calendar-error")
    await expect(errorPanel(page)).toBeVisible()
    const retry = page.getByRole("button", { name: "Tentar novamente" })
    await retry.focus()
    await expect(retry).toBeFocused()
    const tabs = page.getByRole("tablist", { name: "Visualização do histórico" }).getByRole("tab")
    await tabs.nth(1).focus()
    await page.keyboard.press("Home")
    await page.keyboard.press("Enter")
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true")
    await expect(page.getByRole("tabpanel")).toBeVisible()
  })
})

test.describe("calendário do Histórico — acessibilidade e layout", () => {
  for (const scheme of ["light", "dark"] as const) {
    test.describe(scheme, () => {
      test.use({ colorScheme: scheme })

      test(`axe: carregado, vazio e erro (${scheme})`, async ({ page }) => {
        await openCalendar(page, "calendar-retry")
        await expect(errorPanel(page)).toBeVisible()
        await waitToastsGone(page)
        await expectNoAxeViolations(page)
        await page.getByRole("button", { name: "Tentar novamente" }).click()
        await expect(errorPanel(page)).toHaveCount(0)
        await expectNoAxeViolations(page)
        await page.getByRole("button", { name: "Anterior" }).click()
        await page.getByRole("button", { name: "Anterior" }).click()
        await expect(page.getByRole("status").filter({ hasText: /Nenhum estudo registrado em/ })).toBeVisible()
        await expectNoAxeViolations(page)
      })
    })
  }

  const SIZES = [
    { name: "320x480", width: 320, height: 480 },
    { name: "375x812", width: 375, height: 812 },
    { name: "768x1024", width: 768, height: 1024 },
    { name: "1280x800", width: 1280, height: 800 },
  ] as const
  for (const size of SIZES) {
    test(`erro em ${size.name}: sem overflow, aviso e botão dentro da tela`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "a matriz define o tamanho de tela; roda uma vez")
      await page.setViewportSize({ width: size.width, height: size.height })
      await openCalendar(page, "calendar-error")
      const alert = errorPanel(page)
      await expect(alert).toBeVisible()
      await alert.scrollIntoViewIfNeeded()
      await expectNoHorizontalOverflow(page)
      const retry = alert.getByRole("button", { name: "Tentar novamente" })
      const box = await retry.boundingBox()
      expect(box).not.toBeNull()
      if (box) {
        expect(box.x).toBeGreaterThanOrEqual(-1)
        expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1)
        expect(box.height).toBeGreaterThanOrEqual(28)
      }
    })
  }

  test("sem erros inesperados de página (sucesso, falha e nova tentativa)", async ({ page, pageErrors }) => {
    await openCalendar(page, "calendar-retry")
    await expect(errorPanel(page)).toBeVisible()
    await page.getByRole("button", { name: "Tentar novamente" }).click()
    await expect(errorPanel(page)).toHaveCount(0)
    expect(unexpected(pageErrors)).toEqual([])
  })
})
