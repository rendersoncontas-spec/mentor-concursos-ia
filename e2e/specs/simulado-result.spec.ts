import { expectNoAxeViolations } from "../support/axe"
import { expect, expectNoHorizontalOverflow, test } from "../support/test"

// G2.22 — SimuladoResultView (resultado do simulado interno) com payload
// sintético: contraste (tema claro aqui; o escuro em accessibility-dark.spec.ts)
// e estados positivos/negativos que não dependem só da cor.
// Observação: nenhuma página real importa este componente hoje (Fase I.2).

test.describe("Resultado de simulado", () => {
  test("estado alto: valor, faixa e tendências com texto; axe (claro)", async ({ page }) => {
    await page.goto("/e2e-harness/simulado-result")
    await expect(page.getByRole("heading", { name: /Simulado de revisão/ })).toBeVisible()
    await expect(page.getByText("85%", { exact: true }).first()).toBeVisible()
    await expect(page.getByText("Excelente", { exact: true })).toBeVisible()
    await expect(page.getByText("melhorando · acertos")).toBeVisible()
    await expect(page.getByRole("progressbar", { name: "Respostas corretas" })).toBeVisible()
    await expectNoHorizontalOverflow(page)
    await expectNoAxeViolations(page)
  })

  test("estado baixo: questões correta/errada/em branco anunciadas sem depender da cor", async ({ page }) => {
    await page.goto("/e2e-harness/simulado-result?state=low")
    await expect(page.getByText("Baixo", { exact: true })).toBeVisible()
    await expect(page.getByText("caindo · acertos")).toBeVisible()
    await expect(page.getByRole("button", { name: /^Correta: Questão fictícia 1/ })).toBeVisible()
    const wrong = page.getByRole("button", { name: /^Errada: Questão fictícia 2.*marcada para revisão/ })
    await expect(wrong).toBeVisible()
    await expect(page.getByRole("button", { name: /^Em branco: Questão fictícia 3/ })).toBeVisible()
    await expect(wrong).toHaveAttribute("aria-expanded", "false")
    await wrong.click()
    await expect(wrong).toHaveAttribute("aria-expanded", "true")
    const panel = page.locator(`[id="${await wrong.getAttribute("aria-controls")}"]`)
    await expect(panel.getByText("(gabarito)")).toBeAttached()
    await expect(panel.getByText("(sua resposta, errada)")).toBeAttached()
    await expectNoAxeViolations(page)
  })
})
