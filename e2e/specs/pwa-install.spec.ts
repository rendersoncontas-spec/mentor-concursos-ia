import type { Page } from "@playwright/test"

import {
  USER_AGENTS,
  activeInstallListeners,
  fireAppInstalled,
  fireBeforeInstallPrompt,
  installPwaProbe,
  promptCalls,
  waitForInstallListener,
  type PwaProbeOptions,
} from "../support/pwa"
import { expect, test, unexpected } from "../support/test"

// G2.20 — fluxo "Instalar aplicativo" com eventos SIMULADOS do navegador.
// Isto valida a NOSSA interface; não é a instalação real (a janela nativa do
// sistema não é automatizada). Ver docs/pwa-install-experience.md (roteiro manual).

async function openHarness(page: Page, opts: PwaProbeOptions = {}) {
  await installPwaProbe(page, opts)
  await page.goto("/e2e-harness/account-menu")
  await expect(page.getByRole("heading", { name: "Harness E2E — menu da conta" })).toBeVisible()
  await waitForInstallListener(page)
}
async function openMenu(page: Page) {
  await page.getByRole("button", { name: "Menu do usuário" }).click()
  await expect(page.getByRole("menu")).toBeVisible()
}
const INSTALLED_TOAST = /NomeIA instalado/
const installItem = (page: Page) => page.getByRole("menuitem", { name: "Instalar aplicativo" })
const installDialog = (page: Page) => page.getByRole("dialog", { name: "Adicione o NomeIA à tela inicial" })

test.describe("Android com beforeinstallprompt", () => {
  test.use({ userAgent: USER_AGENTS.androidChrome })

  test("A+B: evento guardado sem abrir nada; prompt só no toque; aceitar não declara instalado; appinstalled confirma", async ({ page, pageErrors }) => {
    await openHarness(page)
    await fireBeforeInstallPrompt(page, "accepted", "evento-1")
    expect(await promptCalls(page), "nada abre sozinho").toEqual([])
    await openMenu(page)
    await installItem(page).click()
    await expect.poll(() => promptCalls(page)).toEqual(["evento-1"])
    await expect(page.getByRole("menu"), "o menu fecha ao tocar").toHaveCount(0)
    await page.waitForTimeout(300)
    await expect(page.getByText(INSTALLED_TOAST), "aceitar ≠ instalado").toHaveCount(0)
    await fireAppInstalled(page)
    await expect(page.getByText(INSTALLED_TOAST)).toBeVisible()
    await openMenu(page)
    await expect(page.getByRole("menuitem", { name: "Aplicativo instalado" })).toHaveAttribute("aria-disabled", "true")
    await expect(installItem(page)).toHaveCount(0)
    expect(unexpected(pageErrors)).toEqual([])
  })

  test("C: cancelar mostra aviso discreto e o menu segue funcionando", async ({ page }) => {
    await openHarness(page)
    await fireBeforeInstallPrompt(page, "dismissed")
    await openMenu(page)
    await installItem(page).click()
    await expect(page.getByText("Instalação cancelada. Você pode instalar depois pelo menu da conta.")).toBeVisible()
    await expect(page.getByText(INSTALLED_TOAST)).toHaveCount(0)
    await openMenu(page)
    await expect(page.getByRole("menuitem", { name: "Minha conta" })).toBeVisible()
    await expect(installItem(page), "sem novo evento: cai nas instruções").toBeVisible()
    await installItem(page).click()
    await expect(installDialog(page)).toBeVisible()
  })

  test("I: abrir e fechar o menu várias vezes não duplica nem remove o ouvinte", async ({ page }) => {
    await openHarness(page)
    for (let i = 0; i < 3; i += 1) {
      await openMenu(page)
      await page.keyboard.press("Escape")
      await expect(page.getByRole("menu")).toHaveCount(0)
    }
    expect(await activeInstallListeners(page)).toBe(1)
    await fireBeforeInstallPrompt(page, "accepted", "depois-de-remontar")
    await openMenu(page)
    await installItem(page).click()
    await expect.poll(() => promptCalls(page)).toEqual(["depois-de-remontar"])
  })

  test("J: dois eventos seguidos → usa só o mais recente, uma única vez (toque duplo incluído)", async ({ page }) => {
    await openHarness(page)
    await fireBeforeInstallPrompt(page, "dismissed", "antigo")
    await fireBeforeInstallPrompt(page, "dismissed", "recente")
    await openMenu(page)
    await installItem(page).dblclick()
    await expect.poll(() => promptCalls(page)).toEqual(["recente"])
    await page.waitForTimeout(300)
    expect(await promptCalls(page)).toEqual(["recente"])
  })
})

test.describe("D: navegador sem beforeinstallprompt", () => {
  test.use({ userAgent: USER_AGENTS.androidChrome })

  test("abre instruções do menu do navegador, acessíveis, e fecha com Entendi/Esc", async ({ page }) => {
    await openHarness(page)
    await openMenu(page)
    await expect(installItem(page)).toHaveAttribute("aria-haspopup", "dialog")
    await installItem(page).click()
    const dialog = installDialog(page)
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/O nome da opção varia\s+conforme o navegador/)).toBeVisible()
    await expect(dialog.getByRole("listitem")).toHaveCount(3)
    await expect(dialog.getByText(/não é um app da loja e\s+continua precisando de internet/)).toBeVisible()
    await dialog.getByRole("button", { name: "Entendi" }).click()
    await expect(dialog).toHaveCount(0)
    await openMenu(page)
    await installItem(page).click()
    await expect(installDialog(page)).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(installDialog(page)).toHaveCount(0)
    expect(await promptCalls(page)).toEqual([])
  })
})

test.describe("E: iPhone", () => {
  test.use({ userAgent: USER_AGENTS.iphoneSafari })
  test("Safari: 3 passos do Compartilhar, sem prompt e sem afirmar instalação", async ({ page }) => {
    await openHarness(page)
    await openMenu(page)
    await installItem(page).click()
    const dialog = installDialog(page)
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole("listitem")).toHaveCount(3)
    await expect(dialog.getByRole("listitem").nth(0)).toContainText("Compartilhar")
    await expect(dialog.getByRole("img", { name: "ícone Compartilhar" })).toBeVisible()
    await expect(dialog.getByRole("listitem").nth(1)).toContainText("Adicionar à Tela de Início")
    await expect(dialog.getByRole("listitem").nth(2)).toContainText("Adicionar")
    await expect(dialog.getByText(/abra o NomeIA no/)).toHaveCount(0)
    await expect(dialog.getByText(/instalado/i)).toHaveCount(0)
    await dialog.getByRole("button", { name: "Entendi" }).click()
    await expect(dialog).toHaveCount(0)
  })
})

test.describe("E: iPhone fora do Safari", () => {
  test.use({ userAgent: USER_AGENTS.iphoneChrome })
  test("Chrome iOS: sugere o Safari se a opção não aparecer", async ({ page }) => {
    await openHarness(page)
    await openMenu(page)
    await installItem(page).click()
    await expect(installDialog(page).getByText(/abra o NomeIA no/)).toContainText("Safari")
  })
})

test.describe("F: navegador embutido (Instagram)", () => {
  test.use({ userAgent: USER_AGENTS.instagramAndroid })
  test("pede para abrir no navegador do celular", async ({ page }) => {
    await openHarness(page)
    await openMenu(page)
    await installItem(page).click()
    await expect(installDialog(page).getByText(/navegador dentro de outro aplicativo/)).toBeVisible()
  })
})

test.describe("G: já rodando como app", () => {
  test.use({ userAgent: USER_AGENTS.androidChrome })
  test("display-mode standalone → 'Aplicativo instalado', sem ação redundante", async ({ page }) => {
    await openHarness(page, { standalone: true })
    await openMenu(page)
    const installed = page.getByRole("menuitem", { name: "Aplicativo instalado" })
    await expect(installed).toBeVisible()
    await expect(installed).toHaveAttribute("aria-disabled", "true")
    await expect(installItem(page)).toHaveCount(0)
    await expect(page.getByRole("menuitem", { name: "Minha conta" }), "navegação não bloqueada").toBeVisible()
  })
})

test.describe("G: iPhone já instalado", () => {
  test.use({ userAgent: USER_AGENTS.iphoneSafari })
  test("navigator.standalone → 'Aplicativo instalado'", async ({ page }) => {
    await openHarness(page, { navigatorStandalone: true })
    await openMenu(page)
    await expect(page.getByRole("menuitem", { name: "Aplicativo instalado" })).toBeVisible()
  })
})

test.describe("modal de instruções: foco", () => {
  test.use({ userAgent: USER_AGENTS.iphoneSafari })
  test("foco vai para dentro do modal e, ao fechar, volta ao botão do menu", async ({ page }) => {
    await openHarness(page)
    await openMenu(page)
    await installItem(page).click()
    const dialog = installDialog(page)
    await expect(dialog).toBeVisible()
    const inside = await dialog.evaluate((d) => d.contains(document.activeElement))
    expect(inside, "foco dentro do modal").toBe(true)
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Menu do usuário" })).toBeFocused()
  })
})
