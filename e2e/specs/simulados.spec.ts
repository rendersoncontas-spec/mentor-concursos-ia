import type { Page } from "@playwright/test"

import { expectNoAxeViolations } from "../support/axe"
import { expect, expectInsideViewport, expectNoHorizontalOverflow, test, unexpected } from "../support/test"

// G2.21 — /simulados: a TELA REAL (lista, métricas, filtros, evolução, modal de
// registro/edição, exclusão, detalhe, Estudo × desempenho) com o banco trocado
// por um duplo em memória. Gravação, validação, idempotência e leitura são as
// funções reais do servidor (src/lib/testing/fake-simulados-backend.ts).

async function open(page: Page, state = "data") {
  await page.goto(`/e2e-harness/simulados?state=${state}`)
  await expect(page.getByRole("heading", { name: "Simulados", exact: true })).toBeVisible()
  await expect(page.getByText("Carregando seus simulados…")).toHaveCount(0)
}
const calls = (page: Page, action: string) =>
  page.evaluate((a) => (window as unknown as { __simuladosCalls?: Record<string, number> }).__simuladosCalls?.[a] ?? 0, action)
const dialog = (page: Page) => page.getByRole("dialog")
const recordCount = (page: Page) => page.getByText(/^\d+ registros?$/)
const listItem = (page: Page, name: string) => page.getByRole("heading", { level: 4, name, exact: true })

async function openRegister(page: Page) {
  await page.getByRole("button", { name: "Registrar simulado" }).click()
  await expect(dialog(page).getByRole("heading", { name: "Registrar Simulado" })).toBeVisible()
}
async function fillGeneral(page: Page, name: string, q: number, c: number, b: number) {
  const d = dialog(page)
  await d.getByLabel("Nome do Simulado *").fill(name)
  await d.getByLabel("Questões *").fill(String(q))
  await d.getByLabel("Acertos").fill(String(c))
  await d.getByLabel("Em branco").fill(String(b))
}

test.describe("Simulados — lista, métricas e análise", () => {
  test("com registros: métricas, lista, evolução e desempenho por matéria", async ({ page, pageErrors }) => {
    await open(page)
    await expect(recordCount(page)).toHaveText("4 registros")
    for (const name of ["1º Simulado Receita Federal", "2º Simulado Receita Federal", "Simulado TCU — Estratégia", "3º Simulado Receita Federal"]) {
      await expect(listItem(page, name)).toBeVisible()
    }
    await expect(page.getByText("Simulados realizados")).toBeVisible()
    await expect(page.getByRole("heading", { name: "Evolução de acertos" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Desempenho por matéria", exact: true })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Estudo × desempenho por matéria" })).toBeVisible()
    await expect(page.getByText(/Gargalo atual:/)).toBeVisible()
    // Mais recente primeiro.
    const names = await page.getByRole("heading", { level: 4 }).allInnerTexts()
    expect(names[0]).toBe("3º Simulado Receita Federal")
    await expectNoHorizontalOverflow(page)
    expect(unexpected(pageErrors)).toEqual([])
  })

  test("evolução por matéria abre e fecha pelo teclado (aria-expanded)", async ({ page }) => {
    await open(page)
    const row = page.getByRole("button", { name: /^Contabilidade Geral \d+\/\d+ questões/ })
    await expect(row).toHaveAttribute("aria-expanded", "false")
    await row.focus()
    await page.keyboard.press("Enter")
    await expect(row).toHaveAttribute("aria-expanded", "true")
    const panel = page.locator(`#${await row.getAttribute("aria-controls")}`)
    await expect(panel.getByText("Evolução", { exact: true })).toBeVisible()
    await expect(panel.getByText("Primeiro", { exact: true })).toBeVisible()
    await page.keyboard.press("Space")
    await expect(row).toHaveAttribute("aria-expanded", "false")
  })

  test("filtros: período, concurso e desempenho recalculam a lista", async ({ page }) => {
    await open(page)
    await page.getByRole("group", { name: "Período" }).getByRole("button", { name: "7 dias" }).click()
    await expect(page.getByRole("button", { name: "7 dias" })).toHaveAttribute("aria-pressed", "true")
    await expect(recordCount(page)).toHaveText("1 registro")
    await expect(listItem(page, "3º Simulado Receita Federal")).toBeVisible()
    await page.getByRole("button", { name: "Todo período" }).click()
    await expect(recordCount(page)).toHaveText("4 registros")

    await page.getByLabel("Concurso", { exact: true }).selectOption("TCU")
    await expect(recordCount(page)).toHaveText("1 registro")
    await expect(listItem(page, "Simulado TCU — Estratégia")).toBeVisible()
    await page.getByLabel("Concurso", { exact: true }).selectOption("")

    await page.getByLabel("Matéria", { exact: true }).selectOption({ label: "Direito Tributário" })
    await expect(recordCount(page)).toHaveText("3 registros")
    await page.getByLabel("Matéria", { exact: true }).selectOption("")

    await page.getByLabel("Desempenho", { exact: true }).selectOption({ label: "Fraco" })
    await expect(recordCount(page)).toHaveText("1 registro")
    await expect(listItem(page, "1º Simulado Receita Federal")).toBeVisible()
  })

  test("detalhe: abre com o título do simulado, Esc fecha e o foco volta ao botão", async ({ page }) => {
    await open(page)
    const trigger = page.getByRole("button", { name: "Análise de Simulado TCU — Estratégia" })
    await trigger.click()
    await expect(dialog(page).getByRole("heading", { name: "Simulado TCU — Estratégia" })).toBeVisible()
    await expect(dialog(page).getByText("63 / 100")).toBeVisible()
    await expect(dialog(page).getByText("Prova longa; faltou tempo para revisar Contabilidade.")).toBeVisible()
    await expectInsideViewport(page, '[role="dialog"]')
    await page.keyboard.press("Escape")
    await expect(dialog(page)).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })

  test("estado vazio: mensagem e ação de registrar o primeiro simulado", async ({ page }) => {
    await open(page, "empty")
    await expect(page.getByRole("heading", { name: "Nenhum simulado registrado" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Evolução de acertos" })).toHaveCount(0)
    await page.getByRole("button", { name: "Registrar primeiro simulado" }).click()
    await expect(dialog(page).getByRole("heading", { name: "Registrar Simulado" })).toBeVisible()
  })
})

test.describe("Simulados — registrar, editar e excluir", () => {
  test("formulário: campos com rótulo, validação antes de enviar e erros calculados", async ({ page }) => {
    await open(page)
    await openRegister(page)
    const d = dialog(page)
    // Todos os campos têm nome acessível (G2.21: Fonte, Banca e Erros eram rótulos soltos).
    for (const label of ["Nome do Simulado *", "Concurso", "Cargo", "Data *", "Fonte", "Banca", "Tempo gasto (opcional)", "Questões *", "Acertos", "Em branco", "Erros (auto)", "Observações (opcional)"]) {
      await expect(d.getByLabel(label, { exact: true }), label).toHaveCount(1)
    }
    await expect(d.getByRole("button", { name: /Resultado geral/ })).toHaveAttribute("aria-pressed", "true")
    await expect(d.getByRole("group", { name: "Regra de pontuação" })).toBeVisible()

    // Sem nome: não envia, avisa e mantém o modal aberto.
    await d.getByRole("button", { name: "Salvar simulado" }).click()
    await expect(page.getByText("Informe o nome do simulado.")).toBeVisible()
    expect(await calls(page, "saveRecord")).toBe(0)

    await fillGeneral(page, "Simulado de validação", 10, 12, 0)
    await expect(d.getByLabel("Erros (auto)")).toHaveText("0")
    await d.getByRole("button", { name: "Salvar simulado" }).click()
    await expect(page.getByText("Acertos + erros + brancos deve ser igual ao total de questões.")).toBeVisible()

    await d.getByLabel("Acertos").fill("6")
    await d.getByLabel("Em branco").fill("1")
    await expect(d.getByLabel("Erros (auto)")).toHaveText("3")
    await d.getByLabel("Tempo gasto (opcional)").fill("duas horas")
    await d.getByRole("button", { name: "Salvar simulado" }).click()
    await expect(page.getByText("Tempo gasto inválido. Use o formato HH:MM:SS.")).toBeVisible()
    expect(await calls(page, "saveRecord")).toBe(0)
    await expect(d.getByLabel("Nome do Simulado *")).toHaveValue("Simulado de validação")
  })

  test("registrar: carregando → sucesso; duplo clique grava uma vez só", async ({ page }) => {
    await open(page, "save-slow")
    await openRegister(page)
    await fillGeneral(page, "4º Simulado Receita Federal", 50, 35, 5)
    await dialog(page).getByLabel("Tempo gasto (opcional)").fill("02:15:30")
    await dialog(page).getByRole("button", { name: "Salvar simulado" }).dblclick()
    await expect(dialog(page).getByRole("button", { name: "Salvando..." })).toBeDisabled()
    await expect(page.getByText("Simulado registrado com sucesso!")).toBeVisible()
    await expect(dialog(page)).toHaveCount(0)
    expect(await calls(page, "saveRecord")).toBe(1)
    await expect(recordCount(page)).toHaveText("5 registros")
    await expect(listItem(page, "4º Simulado Receita Federal")).toBeVisible()
  })

  test("registrar detalhado por matéria: escolhe matéria do catálogo e preenche pela linha rotulada", async ({ page }) => {
    await open(page)
    await openRegister(page)
    const d = dialog(page)
    await d.getByLabel("Nome do Simulado *").fill("Simulado de Raciocínio")
    await d.getByRole("button", { name: /Detalhar por matéria/ }).click()
    await expect(d.getByRole("button", { name: /Detalhar por matéria/ })).toHaveAttribute("aria-pressed", "true")
    await d.getByRole("combobox", { name: "+ Adicionar matéria" }).click()
    await page.getByRole("option", { name: /Raciocínio Lógico/ }).click()
    await d.getByLabel("Questões — Raciocínio Lógico").fill("20")
    await d.getByLabel("Acertos — Raciocínio Lógico").fill("15")
    await d.getByLabel("Em branco — Raciocínio Lógico").fill("1")
    await expect(d.getByText("1 matérias • 20 questões • 15 acertos")).toBeVisible()
    await d.getByRole("button", { name: "Salvar simulado" }).click()
    await expect(page.getByText("Simulado registrado com sucesso!")).toBeVisible()
    await expect(recordCount(page)).toHaveText("5 registros")
    // G2.23: espera o modal de registro FECHAR antes de abrir a análise. Sem isso o
    // clique podia cair enquanto o modal anterior ainda saía (falhava ~1 em 12,
    // nos dois projetos) e a análise nunca abria.
    await expect(dialog(page)).toHaveCount(0)
    await page.getByRole("button", { name: "Análise de Simulado de Raciocínio" }).click()
    await expect(dialog(page).getByText("15 / 20")).toBeVisible()
  })

  test("editar: abre preenchido e salva alterações", async ({ page }) => {
    await open(page)
    await page.getByRole("button", { name: "Editar 2º Simulado Receita Federal" }).click()
    const d = dialog(page)
    await expect(d.getByRole("heading", { name: "Editar Simulado" })).toBeVisible()
    await expect(d.getByLabel("Nome do Simulado *")).toHaveValue("2º Simulado Receita Federal")
    await d.getByLabel("Nome do Simulado *").fill("2º Simulado Receita Federal (revisado)")
    await d.getByRole("button", { name: "Salvar alterações" }).click()
    await expect(page.getByText("Simulado atualizado!")).toBeVisible()
    await expect(listItem(page, "2º Simulado Receita Federal (revisado)")).toBeVisible()
    await expect(recordCount(page)).toHaveText("4 registros")
  })

  test("excluir: cancelar no confirm não apaga; confirmar apaga", async ({ page }) => {
    await open(page)
    const del = page.getByRole("button", { name: "Excluir 1º Simulado Receita Federal" })
    page.once("dialog", (dlg) => {
      expect(dlg.message()).toBe("Excluir este simulado permanentemente?")
      void dlg.dismiss()
    })
    await del.click()
    await expect(recordCount(page)).toHaveText("4 registros")
    expect(await calls(page, "deleteRecord")).toBe(0)

    page.once("dialog", (dlg) => void dlg.accept())
    await del.click()
    await expect(page.getByText("Simulado excluído.")).toBeVisible()
    await expect(recordCount(page)).toHaveText("3 registros")
    await expect(listItem(page, "1º Simulado Receita Federal")).toHaveCount(0)
  })
})

test.describe("Simulados — erros recuperáveis", () => {
  test("falha ao carregar: mostra erro com 'Tentar novamente', nunca o estado vazio", async ({ page, pageErrors }) => {
    await open(page, "load-error")
    await expect(page.getByRole("alert").getByText("Não foi possível carregar seus simulados")).toBeVisible()
    await expect(page.getByText("Nenhum simulado registrado")).toHaveCount(0)
    await page.getByRole("button", { name: "Tentar novamente" }).click()
    await expect.poll(() => calls(page, "getRecords")).toBeGreaterThanOrEqual(2)
    expect(unexpected(pageErrors)).toEqual([])
  })

  test("chamada rejeitada (rede): sem spinner preso e sem stack trace na tela", async ({ page, pageErrors }) => {
    await open(page, "load-reject")
    await expect(page.getByRole("alert").getByText(/Verifique sua conexão/)).toBeVisible()
    await expect(page.getByText("Carregando seus simulados…")).toHaveCount(0)
    await expect(page.getByText(/falha de rede simulada|Error:|at\s+\w+\s+\(/)).toHaveCount(0)
    expect(unexpected(pageErrors)).toEqual([])
  })

  test("erro ao salvar: avisa, mantém os dados digitados e reabilita o botão", async ({ page }) => {
    await open(page, "save-error")
    await openRegister(page)
    await fillGeneral(page, "Simulado que falha", 30, 20, 2)
    await dialog(page).getByRole("button", { name: "Salvar simulado" }).click()
    await expect(page.getByText("Erro ao registrar simulado. Tente novamente.")).toBeVisible()
    await expect(dialog(page).getByLabel("Nome do Simulado *")).toHaveValue("Simulado que falha")
    await expect(dialog(page).getByRole("button", { name: "Salvar simulado" })).toBeEnabled()
    await expect(page.getByText("Simulado registrado com sucesso!")).toHaveCount(0)
    await page.keyboard.press("Escape")
    await expect(recordCount(page)).toHaveText("4 registros")
  })

  test("salvar rejeitado (rede): mensagem genérica, dados preservados, retry possível", async ({ page, pageErrors }) => {
    await open(page, "save-reject")
    await openRegister(page)
    await fillGeneral(page, "Simulado sem rede", 30, 20, 2)
    await dialog(page).getByRole("button", { name: "Salvar simulado" }).click()
    await expect(page.getByText("Erro inesperado ao salvar simulado.")).toBeVisible()
    await expect(dialog(page).getByLabel("Nome do Simulado *")).toHaveValue("Simulado sem rede")
    await dialog(page).getByRole("button", { name: "Salvar simulado" }).click()
    await expect.poll(() => calls(page, "saveRecord")).toBe(2)
    expect(unexpected(pageErrors)).toEqual([])
  })

  test("erro ao excluir: avisa e mantém o registro", async ({ page }) => {
    await open(page, "delete-error")
    page.once("dialog", (dlg) => void dlg.accept())
    await page.getByRole("button", { name: "Excluir 3º Simulado Receita Federal" }).click()
    await expect(page.getByText("Não foi possível excluir o simulado.")).toBeVisible()
    await expect(recordCount(page)).toHaveText("4 registros")
    await expect(page.getByRole("button", { name: "Excluir 3º Simulado Receita Federal" })).toBeEnabled()
  })

  test("Estudo × desempenho com erro: alerta na seção, resto da página funciona", async ({ page }) => {
    await open(page, "perf-error")
    await expect(page.getByRole("alert").getByText("Não foi possível calcular o desempenho agora.")).toBeVisible()
    await expect(recordCount(page)).toHaveText("4 registros")
  })
})

test.describe("Simulados — teclado, foco e acessibilidade automática", () => {
  test("teclado: abre o registro com Enter, foco dentro do modal, Esc fecha e devolve o foco", async ({ page }) => {
    await open(page)
    const trigger = page.getByRole("button", { name: "Registrar simulado" })
    await trigger.focus()
    await page.keyboard.press("Enter")
    await expect(dialog(page)).toBeVisible()
    const inside = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))
    expect(inside, "o foco inicial fica dentro do modal").toBe(true)
    // Tab/Shift+Tab não escapam do modal (focus trap).
    for (let i = 0; i < 25; i++) await page.keyboard.press("Tab")
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true)
    for (let i = 0; i < 5; i++) await page.keyboard.press("Shift+Tab")
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true)
    await page.keyboard.press("Escape")
    await expect(dialog(page)).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })

  test("axe (WCAG A/AA): página com dados, modal de registro e detalhe", async ({ page }) => {
    await open(page)
    await expect(page.getByRole("heading", { name: "Estudo × desempenho por matéria" })).toBeVisible()
    await expect(page.getByText("Calculando…")).toHaveCount(0)
    await expectNoAxeViolations(page)
    await openRegister(page)
    await expectNoAxeViolations(page, { include: '[role="dialog"]' })
    await page.keyboard.press("Escape")
    await page.getByRole("button", { name: "Análise de 3º Simulado Receita Federal" }).click()
    await expect(dialog(page)).toBeVisible()
    await expectNoAxeViolations(page, { include: '[role="dialog"]' })
  })

  test("axe (WCAG A/AA): estado vazio e estado de erro", async ({ page }) => {
    await open(page, "empty")
    await expectNoAxeViolations(page)
    await open(page, "load-error")
    await expect(page.getByRole("alert").filter({ hasText: "Não foi possível" })).toBeVisible()
    await expectNoAxeViolations(page)
  })
})
