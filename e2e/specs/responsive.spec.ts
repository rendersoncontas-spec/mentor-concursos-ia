import { USER_AGENTS, installPwaProbe, waitForInstallListener } from "../support/pwa"
import { expect, expectInsideViewport, expectNoHorizontalOverflow, test } from "../support/test"

// G2.20 — responsividade (emulação; não substitui aparelho físico).

test.describe("sem rolagem horizontal", () => {
  for (const path of ["/login", "/e2e-harness/account-menu", "/e2e-harness/mentor?state=valid", "/e2e-harness/mentor?state=empty"]) {
    test(path, async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState("networkidle").catch(() => undefined)
      await expectNoHorizontalOverflow(page)
    })
  }
})

test.describe("menu da conta cabe na tela", () => {
  test("menu aberto inteiro dentro da janela (nome e e-mail longos truncados)", async ({ page }) => {
    await page.goto("/e2e-harness/account-menu")
    await page.getByRole("button", { name: "Menu do usuário" }).click()
    await expectInsideViewport(page, "[role=menu]")
    await expectNoHorizontalOverflow(page)
  })
})

test.describe("modal de instalação em tela pequena", () => {
  test.use({ userAgent: USER_AGENTS.iphoneSafari, viewport: { width: 320, height: 480 } })
  test("cabe na altura, rola por dentro e o botão Entendi é alcançável", async ({ page }) => {
    await installPwaProbe(page)
    await page.goto("/e2e-harness/account-menu")
    await waitForInstallListener(page)
    await page.getByRole("button", { name: "Menu do usuário" }).click()
    await page.getByRole("menuitem", { name: "Instalar aplicativo" }).click()
    const dialog = page.getByRole("dialog", { name: "Adicione o NomeIA à tela inicial" })
    await expect(dialog).toBeVisible()
    const box = await dialog.boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      expect(box.height).toBeLessThanOrEqual(480 * 0.85 + 2)
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(321)
    }
    const ok = dialog.getByRole("button", { name: "Entendi" })
    await ok.scrollIntoViewIfNeeded()
    await expect(ok).toBeInViewport()
    await ok.click()
    await expect(dialog).toHaveCount(0)
    await expectNoHorizontalOverflow(page)
  })
})
