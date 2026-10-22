import type { Locator, Page } from "@playwright/test"

import { expectNoAxeViolations } from "../support/axe"
import { whenHydrated } from "../support/hydration"
import { expect, expectNoHorizontalOverflow, test, unexpected } from "../support/test"

// G2.24 — Revisões (ReviewsView, sessão e "Adicionar tópico" REAIS) com dados
// SINTÉTICOS e estado em memória. Harness `/e2e-harness/reviews`.

const REVIEWS = "/e2e-harness/reviews"

async function open(page: Page, state = "data") {
  await page.goto(`${REVIEWS}?state=${state}`)
}

const queue = (page: Page) => page.getByRole("region", { name: "Fila de revisão" })
const summary = (page: Page) => page.getByRole("region", { name: "Resumo das revisões" })
const errorRegion = (page: Page) => page.getByRole("region", { name: "Erro ao carregar as revisões" })

/**
 * Clica até a ação surtir efeito: em modo dev o primeiro clique pode chegar antes
 * da hidratação e ser perdido — o que se mede aqui é a tela, não a corrida.
 */
async function clickUntil(trigger: Locator, effect: () => Promise<void>) {
  await whenHydrated(trigger)
  await expect(async () => {
    await trigger.click()
    await effect()
  }).toPass({ timeout: 20_000, intervals: [500, 1000, 2000] })
}

const startButton = (page: Page) => summary(page).getByRole("button", { name: "Iniciar revisão" })
const addButton = (page: Page) => summary(page).getByRole("button", { name: "Adicionar tópico" })
const sessionDialog = (page: Page) => page.getByRole("dialog", { name: "Revisão" })
const catalogDialog = (page: Page) => page.getByRole("dialog", { name: "Adicionar à revisão" })

async function startSession(page: Page) {
  await clickUntil(startButton(page), () => expect(sessionDialog(page)).toBeVisible({ timeout: 1500 }))
}

async function openCatalog(page: Page) {
  await clickUntil(addButton(page), () => expect(catalogDialog(page)).toBeVisible({ timeout: 1500 }))
}

async function waitToasts(page: Page) {
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 15_000 })
}

test.describe("Revisões — lista", () => {
  test("carregada: resumo, fila, próximas, suspensas e arquivadas", async ({ page }) => {
    await open(page)
    await expect(summary(page).getByText("Para revisar agora")).toBeVisible()
    await expect(queue(page).getByText("Concordância verbal")).toBeVisible()
    await expect(queue(page).getByText("Ativo imobilizado › Depreciação linear")).toBeVisible()
    await expect(page.getByRole("region", { name: "Próximas revisões" }).getByText("Crase")).toBeVisible()
    await expect(page.getByRole("region", { name: "Revisões suspensas" }).getByText("Sintaxe do período composto")).toBeVisible()
    await expect(page.getByRole("region", { name: "Revisões arquivadas" }).getByText("Princípio da legalidade")).toBeVisible()
    await expect(summary(page).getByRole("button", { name: "Iniciar revisão" })).toBeEnabled()
    await expect(errorRegion(page)).toHaveCount(0)
  })

  test("vazio: diz que não há revisões e oferece adicionar; iniciar fica desabilitado", async ({ page }) => {
    await open(page, "empty")
    await expect(page.getByText("Você não tem revisões agendadas.")).toBeVisible()
    await expect(queue(page).getByText("Nenhuma revisão para agora")).toBeVisible()
    await expect(summary(page).getByRole("button", { name: "Iniciar revisão" })).toBeDisabled()
    await expect(queue(page).getByRole("button", { name: "Adicionar tópico" })).toBeVisible()
    await expect(errorRegion(page)).toHaveCount(0)
  })

  test("erro de leitura NÃO vira 'você não tem revisões': aviso com 'Tentar novamente'", async ({ page }) => {
    await open(page, "error")
    const region = errorRegion(page)
    await expect(region.getByText("Não foi possível carregar suas revisões")).toBeVisible()
    await expect(region.getByRole("button", { name: "Tentar novamente" })).toBeEnabled()
    await expect(page.getByText("Você não tem revisões agendadas.")).toHaveCount(0)
    await expect(page.getByRole("region", { name: "Resumo das revisões" })).toHaveCount(0)
  })

  test("nova tentativa: a segunda leitura funciona e a fila aparece", async ({ page }) => {
    await open(page, "retry")
    await errorRegion(page).getByRole("button", { name: "Tentar novamente" }).click()
    await expect(errorRegion(page)).toHaveCount(0)
    await expect(queue(page).getByText("Concordância verbal")).toBeVisible()
  })
})

test.describe("Revisões — filtros e ações de item", () => {
  test("filtro 'Atrasadas' mantém só os itens atrasados e marca aria-pressed", async ({ page }) => {
    await open(page)
    const group = page.getByRole("group", { name: "Filtrar revisões por período" })
    const overdue = group.getByRole("button", { name: /Atrasadas/ })
    await overdue.click()
    await expect(overdue).toHaveAttribute("aria-pressed", "true")
    await expect(queue(page).getByText("Concordância verbal")).toBeVisible()
    await expect(queue(page).getByText("Imunidade tributária")).toHaveCount(0)
    await group.getByRole("button", { name: "Todas" }).click()
    await expect(queue(page).getByText("Imunidade tributária")).toBeVisible()
  })

  test("suspender, reativar e arquivar movem o item entre as seções", async ({ page }) => {
    await open(page)
    await queue(page).getByRole("button", { name: "Suspender Concordância verbal" }).click()
    const suspended = page.getByRole("region", { name: "Revisões suspensas" })
    await expect(suspended.getByText("Concordância verbal")).toBeVisible()
    await expect(queue(page).getByText("Concordância verbal")).toHaveCount(0)
    await suspended.getByRole("button", { name: "Arquivar Concordância verbal" }).click()
    const archived = page.getByRole("region", { name: "Revisões arquivadas" })
    await expect(archived.getByText("Concordância verbal")).toBeVisible()
    await archived.getByRole("button", { name: "Restaurar Concordância verbal" }).click()
    await expect(page.getByRole("region", { name: "Próximas revisões" }).getByText("Concordância verbal")).toBeVisible()
  })
})

test.describe("Revisões — sessão de revisão", () => {
  test("responder todos os cards: resumo da sessão com contagens e fechar atualiza a fila", async ({ page }) => {
    await open(page)
    await startSession(page)
    const dialog = sessionDialog(page)
    await expect(dialog.getByText("0 respondidas · 3 na fila")).toBeVisible()
    for (let i = 0; i < 3; i++) {
      await dialog.getByRole("button", { name: "Já tentei lembrar" }).click()
      await dialog.getByRole("button", { name: /^Bom — volta em/ }).click()
    }
    await expect(dialog.getByText("3 itens revisados.")).toBeVisible()
    await expect(dialog.getByText("Lembrei")).toBeVisible()
    await dialog.getByRole("button", { name: "Fechar" }).first().click()
    await expect(dialog).toHaveCount(0)
    await expect(queue(page).getByText("Nenhuma revisão para agora")).toBeVisible()
  })

  test("os botões de nota só aparecem depois de 'Já tentei lembrar' e têm nome com a previsão", async ({ page }) => {
    await open(page)
    await startSession(page)
    const dialog = sessionDialog(page)
    await expect(dialog.getByRole("button", { name: /Errei — volta em/ })).toHaveCount(0)
    await dialog.getByRole("button", { name: "Já tentei lembrar" }).click()
    for (const name of [/Errei — volta em 10 min/, /Difícil — volta em 1 dia/, /Bom — volta em 3 dias/, /Fácil — volta em 7 dias/]) {
      await expect(dialog.getByRole("button", { name })).toBeVisible()
    }
  })

  test("Esc fecha a sessão e o foco volta para a página", async ({ page }) => {
    await open(page)
    const start = startButton(page)
    await startSession(page)
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(start).toBeFocused()
  })

  test("falha ao iniciar a sessão: aviso e o diálogo não fica preso", async ({ page }) => {
    await open(page, "session-error")
    await clickUntil(startButton(page), () =>
      expect(page.locator("[data-sonner-toast]").filter({ hasText: "Não foi possível iniciar a sessão" })).toBeVisible({ timeout: 1500 }),
    )
    await expect(page.getByRole("dialog")).toHaveCount(0)
  })

  test("'Revisar agora' numa revisão próxima abre a sessão só com esse item", async ({ page }) => {
    await open(page)
    await page.getByRole("button", { name: "Revisar Crase agora" }).click()
    const dialog = page.getByRole("dialog", { name: "Revisão" })
    await expect(dialog.getByText("Crase", { exact: true })).toBeVisible()
    await expect(dialog.getByText("0 respondidas · 1 na fila")).toBeVisible()
  })
})

test.describe("Revisões — adicionar tópico", () => {
  test("catálogo: adicionar um tópico confirma e o item entra na fila", async ({ page }) => {
    await open(page)
    await openCatalog(page)
    const dialog = catalogDialog(page)
    await expect(dialog.getByText("Pontuação")).toBeVisible()
    await expect(dialog.getByText("Na revisão")).toBeVisible() // "Concordância verbal" já está
    await dialog.getByRole("button", { name: "Adicionar o tópico Pontuação à revisão" }).click()
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Pontuação adicionado às revisões." })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    await expect(queue(page).getByText("Pontuação")).toBeVisible()
  })

  test("busca filtra os tópicos pelo nome", async ({ page }) => {
    await open(page)
    await openCatalog(page)
    const dialog = catalogDialog(page)
    await dialog.getByLabel("Buscar tópico ou subtópico").fill("vírgula")
    await expect(dialog.getByText("Pontuação")).toBeVisible()
    await expect(dialog.getByText("Concordância verbal")).toHaveCount(0)
  })

  test("falha do catálogo ≠ 'nenhuma disciplina': mostra o erro", async ({ page }) => {
    await open(page, "catalog-error")
    await openCatalog(page)
    const dialog = catalogDialog(page)
    await expect(dialog.getByText("Não foi possível carregar suas disciplinas")).toBeVisible()
    await expect(dialog.getByText("Nenhuma disciplina cadastrada")).toHaveCount(0)
  })
})

for (const scheme of ["light", "dark"] as const) {
  test.describe(`Revisões — axe (${scheme})`, () => {
    test.use({ colorScheme: scheme })

    test("lista: carregada, vazia e com erro", async ({ page }) => {
      for (const state of ["data", "empty", "error"]) {
        await open(page, state)
        if (state === "error") await expect(errorRegion(page)).toBeVisible()
        else await expect(summary(page)).toBeVisible()
        await expectNoAxeViolations(page)
      }
    })

    test("sessão de revisão e adicionar tópico (diálogos)", async ({ page }) => {
      await open(page)
      await startSession(page)
      const session = sessionDialog(page)
      await expect(session.getByRole("button", { name: "Já tentei lembrar" })).toBeVisible()
      await expectNoAxeViolations(page)
      await session.getByRole("button", { name: "Já tentei lembrar" }).click()
      await expect(session.getByRole("button", { name: /^Bom — volta em/ })).toBeVisible()
      await expectNoAxeViolations(page)
      await page.keyboard.press("Escape")
      await expect(page.getByRole("dialog")).toHaveCount(0)
      await waitToasts(page)
      await openCatalog(page)
      await expect(catalogDialog(page).getByText("Pontuação")).toBeVisible()
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
  test(`lista, vazio e erro em ${size.name}: sem overflow horizontal; sessão cabe na tela`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "a matriz define o tamanho de tela; roda uma vez")
    await page.setViewportSize({ width: size.width, height: size.height })
    for (const state of ["data", "empty", "error"]) {
      await open(page, state)
      await expect(page.getByRole("main").or(page.locator("body"))).toBeVisible()
      await page.waitForTimeout(300)
      await expectNoHorizontalOverflow(page)
    }
    await open(page)
    await startSession(page)
    const dialog = sessionDialog(page)
    await expect(dialog.getByRole("button", { name: "Já tentei lembrar" })).toBeVisible()
    const box = await dialog.boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(-1)
      expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1)
    }
  })
}

test("sem erros inesperados de página (lista, sessão e catálogo)", async ({ page, pageErrors }) => {
  await open(page)
  await startSession(page)
  await page.getByRole("button", { name: "Já tentei lembrar" }).click()
  await page.getByRole("button", { name: /^Errei — volta em/ }).click()
  await page.keyboard.press("Escape")
  await openCatalog(page)
  await expect(page.getByText("Pontuação")).toBeVisible()
  expect(unexpected(pageErrors)).toEqual([])
})
