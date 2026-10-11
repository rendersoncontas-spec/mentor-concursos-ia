import { expect, test, unexpected } from "../support/test"

// G2.20 — menu da conta (cabeçalho real, aluno sintético, sem sessão).

const ITEMS = ["Minha conta", "Minha assinatura", "Pedir um edital", "Editais cadastrados", "Instalar aplicativo"] as const

test.describe("menu da conta", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/e2e-harness/account-menu")
    await expect(page.getByRole("heading", { name: "Harness E2E — menu da conta" })).toBeVisible()
  })

  test("abre pelo avatar e lista os itens com nomes acessíveis, na ordem", async ({ page, pageErrors }) => {
    const trigger = page.getByRole("button", { name: "Menu do usuário" })
    await expect(trigger).toHaveAttribute("aria-haspopup", "menu")
    await expect(trigger).toHaveAttribute("aria-expanded", "false")
    await trigger.click()
    await expect(trigger).toHaveAttribute("aria-expanded", "true")
    const menu = page.getByRole("menu")
    for (const name of ITEMS) await expect(menu.getByRole("menuitem", { name })).toBeVisible()
    const names = (await menu.getByRole("menuitem").allInnerTexts()).map((t) => t.trim())
    expect(names.indexOf("Instalar aplicativo")).toBe(names.indexOf("Editais cadastrados") + 1)
    expect(names.at(-1)).toBe("Sair")
    expect(unexpected(pageErrors)).toEqual([])
  })

  test("fecha com Esc e ao clicar fora", async ({ page }) => {
    const trigger = page.getByRole("button", { name: "Menu do usuário" })
    await trigger.click()
    await expect(page.getByRole("menu")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("menu")).toHaveCount(0)
    await trigger.click()
    await expect(page.getByRole("menu")).toBeVisible()
    // Toque/clique numa área livre (canto inferior esquerdo, fora do menu).
    const vp = page.viewportSize() ?? { width: 800, height: 600 }
    await page.mouse.click(8, vp.height - 8)
    await expect(page.getByRole("menu")).toHaveCount(0)
  })

  test("teclado: foca o avatar, abre com Enter e percorre os itens com Tab", async ({ page }) => {
    const trigger = page.getByRole("button", { name: "Menu do usuário" })
    await trigger.focus()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("menu")).toBeVisible()
    const visited: string[] = []
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.press("Tab")
      const label = await page.evaluate(() => (document.activeElement?.textContent ?? "").trim())
      visited.push(label)
      if (label === "Instalar aplicativo") break
    }
    expect(visited).toEqual(expect.arrayContaining([...ITEMS]))
  })

  test("'Pedir um edital': campo obrigatório, envio com sucesso e fechamento", async ({ page }) => {
    await page.getByRole("button", { name: "Menu do usuário" }).click()
    await page.getByRole("menuitem", { name: "Pedir um edital" }).click()
    const dialog = page.getByRole("dialog", { name: "Solicitar novo edital" })
    await expect(dialog).toBeVisible()
    const input = dialog.getByPlaceholder("Ex: Auditor Fiscal - Receita Federal 2026")
    await expect(input).toBeFocused()
    // vazio: não envia e o modal continua aberto
    await dialog.getByRole("button", { name: "Enviar pedido" }).click()
    await expect(dialog).toBeVisible()
    await input.fill("Analista Judiciário — TRF 1")
    await dialog.getByRole("button", { name: "Enviar pedido" }).click()
    await expect(page.getByText("Solicitação de edital enviada com sucesso!")).toBeVisible()
    await expect(dialog).toHaveCount(0)
  })

  test("'Pedir um edital': Cancelar e Esc fecham sem enviar", async ({ page }) => {
    await page.getByRole("button", { name: "Menu do usuário" }).click()
    await page.getByRole("menuitem", { name: "Pedir um edital" }).click()
    const dialog = page.getByRole("dialog", { name: "Solicitar novo edital" })
    await dialog.getByPlaceholder("Ex: Auditor Fiscal - Receita Federal 2026").fill("algo")
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    await expect(page.getByText("Solicitação de edital enviada com sucesso!")).toHaveCount(0)
  })

  test("'Minha conta' abre o modal de conta; ao fechar, o foco volta ao botão do menu", async ({ page }) => {
    await page.getByRole("button", { name: "Menu do usuário" }).click()
    await page.getByRole("menuitem", { name: "Minha conta" }).click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Menu do usuário" })).toBeFocused()
  })

  test("'Pedir um edital': ao fechar, o foco volta ao botão do menu", async ({ page }) => {
    await page.getByRole("button", { name: "Menu do usuário" }).click()
    await page.getByRole("menuitem", { name: "Pedir um edital" }).click()
    await expect(page.getByRole("dialog", { name: "Solicitar novo edital" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("button", { name: "Menu do usuário" })).toBeFocused()
  })

  for (const [item, path] of [["Minha assinatura", "/assinatura"], ["Editais cadastrados", "/pedidos-editais"]] as const) {
    test(`'${item}' navega para ${path} (rota protegida: sem sessão vai ao login)`, async ({ page }) => {
      await page.getByRole("button", { name: "Menu do usuário" }).click()
      await page.getByRole("menuitem", { name: item }).click()
      await page.waitForURL((u) => u.pathname === path || (u.pathname === "/login" && u.searchParams.get("redirectedFrom") === path))
    })
  }
})
