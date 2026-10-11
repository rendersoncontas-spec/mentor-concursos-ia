import type { Page } from "@playwright/test"

import { USER_AGENTS, installPwaProbe, waitForInstallListener } from "../support/pwa"
import { expectNoAxeViolations } from "../support/axe"
import { expect, test } from "../support/test"

// G2.22 — axe-core (WCAG 2.0/2.1 A/AA) no TEMA ESCURO.
// Reaproveita o mecanismo real de tema: next-themes com defaultTheme="system"
// e attribute="class" (src/app/layout.tsx). O navegador emulado prefere o
// escuro (colorScheme: "dark") e o app aplica a classe `.dark` sozinho — nada
// de tema paralelo nem classe forçada. Cada teste confere que o escuro está
// mesmo ativo antes de medir.
// O tema claro continua coberto por accessibility.spec.ts e pelos specs de
// cada tela. Zero violações aqui NÃO prova conformidade WCAG integral.

test.use({ colorScheme: "dark" })

async function expectDark(page: Page) {
  await expect(page.locator("html")).toHaveClass(/\bdark\b/)
}

test.describe("axe — tema escuro", () => {
  test("login", async ({ page }) => {
    await page.goto("/login")
    await expectDark(page)
    await expect(page.getByRole("button", { name: /Entrar/ }).first()).toBeVisible()
    await expectNoAxeViolations(page)
  })

  test("menu da conta, 'Minha conta' e 'Pedir um edital'", async ({ page }) => {
    await page.goto("/e2e-harness/account-menu")
    await expectDark(page)
    await page.getByRole("button", { name: "Menu do usuário" }).click()
    await expect(page.getByRole("menu")).toBeVisible()
    await expectNoAxeViolations(page)
    await page.getByRole("menuitem", { name: "Minha conta" }).click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await expectNoAxeViolations(page, { include: '[role="dialog"]' })
    await page.keyboard.press("Escape")
    await page.getByRole("button", { name: "Menu do usuário" }).click()
    await page.getByRole("menuitem", { name: "Pedir um edital" }).click()
    await expect(page.getByRole("dialog", { name: "Solicitar novo edital" })).toBeVisible()
    await expectNoAxeViolations(page, { include: '[role="dialog"]' })
  })

  test.describe("modal de instalação (PWA)", () => {
    test.use({ userAgent: USER_AGENTS.iphoneSafari })
    test("instruções do iPhone", async ({ page }) => {
      await installPwaProbe(page)
      await page.goto("/e2e-harness/account-menu")
      await waitForInstallListener(page)
      await expectDark(page)
      await page.getByRole("button", { name: "Menu do usuário" }).click()
      await page.getByRole("menuitem", { name: "Instalar aplicativo" }).click()
      await expect(page.getByRole("dialog", { name: "Adicione o NomeIA à tela inicial" })).toBeVisible()
      await expectNoAxeViolations(page, { include: '[role="dialog"]' })
    })
  })

  test("Dashboard: com dados, vazio e modal 'Adicionar estudo' (Central de estudos)", async ({ page }) => {
    await page.goto("/e2e-harness/dashboard")
    await expectDark(page)
    await expect(page.locator('[id^="DndDescribedBy-"]').first()).toBeAttached()
    await page.waitForLoadState("networkidle")
    await expectNoAxeViolations(page)
    await page.getByRole("button", { name: "Adicionar estudo" }).click()
    await expect(page.getByRole("dialog", { name: "Central de estudos" })).toBeVisible()
    await expectNoAxeViolations(page, { include: '[role="dialog"]' })
    await page.goto("/e2e-harness/dashboard?state=empty")
    await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible()
    await expectNoAxeViolations(page)
  })

  test("Simulados: página, registro, detalhe, vazio e erro", async ({ page }) => {
    await page.goto("/e2e-harness/simulados")
    await expectDark(page)
    await expect(page.getByText("4 registros")).toBeVisible()
    await expect(page.getByText("Calculando…")).toHaveCount(0)
    await expectNoAxeViolations(page)
    await page.getByRole("button", { name: "Registrar simulado" }).click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await expectNoAxeViolations(page, { include: '[role="dialog"]' })
    await page.keyboard.press("Escape")
    await page.getByRole("button", { name: "Análise de Simulado TCU — Estratégia" }).click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await expectNoAxeViolations(page, { include: '[role="dialog"]' })
    await page.goto("/e2e-harness/simulados?state=empty")
    await expect(page.getByRole("heading", { name: "Nenhum simulado registrado" })).toBeVisible()
    await expectNoAxeViolations(page)
    await page.goto("/e2e-harness/simulados?state=load-error")
    await expect(page.getByRole("alert").filter({ hasText: "Não foi possível" })).toBeVisible()
    await expectNoAxeViolations(page)
  })

  test("Central de estudos: Cronômetro e Manual", async ({ page }) => {
    await page.goto("/e2e-harness/study-register")
    await expectDark(page)
    await page.waitForLoadState("networkidle")
    await page.getByRole("button", { name: "Abrir Central de estudos" }).click()
    await expect(page.getByRole("dialog", { name: "Central de estudos" })).toBeVisible()
    await expectNoAxeViolations(page, { include: '[role="dialog"]' })
    await page.getByRole("tab", { name: "Manual" }).click()
    await expectNoAxeViolations(page, { include: '[role="dialog"]' })
  })

  for (const state of ["valid", "empty", "unavailable"] as const) {
    test(`Mentor (${state})`, async ({ page }) => {
      await page.goto(`/e2e-harness/mentor?state=${state}`)
      await expectDark(page)
      await expect(page.getByRole("heading", { name: "Mentor de estudos (harness E2E)" })).toBeAttached()
      if (state === "unavailable") {
        await page.getByRole("button", { name: "Gerar análise" }).click()
        await expect(page.getByText("Analisando seu momento…")).toHaveCount(0)
      }
      await expectNoAxeViolations(page)
    })
  }

  test("resultado de simulado (alto e baixo, questão aberta)", async ({ page }) => {
    await page.goto("/e2e-harness/simulado-result")
    await expectDark(page)
    await expect(page.getByRole("heading", { name: /Simulado de revisão/ })).toBeVisible()
    await expectNoAxeViolations(page)
    await page.goto("/e2e-harness/simulado-result?state=low")
    await page.getByRole("button", { name: /Questão fictícia 2/ }).click()
    await expect(page.getByText("Explicação fictícia do gabarito.")).toBeVisible()
    await expectNoAxeViolations(page)
  })
})
