import type { Page } from "@playwright/test"

import { expectNoAxeViolations } from "../support/axe"
import { expect, expectInsideViewport, expectNoHorizontalOverflow, test, unexpected } from "../support/test"

// G2.21 — /dashboard: a MESMA composição de page.tsx (cabeçalho, "Foco de
// hoje", grade de widgets) com snapshot/layout SINTÉTICOS
// (src/lib/testing/dashboard-fixtures.ts). Sem sessão: as poucas leituras que
// os widgets fazem sozinhos (cronograma do dia ao vivo, alvos) recebem o erro
// real da Server Action — exercitam o estado de erro recuperável.

async function open(page: Page, state = "data") {
  await page.goto(`/e2e-harness/dashboard?state=${state}`)
  await expect(page.getByRole("heading", { level: 1, name: "Olá, Estudante E2E" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible()
  // Espera a hidratação terminar (clicar antes dela não faz nada no React):
  // o DndContext da grade só monta no cliente e cria a descrição do arrastar.
  await expect(page.locator('[id^="DndDescribedBy-"]').first()).toBeAttached()
  await page.waitForLoadState("networkidle")
}
/** Fecha o modal com Esc. Se o foco inicial caiu num botão com dica (tooltip), o 1º Esc fecha a dica (camadas do Radix). */
async function escapeDialog(page: Page) {
  await page.keyboard.press("Escape")
  if (await page.getByRole("dialog").count()) await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
}
const foco = (page: Page) => page.getByRole("region", { name: "Foco de hoje" })

test.describe("Dashboard — com dados", () => {
  test("cabeçalho, ciclo, Estudos de Hoje e grade de widgets", async ({ page, pageErrors }) => {
    await open(page)
    await expect(page.getByRole("button", { name: "Adicionar estudo" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Receita Federal 2027" })).toBeVisible()
    // Ciclo (plano/ciclo): volta, matéria atual e próxima.
    await expect(foco(page).getByText("Ciclo Receita Federal")).toBeVisible()
    await expect(foco(page).getByText("3ª volta · 5 matérias · 32%")).toBeVisible()
    await expect(foco(page).getByRole("button", { name: "Continuar ciclo" })).toBeVisible()
    // Estudos de Hoje: cronograma do dia com estudo já lançado distribuído nos blocos.
    await expect(foco(page).getByRole("heading", { name: "Cronograma do dia" })).toBeVisible()
    await expect(foco(page).getByRole("heading", { level: 4, name: "Língua Portuguesa" })).toBeVisible()
    await expect(foco(page).getByText("35 de 60 min estudados")).toBeVisible()
    await expect(foco(page).getByRole("button", { name: "Iniciar" })).toBeVisible()
    // Grade
    await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible()
    await expect(page.getByText("Progresso no edital")).toBeVisible()
    await expect(page.getByText("Faltam 90 dias")).toBeVisible()
    await expectNoHorizontalOverflow(page)
    expect(unexpected(pageErrors)).toEqual([])
  })

  test("ranking e desempenho por matéria usam a mesma identidade das disciplinas", async ({ page }) => {
    await open(page)
    await expect(page.getByText(/#1\s*Contabilidade Geral/)).toBeVisible()
    for (const name of ["Língua Portuguesa", "Contabilidade Geral", "Direito Tributário", "Direito Constitucional", "Raciocínio Lógico"]) {
      await expect(page.getByRole("progressbar", { name: `Acerto em ${name}` })).toBeVisible()
    }
    await expect(page.getByText("60% · 210/350")).toBeVisible()
  })

  test("desempenho geral troca de período; calendário e dia navegam", async ({ page }) => {
    await open(page)
    await expect(page.getByText("Total (Semana): 200")).toBeVisible()
    const periods = page.getByRole("group", { name: "Período do desempenho" })
    await expect(periods.getByRole("button", { name: "Semana" })).toHaveAttribute("aria-pressed", "true")
    await periods.getByRole("button", { name: "Total", exact: true }).click()
    await expect(periods.getByRole("button", { name: "Total", exact: true })).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByText("Total (Total): 1240")).toBeVisible()

    await page.getByRole("button", { name: "Próximo dia" }).click()
    await expect(foco(page).getByRole("heading", { level: 4, name: "Direito Constitucional" })).toBeVisible()
    await page.getByRole("button", { name: "Dia anterior" }).click()
    await expect(foco(page).getByRole("heading", { level: 4, name: "Língua Portuguesa" })).toBeVisible()

    const monthLabel = page.getByText(/^(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro) \d{4}$/i)
    const before = await monthLabel.innerText()
    await page.getByRole("button", { name: "Mês anterior" }).click()
    await expect(monthLabel).not.toHaveText(before)
    await page.getByRole("button", { name: "Próximo mês" }).click()
    await expect(monthLabel).toHaveText(before)
  })

  test("cronograma ao vivo indisponível: aviso discreto e últimos dados salvos (não 'sem plano')", async ({ page }) => {
    await open(page)
    await expect(foco(page).getByText("Não foi possível atualizar o cronograma. Exibindo os últimos dados salvos.")).toBeVisible()
    await expect(foco(page).getByText("Nenhum planejamento ativo para esta data")).toHaveCount(0)
  })

  test("modais do cabeçalho e da grade: abrem, Esc fecha e o foco volta ao botão", async ({ page }) => {
    await open(page)
    const add = page.getByRole("button", { name: "Adicionar estudo" })
    await add.click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await expectInsideViewport(page, '[role="dialog"]')
    await escapeDialog(page)
    await expect(add).toBeFocused()

    const goals = page.getByRole("button", { name: "Editar metas semanais" })
    await goals.click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await escapeDialog(page)
    await expect(goals).toBeFocused()
  })
})

test.describe("Dashboard — vazio, falhas de leitura e carregamento", () => {
  test("conta nova: estados vazios explícitos, sem números inventados", async ({ page, pageErrors }) => {
    await open(page, "empty")
    await expect(foco(page).getByText("Nenhum ciclo ativo")).toBeVisible()
    await expect(foco(page).getByRole("button", { name: "Criar ciclo" })).toBeVisible()
    // Sem plano ativo o "Estudos de Hoje" não aparece (regra existente da grade).
    await expect(page.getByRole("heading", { name: "Cronograma do dia" })).toHaveCount(0)
    await expect(page.getByText("Nenhuma matéria disponível ainda.")).toBeVisible()
    await expect(page.getByText("Sem dados suficientes para o ranking.")).toBeVisible()
    await expect(page.getByText("Nenhuma prova cadastrada.")).toBeVisible()
    await expect(page.getByText("Nenhuma atividade registrada recentemente.")).toBeVisible()
    await expect(page.getByRole("button", { name: "Minha Prova" })).toBeVisible()
    await expectNoHorizontalOverflow(page)
    expect(unexpected(pageErrors)).toEqual([])
  })

  test("leitura do histórico falhou: widgets mostram indisponível/—, nunca zero", async ({ page, pageErrors }) => {
    await open(page, "issues")
    await expect(page.getByText("indisponível", { exact: true }).first()).toBeVisible()
    await expect(page.getByText("Ranking indisponível no momento.")).toBeVisible()
    await expect(page.getByText(/Hoje\s*0min/)).toHaveCount(0)
    await expect(page.getByText("Total (Semana): —")).toBeVisible()
    // Sem cache e sem leitura ao vivo: aviso de erro, não "dia de descanso".
    await expect(page.getByText("Não foi possível atualizar o cronograma.", { exact: false })).toBeVisible()
    expect(unexpected(pageErrors)).toEqual([])
  })

  test("carregando: o cabeçalho aparece antes e a grade chega depois do esqueleto", async ({ page }) => {
    await page.goto("/e2e-harness/dashboard?state=loading", { waitUntil: "commit" })
    await expect(page.getByRole("status", { name: "Carregando widgets do painel" })).toBeVisible()
    await expect(page.getByRole("heading", { level: 1, name: "Olá, Estudante E2E" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole("status", { name: "Carregando widgets do painel" })).toHaveCount(0)
  })
})

test.describe("Dashboard — acessibilidade automática", () => {
  test("axe (WCAG A/AA): com dados e vazio", async ({ page }) => {
    await open(page)
    await expect(foco(page).getByRole("heading", { name: "Cronograma do dia" })).toBeVisible()
    await expectNoAxeViolations(page)
    await open(page, "empty")
    await expectNoAxeViolations(page)
  })
})

// G2.22 — "75% Acurácia" no card "Desempenho geral" em 320 px: o par
// valor + rótulo aparece inteiro, numa linha só, dentro do card.
async function accuracyBox(page: Page) {
  return page.getByTestId("desempenho-acuracia").evaluate((el) => {
    const card = el.closest('[aria-roledescription="sortable"]')?.parentElement ?? el.parentElement
    const r = el.getBoundingClientRect()
    const c = (card as HTMLElement).getBoundingClientRect()
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 16
    const selector = el.parentElement?.querySelector('[role="group"]')?.getBoundingClientRect()
    return {
      text: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
      inside: r.left >= c.left - 0.5 && r.right <= c.right + 0.5,
      oneLine: r.height <= lineHeight * 1.5,
      sameRowAsSelector: selector ? Math.abs(selector.top + selector.height / 2 - (r.top + r.height / 2)) < 6 : null,
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }
  })
}

for (const size of [
  { width: 320, height: 480, mobile: true },
  { width: 1280, height: 800, mobile: false },
] as const) {
  test.describe(`Dashboard — "Acurácia" em ${size.width}px`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, isMobile: size.mobile, hasTouch: size.mobile })
    test(`valor e rótulo completos, numa linha, dentro do card (${size.width}px)`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "o tamanho vem do próprio teste")
      await open(page)
      const box = await accuracyBox(page)
      expect(box.text).toBe("75% Acurácia")
      expect(box.inside, "dentro do card").toBe(true)
      expect(box.oneLine, "numa linha só").toBe(true)
      expect(box.scrollW).toBeLessThanOrEqual(box.clientW)
      // No desktop o par continua ao lado do seletor de período (hierarquia preservada).
      if (size.width >= 1280) expect(box.sameRowAsSelector).toBe(true)
    })
  })
}
