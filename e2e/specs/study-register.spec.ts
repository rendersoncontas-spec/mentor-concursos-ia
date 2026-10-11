import type { Page } from "@playwright/test"

import { expectNoAxeViolations } from "../support/axe"
import { expect, expectInsideViewport, expectNoHorizontalOverflow, test, unexpected } from "../support/test"

// G2.21 — Central de estudos (StudyRegisterModal REAL): rótulos, teclado e
// foco. Regressão do defeito confirmado na G2.21: no modo Manual, Horas,
// Minutos, Segundos, Data do Estudo e Horário de Início não tinham nome
// acessível (FormControl envolvia o <div>, e o <Label> não apontava para o input).

async function openModal(page: Page) {
  await page.goto("/e2e-harness/study-register")
  await page.waitForLoadState("networkidle")
  await page.getByRole("button", { name: "Abrir Central de estudos" }).click()
  await expect(page.getByRole("dialog", { name: "Central de estudos" })).toBeVisible()
}
async function manual(page: Page) {
  const tab = page.getByRole("tab", { name: "Manual" })
  await tab.click()
  await expect(tab).toHaveAttribute("aria-selected", "true")
}
const dialog = (page: Page) => page.getByRole("dialog", { name: "Central de estudos" })
const focusInsideDialog = (page: Page) => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))

test.describe("Central de estudos — rótulos do formulário", () => {
  test("modo Manual: duração, data e horário têm rótulo associado ao campo", async ({ page, pageErrors }) => {
    await openModal(page)
    await manual(page)
    const d = dialog(page)
    const group = d.getByRole("group", { name: "Duração Estudada" })
    await expect(group.getByRole("spinbutton")).toHaveCount(3)
    for (const label of ["Horas", "Minutos", "Segundos"]) {
      await expect(group.getByRole("spinbutton", { name: label, exact: true })).toHaveCount(1)
    }
    await expect(d.getByLabel("Data do Estudo", { exact: true })).toHaveAttribute("type", "date")
    await expect(d.getByLabel("Horário de Início", { exact: true })).toHaveAttribute("type", "time")
    // Rótulo único por campo (nada de rótulo duplicado).
    await expect(d.getByText("Horas", { exact: true })).toHaveCount(1)
    await expect(d.getByText("Data do Estudo", { exact: true })).toHaveCount(1)
    // Disciplina (obrigatória) e Tópico também nomeados pelos rótulos visíveis.
    await expect(d.getByRole("button", { name: /^Disciplina \(obrigatório\)/ })).toBeVisible()
    await expect(d.getByRole("textbox", { name: "Tópico", exact: true })).toBeVisible()
    for (const label of ["Formato do Estudo", "Questões", "Acertos"]) {
      await expect(d.getByLabel(label, { exact: true }), label).toHaveCount(1)
    }
    await expect(d.getByRole("textbox", { name: "Anotações (opcional)" })).toHaveCount(1)
    expect(unexpected(pageErrors)).toEqual([])
  })

  test("modo Manual: preencher pela etiqueta atualiza o resumo; clicar no rótulo foca o campo", async ({ page }) => {
    await openModal(page)
    await manual(page)
    const d = dialog(page)
    await d.getByLabel("Horas", { exact: true }).fill("1")
    await d.getByLabel("Minutos", { exact: true }).fill("30")
    await expect(d.getByText("90 min", { exact: true }).first()).toBeVisible()
    await d.getByText("Segundos", { exact: true }).click()
    await expect(d.getByLabel("Segundos", { exact: true })).toBeFocused()
    await d.getByText("Horário de Início", { exact: true }).click()
    await expect(d.getByLabel("Horário de Início", { exact: true })).toBeFocused()
  })

  test("enviar sem disciplina: não salva, avisa sem nomes técnicos e mantém o que foi digitado", async ({ page }) => {
    await openModal(page)
    await manual(page)
    const d = dialog(page)
    await d.getByLabel("Minutos", { exact: true }).fill("45")
    await d.getByRole("button", { name: "Salvar estudo" }).click()
    await expect(page.getByText(/Verifique os campos obrigatórios: .*Disciplina é obrigatória/)).toBeVisible()
    await expect(page.getByText(/discipline_name|manual_minutes_field/)).toHaveCount(0)
    await expect(d.getByText("Disciplina é obrigatória")).toBeVisible()
    await expect(dialog(page)).toBeVisible()
    await expect(d.getByLabel("Minutos", { exact: true })).toHaveValue("45")
  })
})

test.describe("Central de estudos — teclado e foco", () => {
  test("foco inicial no modal, Tab/Shift+Tab presos, Esc fecha e devolve o foco ao botão", async ({ page }) => {
    await openModal(page)
    expect(await focusInsideDialog(page)).toBe(true)
    for (let i = 0; i < 30; i++) await page.keyboard.press("Tab")
    expect(await focusInsideDialog(page)).toBe(true)
    for (let i = 0; i < 10; i++) await page.keyboard.press("Shift+Tab")
    expect(await focusInsideDialog(page)).toBe(true)
    // 1º Esc pode fechar a dica (tooltip) do botão focado; o modal fecha em seguida.
    await page.keyboard.press("Escape")
    if (await dialog(page).count()) await page.keyboard.press("Escape")
    await expect(dialog(page)).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Abrir Central de estudos" })).toBeFocused()
  })

  test("abas Cronômetro/Manual operáveis pelo teclado (Enter e Espaço)", async ({ page }) => {
    await openModal(page)
    const manualTab = page.getByRole("tab", { name: "Manual" })
    await manualTab.focus()
    await page.keyboard.press("Enter")
    await expect(manualTab).toHaveAttribute("aria-selected", "true")
    const timerTab = page.getByRole("tab", { name: "Cronômetro" })
    await timerTab.focus()
    await page.keyboard.press("Space")
    await expect(timerTab).toHaveAttribute("aria-selected", "true")
  })
})

test.describe("Central de estudos — padrão de abas (G2.22)", () => {
  test("abas ligadas ao painel; só a aba ativa entra no Tab; ← → Home End trocam e levam o foco", async ({ page }) => {
    await openModal(page)
    const d = dialog(page)
    const timer = d.getByRole("tab", { name: "Cronômetro" })
    const manualTab = d.getByRole("tab", { name: "Manual" })
    await expect(d.getByRole("tablist", { name: "Modo de registro" })).toHaveAttribute("aria-orientation", "horizontal")
    // Associação aba → painel → aba ativa.
    const panelId = await timer.getAttribute("aria-controls")
    expect(panelId).toBeTruthy()
    expect(await manualTab.getAttribute("aria-controls")).toBe(panelId)
    const panel = page.locator(`[id="${panelId}"]`)
    await expect(panel).toHaveAttribute("role", "tabpanel")
    await expect(panel).toHaveAttribute("aria-labelledby", (await timer.getAttribute("id")) ?? "")
    // Tabindex móvel: só a selecionada é parada do Tab.
    await expect(timer).toHaveAttribute("tabindex", "0")
    await expect(manualTab).toHaveAttribute("tabindex", "-1")

    await timer.focus()
    await page.keyboard.press("ArrowRight")
    await expect(manualTab).toHaveAttribute("aria-selected", "true")
    await expect(manualTab).toBeFocused()
    await expect(manualTab).toHaveAttribute("tabindex", "0")
    await expect(panel).toHaveAttribute("aria-labelledby", (await manualTab.getAttribute("id")) ?? "")
    await expect(panel.getByRole("group", { name: "Duração Estudada" })).toBeVisible()

    await page.keyboard.press("ArrowRight") // circula de volta
    await expect(timer).toHaveAttribute("aria-selected", "true")
    await expect(timer).toBeFocused()
    await page.keyboard.press("ArrowLeft")
    await expect(manualTab).toHaveAttribute("aria-selected", "true")
    await page.keyboard.press("Home")
    await expect(timer).toHaveAttribute("aria-selected", "true")
    await expect(timer).toBeFocused()
    await page.keyboard.press("End")
    await expect(manualTab).toHaveAttribute("aria-selected", "true")
    await expect(manualTab).toBeFocused()
    // O modal continua aberto (teclas das abas não vazam para o diálogo).
    await expect(dialog(page)).toBeVisible()
  })

  test("Tab sai da lista de abas direto para o painel (uma única parada)", async ({ page }) => {
    await openModal(page)
    const d = dialog(page)
    await d.getByRole("tab", { name: "Cronômetro" }).focus()
    await page.keyboard.press("Tab")
    const insidePanel = await page.evaluate(() => {
      const panel = document.querySelector('[role="tabpanel"]')
      return !!panel && panel.contains(document.activeElement)
    })
    expect(insidePanel, "depois da aba ativa, o Tab vai para o conteúdo do painel").toBe(true)
  })
})

test.describe("Central de estudos — acessibilidade automática e tela pequena", () => {
  test("axe (WCAG A/AA): modo Cronômetro e modo Manual", async ({ page }) => {
    await openModal(page)
    await expectNoAxeViolations(page, { include: '[role="dialog"]' })
    await manual(page)
    await expectNoAxeViolations(page, { include: '[role="dialog"]' })
  })

  test("o modal cabe na tela e não cria rolagem horizontal", async ({ page }) => {
    await openModal(page)
    await expectInsideViewport(page, '[role="dialog"]')
    await manual(page)
    await expectNoHorizontalOverflow(page)
    await expect(dialog(page).getByRole("button", { name: "Salvar estudo" })).toBeVisible()
  })
})
