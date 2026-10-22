import type { Locator, Page } from "@playwright/test"

import { expectNoAxeViolations } from "../support/axe"
import { whenHydrated } from "../support/hydration"
import { expect, expectNoHorizontalOverflow, test, unexpected } from "../support/test"

// G2.24 — Edital verticalizado (EditalAccordion REAL) com disciplinas, tópicos
// e progresso SINTÉTICOS em memória. Harness `/e2e-harness/edital`.

const EDITAL = "/e2e-harness/edital"

async function open(page: Page, state = "data") {
  await page.goto(`${EDITAL}?state=${state}`)
  await expect(page.getByText("Progresso no edital").first()).toBeVisible()
}

/** Clica até a ação surtir efeito (em modo dev o 1º clique pode chegar antes da hidratação). */
async function clickUntil(trigger: Locator, effect: () => Promise<void>) {
  await whenHydrated(trigger)
  await expect(async () => {
    await trigger.click()
    await effect()
  }).toPass({ timeout: 20_000, intervals: [500, 1000, 2000] })
}

const overall = (page: Page) => page.getByText(/\d+ de \d+ tópicos concluídos/)
const discipline = (page: Page, name: string) => page.getByRole("heading", { level: 3, name })
const expandToggle = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^(Expandir|Recolher) ${name}$`) })

async function waitToasts(page: Page) {
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 15_000 })
}

test.describe("Edital — lista e progresso", () => {
  test("carregado: disciplinas, progresso geral vindo do servidor e primeira disciplina aberta", async ({ page }) => {
    await open(page)
    await expect(discipline(page, "Língua Portuguesa")).toBeVisible()
    await expect(discipline(page, "Contabilidade Geral")).toBeVisible()
    await expect(discipline(page, "Direito Tributário")).toBeVisible()
    await expect(overall(page)).toHaveText("1 de 6 tópicos concluídos")
    await expect(expandToggle(page, "Língua Portuguesa")).toHaveAttribute("aria-expanded", "true")
    await expect(page.getByRole("table")).toBeVisible()
    await expect(page.getByText(/COMPREENSÃO E INTERPRETAÇÃO DE TEXTOS/)).toBeVisible()
  })

  test("expandir/recolher uma disciplina usa aria-expanded e mostra/esconde a tabela", async ({ page }) => {
    await open(page)
    const toggle = expandToggle(page, "Contabilidade Geral")
    await expect(toggle).toHaveAttribute("aria-expanded", "false")
    await clickUntil(toggle, () => expect(toggle).toHaveAttribute("aria-expanded", "true", { timeout: 1500 }))
    await expect(page.getByText(/REGIME DE COMPETÊNCIA/)).toBeVisible()
    await toggle.click()
    await expect(toggle).toHaveAttribute("aria-expanded", "false")
    await expect(page.getByText(/REGIME DE COMPETÊNCIA/)).toHaveCount(0)
  })

  test("marcar um tópico como concluído atualiza o progresso e persiste no servidor sintético", async ({ page }) => {
    await open(page)
    const check = page.getByRole("button", { name: /Tópico concluído: PONTUAÇÃO E CONCORDÂNCIA/i })
    await clickUntil(check, () => expect(overall(page)).toHaveText("2 de 6 tópicos concluídos", { timeout: 1500 }))
    await expect(check).toHaveAttribute("aria-pressed", "true")
    // desfaz
    await check.click()
    await expect(overall(page)).toHaveText("1 de 6 tópicos concluídos")
  })

  test("falha ao salvar o progresso: a marcação é desfeita e o aluno é avisado", async ({ page }) => {
    await open(page, "save-error")
    const check = page.getByRole("button", { name: /Tópico concluído: PONTUAÇÃO E CONCORDÂNCIA/i })
    await clickUntil(check, () =>
      expect(page.locator("[data-sonner-toast]").filter({ hasText: "Falha simulada ao salvar." })).toBeVisible({ timeout: 1500 }),
    )
    await expect(overall(page)).toHaveText("1 de 6 tópicos concluídos")
  })

  test("falha ao LER o progresso não é apresentada como progresso real: aviso e tela utilizável", async ({ page }) => {
    await open(page, "progress-error")
    await expect(page.getByRole("status").filter({ hasText: "Não foi possível carregar seu progresso" })).toBeVisible()
    await expect(discipline(page, "Língua Portuguesa")).toBeVisible()
  })
})

test.describe("Edital — disciplinas e tópicos", () => {
  test("nova disciplina: sugestões, salvar e aparece na lista", async ({ page }) => {
    await open(page)
    await clickUntil(page.getByRole("button", { name: "Nova Disciplina" }), () =>
      expect(page.getByPlaceholder(/Nome da matéria/)).toBeVisible({ timeout: 1500 }),
    )
    const input = page.getByPlaceholder(/Nome da matéria/)
    await input.fill("Direito P")
    await expect(page.getByRole("button", { name: "Direito Penal" })).toBeVisible()
    await page.getByRole("button", { name: "Direito Penal" }).click()
    await expect(input).toHaveValue("Direito Penal")
    await page.getByRole("button", { name: "Salvar Matéria" }).click()
    await expect(discipline(page, "Direito Penal")).toBeVisible()
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Matéria adicionada com sucesso!" })).toBeVisible()
  })

  test("novo tópico personalizado em uma disciplina", async ({ page }) => {
    await open(page)
    const add = page.getByRole("button", { name: "Adicionar Tópico" })
    await clickUntil(add, () => expect(page.getByPlaceholder("Digite o nome do tópico...")).toBeVisible({ timeout: 1500 }))
    await page.getByPlaceholder("Digite o nome do tópico...").fill("Regência verbal")
    await page.getByRole("button", { name: "Salvar", exact: true }).click()
    await expect(page.getByText(/REGÊNCIA VERBAL/)).toBeVisible()
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Tópico adicionado!" })).toBeVisible()
  })

  test("excluir tópico personalizado pede confirmação e remove", async ({ page }) => {
    await open(page)
    page.once("dialog", (d) => void d.accept())
    const del = page.getByRole("button", { name: /Excluir tópico: CRASE/i })
    await clickUntil(del, () => expect(page.getByText(/CRASE \(TÓPICO PERSONALIZADO\)/)).toHaveCount(0, { timeout: 1500 }))
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Tópico removido!" })).toBeVisible()
  })

  test("excluir disciplina pede confirmação; se está em ciclos ativos, avisa que o ciclo não muda", async ({ page }) => {
    await open(page)
    page.once("dialog", (d) => void d.accept())
    const del = page.getByRole("button", { name: "Excluir Contabilidade Geral" })
    await clickUntil(del, () => expect(discipline(page, "Contabilidade Geral")).toHaveCount(0, { timeout: 1500 }))
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Matéria removida!" })).toBeVisible()
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: "ciclo ativo" })).toBeVisible()
  })

  test("recusar a confirmação não exclui nada", async ({ page }) => {
    await open(page)
    page.once("dialog", (d) => void d.dismiss())
    await page.getByRole("button", { name: "Excluir Direito Tributário" }).click()
    await page.waitForTimeout(400)
    await expect(discipline(page, "Direito Tributário")).toBeVisible()
  })

  test("link do caderno: URL inválida é recusada; URL https é salva e vira link 'Abrir'", async ({ page }) => {
    await open(page)
    const add = page.getByRole("button", { name: /Adicionar link do caderno de questões: PONTUAÇÃO/i })
    await clickUntil(add, () => expect(page.getByRole("dialog", { name: /Adicionar Link do Caderno/ })).toBeVisible({ timeout: 1500 }))
    const dialog = page.getByRole("dialog", { name: /Adicionar Link do Caderno/ })
    await dialog.getByPlaceholder(/https:\/\//).fill("javascript:alert(1)")
    await dialog.getByRole("button", { name: "Salvar Link" }).click()
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: "URL inválida" })).toBeVisible()
    await expect(dialog).toBeVisible()
    await dialog.getByPlaceholder(/https:\/\//).fill("https://example.com/caderno-2")
    await dialog.getByRole("button", { name: "Salvar Link" }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole("link", { name: /Abrir/ })).toHaveCount(2)
  })
})

for (const scheme of ["light", "dark"] as const) {
  test.describe(`Edital — axe (${scheme})`, () => {
    test.use({ colorScheme: scheme })

    test("lista aberta, disciplina recolhida e erro de leitura do progresso", async ({ page }) => {
      await open(page)
      await waitToasts(page)
      await expectNoAxeViolations(page)
      const toggle = expandToggle(page, "Contabilidade Geral")
      await clickUntil(toggle, () => expect(toggle).toHaveAttribute("aria-expanded", "true", { timeout: 1500 }))
      await expectNoAxeViolations(page)
      await open(page, "progress-error")
      await expect(page.getByRole("status").filter({ hasText: "Não foi possível carregar seu progresso" })).toBeVisible()
      await expectNoAxeViolations(page)
    })

    test("diálogo de link e formulários de nova disciplina/tópico", async ({ page }) => {
      await open(page)
      const add = page.getByRole("button", { name: /Adicionar link do caderno de questões: PONTUAÇÃO/i })
      await clickUntil(add, () => expect(page.getByRole("dialog", { name: /Adicionar Link do Caderno/ })).toBeVisible({ timeout: 1500 }))
      await expectNoAxeViolations(page)
      await page.keyboard.press("Escape")
      await expect(page.getByRole("dialog")).toHaveCount(0)
      await page.getByRole("button", { name: "Nova Disciplina" }).click()
      await expect(page.getByPlaceholder(/Nome da matéria/)).toBeVisible()
      await expectNoAxeViolations(page)
      await page.getByRole("button", { name: "Adicionar Tópico" }).click()
      await expect(page.getByPlaceholder("Digite o nome do tópico...")).toBeVisible()
      await expectNoAxeViolations(page)
    })
  })
}

const SIZES = [
  { name: "320x480", width: 320, height: 480 },
  { name: "375x812", width: 375, height: 812 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1280x800", width: 1280, height: 800 },
] as const

for (const size of SIZES) {
  test(`edital em ${size.name}: sem overflow horizontal da página`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "a matriz define o tamanho de tela; roda uma vez")
    await page.setViewportSize({ width: size.width, height: size.height })
    await open(page)
    await expect(page.getByRole("table")).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })
}

test("sem erros inesperados de página (progresso, disciplina e tópico)", async ({ page, pageErrors }) => {
  await open(page)
  const check = page.getByRole("button", { name: /Tópico concluído: PONTUAÇÃO E CONCORDÂNCIA/i })
  await clickUntil(check, () => expect(overall(page)).toHaveText("2 de 6 tópicos concluídos", { timeout: 1500 }))
  await page.getByRole("button", { name: "Nova Disciplina" }).click()
  await page.getByPlaceholder(/Nome da matéria/).fill("Informática")
  await page.getByRole("button", { name: "Salvar Matéria" }).click()
  await expect(discipline(page, "Informática")).toBeVisible()
  expect(unexpected(pageErrors)).toEqual([])
})
