import { join } from "node:path"

import type { Locator, Page, TestInfo } from "@playwright/test"

import { USER_AGENTS, installPwaProbe, waitForInstallListener } from "../support/pwa"
import { expect, expectNoHorizontalOverflow, test } from "../support/test"

// G2.22 — capturas para conferência visual das telas alteradas.
//
// O que é automático: cada captura é feita com dados sintéticos fixos, de um
// trecho localizado da tela (não da página inteira com conteúdo que muda),
// e acompanhada de asserções semânticas (visível, dentro da tela, sem
// rolagem horizontal). As imagens vão para o relatório e para
// e2e/.results/visual/ (artefato do CI em caso de falha).
//
// O que NÃO é automático: a aprovação estética. Não há comparação pixel a
// pixel com imagem de referência: fontes e antialiasing mudam entre Windows
// (desenvolvimento) e Linux (CI), e uma referência gerada numa máquina falharia
// na outra. A avaliação visual continua sendo humana (ver relatório G2.22).

async function capture(page: Page, testInfo: TestInfo, name: string, target?: Locator) {
  const file = join(testInfo.project.outputDir, "visual", `${testInfo.project.name}-${name}.png`)
  const body = target ? await target.screenshot({ path: file, animations: "disabled" }) : await page.screenshot({ path: file, animations: "disabled" })
  await testInfo.attach(name, { body, contentType: "image/png" })
}

async function openDashboard(page: Page) {
  await page.goto("/e2e-harness/dashboard")
  await expect(page.locator('[id^="DndDescribedBy-"]').first()).toBeAttached()
  await page.waitForLoadState("networkidle")
  // Os cards da grade são recriados ~2 s depois da hidratação (chunks dos widgets
  // carregando sob `next dev`); capturar antes disso falhava de vez em quando com
  // "Element is not attached to the DOM". Espera o card ficar o MESMO nó por 1 s.
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __cardNode?: Element | null; __cardSince?: number }
      const el = document.querySelector('[data-testid="desempenho-acuracia"]')
      if (!el) return false
      if (w.__cardNode !== el) {
        w.__cardNode = el
        w.__cardSince = performance.now()
        return false
      }
      return performance.now() - (w.__cardSince ?? 0) > 1_000
    },
    undefined,
    { polling: 100, timeout: 15_000 },
  )
}

test.describe("capturas — Dashboard", () => {
  test("cabeçalho + Foco de hoje + início da grade", async ({ page }, testInfo) => {
    await openDashboard(page)
    await expectNoHorizontalOverflow(page)
    await capture(page, testInfo, "dashboard-topo")
    const desempenho = page.getByTestId("desempenho-acuracia").locator("xpath=ancestor::div[contains(@class,'group')][1]")
    await desempenho.scrollIntoViewIfNeeded()
    await expect(desempenho).toBeInViewport()
    await capture(page, testInfo, "dashboard-desempenho-geral", desempenho)
  })

  test.describe("320×480", () => {
    test.use({ viewport: { width: 320, height: 480 }, isMobile: true, hasTouch: true })
    test("card 'Desempenho geral' com 'Acurácia' completa", async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "o tamanho vem do próprio teste")
      await openDashboard(page)
      const card = page.getByTestId("desempenho-acuracia").locator("xpath=ancestor::div[contains(@class,'group')][1]")
      await card.scrollIntoViewIfNeeded()
      await expectNoHorizontalOverflow(page)
      await capture(page, testInfo, "dashboard-320-desempenho", card)
    })
  })
})

test.describe("capturas — Central de estudos", () => {
  test("abas com foco visível e painel Manual", async ({ page }, testInfo) => {
    await page.goto("/e2e-harness/study-register")
    await page.waitForLoadState("networkidle")
    await page.getByRole("button", { name: "Abrir Central de estudos" }).click()
    const dialog = page.getByRole("dialog", { name: "Central de estudos" })
    await expect(dialog).toBeVisible()
    await page.getByRole("tab", { name: "Cronômetro" }).focus()
    await page.keyboard.press("ArrowRight")
    await expect(page.getByRole("tab", { name: "Manual" })).toBeFocused()
    await capture(page, testInfo, "central-abas-manual", dialog)
  })
})

test.describe("capturas — resultado de simulado e Simulados no escuro", () => {
  test("resultado (claro)", async ({ page }, testInfo) => {
    await page.goto("/e2e-harness/simulado-result?state=low")
    await expect(page.getByRole("heading", { name: /Simulado diagnóstico/ })).toBeVisible()
    await capture(page, testInfo, "simulado-result-claro")
  })

  test.describe("tema escuro", () => {
    test.use({ colorScheme: "dark" })
    test("resultado (escuro) e Simulados (escuro)", async ({ page }, testInfo) => {
      await page.goto("/e2e-harness/simulado-result?state=low")
      await expect(page.locator("html")).toHaveClass(/\bdark\b/)
      await capture(page, testInfo, "simulado-result-escuro")
      await page.goto("/e2e-harness/simulados")
      await expect(page.getByText("4 registros")).toBeVisible()
      await expect(page.getByText("Calculando…")).toHaveCount(0)
      await capture(page, testInfo, "simulados-escuro")
    })
  })
})

test.describe("capturas — modal PWA", () => {
  test.use({ userAgent: USER_AGENTS.iphoneSafari })
  test("instruções do iPhone", async ({ page }, testInfo) => {
    await installPwaProbe(page)
    await page.goto("/e2e-harness/account-menu")
    await waitForInstallListener(page)
    await page.getByRole("button", { name: "Menu do usuário" }).click()
    await page.getByRole("menuitem", { name: "Instalar aplicativo" }).click()
    const dialog = page.getByRole("dialog", { name: "Adicione o NomeIA à tela inicial" })
    await expect(dialog).toBeVisible()
    await capture(page, testInfo, "pwa-modal", dialog)
  })
})
