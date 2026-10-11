import { USER_AGENTS, installPwaProbe, waitForInstallListener } from "../support/pwa"
import { expectNoAxeViolations } from "../support/axe"
import { expect, test } from "../support/test"

// G2.21 — varredura automática (axe-core, WCAG 2.0/2.1 A e AA) nas telas e
// modais já cobertos na G2.20, mais teclado no painel do Mentor.
// Zero violações NÃO prova acessibilidade completa: ver
// docs/g2-21-e2e-accessibility-report.md (validações manuais pendentes).

test.describe("axe — telas públicas e harness da G2.20", () => {
  test("login", async ({ page }) => {
    await page.goto("/login")
    await expect(page.getByRole("button", { name: /Entrar/ }).first()).toBeVisible()
    await expectNoAxeViolations(page)
  })

  test("menu da conta: fechado, aberto e modais 'Pedir um edital' e 'Minha conta'", async ({ page }) => {
    await page.goto("/e2e-harness/account-menu")
    await expect(page.getByRole("button", { name: "Menu do usuário" })).toBeVisible()
    await expectNoAxeViolations(page)
    await page.getByRole("button", { name: "Menu do usuário" }).click()
    await expect(page.getByRole("menu")).toBeVisible()
    await expectNoAxeViolations(page)
    await page.getByRole("menuitem", { name: "Pedir um edital" }).click()
    await expect(page.getByRole("dialog", { name: "Solicitar novo edital" })).toBeVisible()
    await expectNoAxeViolations(page, { include: '[role="dialog"]' })
    await page.keyboard.press("Escape")
    await page.getByRole("button", { name: "Menu do usuário" }).click()
    await page.getByRole("menuitem", { name: "Minha conta" }).click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await expectNoAxeViolations(page, { include: '[role="dialog"]' })
  })

  test.describe("modal de instalação (PWA)", () => {
    test.use({ userAgent: USER_AGENTS.iphoneSafari })
    test("instruções do iPhone", async ({ page }) => {
      await installPwaProbe(page)
      await page.goto("/e2e-harness/account-menu")
      await waitForInstallListener(page)
      await page.getByRole("button", { name: "Menu do usuário" }).click()
      await page.getByRole("menuitem", { name: "Instalar aplicativo" }).click()
      await expect(page.getByRole("dialog", { name: "Adicione o NomeIA à tela inicial" })).toBeVisible()
      await expectNoAxeViolations(page, { include: '[role="dialog"]' })
    })
  })

  for (const state of ["valid", "empty", "unavailable", "rate"] as const) {
    test(`Mentor (${state})`, async ({ page }) => {
      await page.goto(`/e2e-harness/mentor?state=${state}`)
      await expect(page.getByRole("heading", { name: "Mentor de estudos (harness E2E)" })).toBeAttached()
      if (state === "unavailable" || state === "rate") {
        await page.getByRole("button", { name: "Gerar análise" }).click()
        await expect(page.getByRole("button", { name: /Gerar análise|Gerar novamente/ })).toBeVisible()
        await expect(page.getByText("Analisando seu momento…")).toHaveCount(0)
      }
      await expectNoAxeViolations(page)
    })
  }
})

test.describe("teclado — painel do Mentor", () => {
  test("Tab chega a 'Gerar análise', Enter gera; o foco não se perde durante e depois", async ({ page }) => {
    await page.goto("/e2e-harness/mentor?state=valid")
    const button = page.getByRole("button", { name: "Gerar análise" })
    await expect(button).toBeVisible()
    await page.waitForLoadState("networkidle")
    // Chega pelo teclado (sem clicar): no máximo 40 Tabs.
    let reached = false
    for (let i = 0; i < 40 && !reached; i++) {
      await page.keyboard.press("Tab")
      reached = await button.evaluate((el) => el === document.activeElement)
    }
    expect(reached, "'Gerar análise' alcançável com Tab").toBe(true)
    await page.keyboard.press("Enter")
    await expect(page.getByText(/Confiança (alta|média|baixa)/)).toBeVisible()
    const regenerate = page.getByRole("button", { name: "Gerar novamente" })
    await expect(regenerate).toBeVisible()
    // Foco continua em um elemento real da página (não caiu no <body>).
    const onBody = await page.evaluate(() => document.activeElement === document.body || document.activeElement === null)
    expect(onBody, "o foco não deve cair no <body> depois de gerar").toBe(false)
  })
})
