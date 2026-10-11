import type { Page } from "@playwright/test"

import { expect, expectNoHorizontalOverflow, test, unexpected } from "../support/test"

// G2.20 — /mentor (componentes reais) com contexto SINTÉTICO e respostas
// CONTROLADAS no lugar da Server Action. Nenhum LLM, banco ou sessão.

const FALLBACK = "Não foi possível gerar a análise agora. Seus dados continuam disponíveis na visão determinística do Mentor."

async function open(page: Page, state: string) {
  await page.goto(`/e2e-harness/mentor?state=${state}`)
  await expect(page.getByRole("heading", { name: "Mentor de estudos (harness E2E)" })).toBeAttached()
}
const generate = (page: Page) => page.getByRole("button", { name: /Gerar análise|Gerar novamente/ })
const requests = (page: Page) => page.evaluate(() => (window as unknown as { __mentorRequests?: number }).__mentorRequests ?? 0)

test.describe("Mentor — visão determinística", () => {
  test("conteúdo presente: fatos do sistema, pontos para acompanhar e próximos passos", async ({ page, pageErrors }) => {
    await open(page, "valid")
    await expect(page.getByText("Fatos do sistema")).toBeVisible()
    await expect(page.getByRole("heading", { name: "Seu momento atual" })).toBeVisible()
    await expect(page.getByText("Pontos para acompanhar")).toBeVisible()
    await expect(page.getByText("Próximos passos", { exact: true })).toBeVisible()
    await expect(page.getByText(/Calculados pelo sistema a partir dos seus dados \(sem IA\)/)).toBeVisible()
    await expectNoHorizontalOverflow(page)
    expect(unexpected(pageErrors)).toEqual([])
  })

  test("estado vazio: sem dados, nada de análise por IA", async ({ page }) => {
    await open(page, "empty")
    await expect(page.getByText("Dados insuficientes para avaliar sua evolução.")).toBeVisible()
    await expect(page.getByRole("heading", { name: "Análise do Mentor" })).toHaveCount(0)
  })

  test("IA desligada / fora do piloto: o bloco de IA não aparece e o Mentor funciona", async ({ page }) => {
    await open(page, "disabled")
    await expect(page.getByRole("heading", { name: "Seu momento atual" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Análise do Mentor" })).toHaveCount(0)
    await expect(page.getByText(/gerado por IA/)).toHaveCount(0)
  })
})

test.describe("Mentor — análise por IA (respostas controladas)", () => {
  test("carregando → resposta válida: dado do sistema separado da interpretação da IA; duplo clique = 1 pedido", async ({ page }) => {
    await open(page, "valid")
    await expect(page.getByText("Interpretação por IA")).toBeVisible()
    await generate(page).dblclick()
    await expect(page.getByRole("button", { name: "Gerando análise…" })).toBeDisabled()
    await expect(page.getByText("Analisando seu momento…")).toBeVisible()
    await expect(page.getByText(/Confiança (alta|média|baixa)/)).toBeVisible()
    expect(await requests(page)).toBe(1)
    await expect(page.getByText("Dado do sistema").first()).toBeVisible()
    await expect(page.getByText("Mentor (IA)").first()).toBeVisible()
    await expect(page.getByText(/Números, datas e nomes de disciplinas vêm sempre do sistema/)).toBeVisible()
    await expect(generate(page)).toHaveText("Gerar novamente")
    // Texto escrito pela IA não traz números (os números ficam nos "Dados do sistema").
    const aiTexts = await page.locator("p.border-l-2").allInnerTexts()
    expect(aiTexts.length).toBeGreaterThan(0)
    for (const t of aiTexts) expect(t.replace(/^Mentor \(IA\)|^Sugestão \(IA\)/, "")).not.toMatch(/\d|%/)
  })

  test("contexto LOW: aviso de análise limitada e confiança baixa", async ({ page }) => {
    await open(page, "low")
    await expect(page.getByText("Seus dados ainda são poucos: a análise será limitada.")).toBeVisible()
    await generate(page).click()
    await expect(page.getByText("Confiança baixa")).toBeVisible()
    await expect(page.getByText("Dados limitados")).toBeVisible()
  })

  for (const state of ["unavailable", "rejected", "error"] as const) {
    test(`falha (${state}) → fallback claro, sem detalhe técnico, Mentor continua na tela`, async ({ page }) => {
      await open(page, state)
      await generate(page).click()
      await expect(page.getByText(FALLBACK)).toBeVisible()
      await expect(page.getByRole("heading", { name: "Seu momento atual" })).toBeVisible()
      await expect(page.locator("body")).not.toContainText(/HTTP|\b500\b|INVALID_RESPONSE|PROVIDER_ERROR|stack/)
      await expect(generate(page), "dá para tentar de novo").toBeEnabled()
    })
  }

  test("timeout → explica a demora e cai no fallback", async ({ page }) => {
    await open(page, "timeout")
    await generate(page).click()
    await expect(page.getByText(/A análise demorou mais que o esperado\./)).toBeVisible()
    await expect(page.getByText(FALLBACK)).toBeVisible()
  })

  test("limite de uso → mensagem com o tempo de espera", async ({ page }) => {
    await open(page, "rate")
    await generate(page).click()
    await expect(page.getByText("Você atingiu o limite de análises por hora. Tente de novo em cerca de 20 min.")).toBeVisible()
  })
})
