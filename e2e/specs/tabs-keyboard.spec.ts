import type { Locator, Page } from "@playwright/test"

import { expectNoAxeViolations, type AxeException } from "../support/axe"
import { expect, expectNoHorizontalOverflow, test, unexpected } from "../support/test"

// G2.23 — abas, teclado e foco (padrão WAI-ARIA APG "Tabs") em Histórico,
// Planejamento e "Minha conta". Dados sintéticos dos harnesses; sem backend.
//
// Modelo de ativação (decisão por componente):
//  - Histórico e Planejamento: MANUAL — as visões buscam dados; as setas só
//    movem o foco, Enter/Espaço (ou clique) selecionam.
//  - Minha conta: AUTOMÁTICA e VERTICAL — seções locais, troca imediata.
// Emulação de navegador: não substitui validação com leitor de tela real.

const HISTORY = "/e2e-harness/history"
const PLANNING = "/e2e-harness/planning"

/** Painel associado à aba por aria-controls existe, está visível e é rotulado pela aba. */
async function expectPanelOf(page: Page, tab: Locator) {
  const tabId = await tab.getAttribute("id")
  const panelId = await tab.getAttribute("aria-controls")
  expect(tabId, "a aba precisa de id").toBeTruthy()
  expect(panelId, "a aba precisa de aria-controls").toBeTruthy()
  const panel = page.locator(`[id="${panelId}"]`)
  await expect(panel).toHaveCount(1)
  await expect(panel).toHaveAttribute("role", "tabpanel")
  await expect(panel).toHaveAttribute("aria-labelledby", tabId as string)
  await expect(panel).toBeVisible()
  return panel
}

/** Só a aba selecionada está na sequência de Tab (roving tabindex). */
async function expectRovingTabindex(tabs: Locator, selectedIndex: number) {
  const n = await tabs.count()
  for (let i = 0; i < n; i += 1) {
    await expect(tabs.nth(i)).toHaveAttribute("tabindex", i === selectedIndex ? "0" : "-1")
    await expect(tabs.nth(i)).toHaveAttribute("aria-selected", i === selectedIndex ? "true" : "false")
  }
}

/** Foco visível: o navegador marca :focus-visible e há indicador (anel/outline) desenhado. */
async function expectVisibleFocusIndicator(tab: Locator) {
  await expect(tab).toBeFocused()
  const info = await tab.evaluate((el) => {
    const s = getComputedStyle(el)
    return {
      focusVisible: el.matches(":focus-visible"),
      outline: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0,
      shadow: s.boxShadow !== "none",
    }
  })
  expect(info.focusVisible, "o foco por teclado deve casar :focus-visible").toBe(true)
  expect(info.outline || info.shadow, "deve haver anel/contorno de foco desenhado").toBe(true)
}

/** Toasts são transitórios e cobrem o topo no mobile: espera sumirem antes de clicar/medir contraste (no meio do fade a cor medida é falsa). */
async function waitForToastsGone(page: Page) {
  // O toast pode surgir depois do modal; dá uma chance de ele aparecer antes de esperar sumir
  // (evita checar "zero toasts" no instante anterior ao aparecimento).
  await page.locator("[data-sonner-toast]").first().waitFor({ state: "visible", timeout: 3_000 }).catch(() => undefined)
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 15_000 })
}

interface Spec {
  name: string
  url: string
  tablist: string
  tabNames: string[]
}

const HISTORY_SPEC: Spec = { name: "Histórico", url: HISTORY, tablist: "Visualização do histórico", tabNames: ["Lista", "Calendário"] }
const PLANNING_SPEC: Spec = {
  name: "Planejamento",
  url: PLANNING,
  tablist: "Visões do planejamento",
  tabNames: ["Ciclo", "Dia", "Semana", "Mês", "Metas e horas"],
}

for (const spec of [HISTORY_SPEC, PLANNING_SPEC]) {
  test.describe(`abas — ${spec.name} (ativação manual)`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(spec.url)
      await expect(page.getByRole("tablist", { name: spec.tablist })).toBeVisible()
    })

    test("1 · abas localizadas pelos nomes acessíveis; só uma selecionada; roving tabindex", async ({ page }) => {
      const tablist = page.getByRole("tablist", { name: spec.tablist })
      for (const name of spec.tabNames) await expect(tablist.getByRole("tab", { name })).toBeVisible()
      await expect(tablist.getByRole("tab")).toHaveCount(spec.tabNames.length)
      await expectRovingTabindex(tablist.getByRole("tab"), 0)
    })

    test("2/5/6 · Enter e Espaço selecionam; aria-selected e o painel acompanham", async ({ page }) => {
      const tablist = page.getByRole("tablist", { name: spec.tablist })
      const tabs = tablist.getByRole("tab")
      const second = tabs.nth(1)
      await second.focus()
      await page.keyboard.press("Enter")
      await expect(second).toHaveAttribute("aria-selected", "true")
      await expectRovingTabindex(tabs, 1)
      await expectPanelOf(page, second)

      const first = tabs.nth(0)
      await first.focus()
      await page.keyboard.press("Space")
      await expect(first).toHaveAttribute("aria-selected", "true")
      await expectRovingTabindex(tabs, 0)
      await expectPanelOf(page, first)
    })

    test("3/4 · setas e Home/End movem SÓ o foco (não selecionam), com circulação", async ({ page }) => {
      const tablist = page.getByRole("tablist", { name: spec.tablist })
      const tabs = tablist.getByRole("tab")
      const last = spec.tabNames.length - 1
      await tabs.nth(0).focus()

      await page.keyboard.press("ArrowRight")
      await expect(tabs.nth(1)).toBeFocused()
      await expectRovingTabindex(tabs, 0) // foco != seleção
      await page.keyboard.press("End")
      await expect(tabs.nth(last)).toBeFocused()
      await page.keyboard.press("ArrowRight") // dá a volta
      await expect(tabs.nth(0)).toBeFocused()
      await page.keyboard.press("ArrowLeft") // dá a volta ao contrário
      await expect(tabs.nth(last)).toBeFocused()
      await page.keyboard.press("Home")
      await expect(tabs.nth(0)).toBeFocused()
      await expectRovingTabindex(tabs, 0)
      // ↑/↓ não pertencem ao padrão horizontal: não movem o foco.
      await page.keyboard.press("ArrowDown")
      await expect(tabs.nth(0)).toBeFocused()
    })

    test("Tab entra na lista pela aba selecionada e sai para o painel (sem armadilha)", async ({ page }) => {
      const tabs = page.getByRole("tablist", { name: spec.tablist }).getByRole("tab")
      await tabs.nth(1).focus()
      await page.keyboard.press("Enter")
      await tabs.nth(0).focus()
      await page.keyboard.press("ArrowRight")
      await page.keyboard.press("ArrowRight") // foco longe da selecionada (1)
      await page.keyboard.press("Shift+Tab")
      await page.keyboard.press("Shift+Tab")
      // Voltando com Tab, entra na lista pela aba SELECIONADA, não pela focada por último.
      await page.keyboard.press("Tab")
      const focusedIsSelected = await page.evaluate(() => document.activeElement?.getAttribute("aria-selected"))
      expect(focusedIsSelected === "true" || (await page.evaluate(() => document.activeElement?.getAttribute("role"))) !== "tab").toBe(true)
      // Nenhuma armadilha: Tab repetido sai da lista.
      for (let i = 0; i < 4; i += 1) await page.keyboard.press("Tab")
      expect(await page.evaluate(() => document.activeElement?.closest('[role="tablist"]') === null)).toBe(true)
    })

    test("7 · foco visível na aba focada por teclado", async ({ page }) => {
      const tabs = page.getByRole("tablist", { name: spec.tablist }).getByRole("tab")
      await tabs.nth(0).focus()
      await page.keyboard.press("ArrowRight")
      await expectVisibleFocusIndicator(tabs.nth(1))
    })

    test("clique do mouse/toque seleciona e mantém o painel acessível", async ({ page }) => {
      const tabs = page.getByRole("tablist", { name: spec.tablist }).getByRole("tab")
      await tabs.nth(1).click()
      await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true")
      await expectPanelOf(page, tabs.nth(1))
      await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "false")
    })

    test("12 · cada aba selecionada tem painel visível e rotulado; só há um painel", async ({ page }) => {
      const tabs = page.getByRole("tablist", { name: spec.tablist }).getByRole("tab")
      const n = await tabs.count()
      for (let i = 0; i < n; i += 1) {
        await tabs.nth(i).click()
        await expect(tabs.nth(i)).toHaveAttribute("aria-selected", "true")
        const panel = await expectPanelOf(page, tabs.nth(i))
        await expect(page.getByRole("tabpanel")).toHaveCount(1)
        const box = await panel.boundingBox()
        expect(box && box.width > 0 && box.height > 0, `painel de "${spec.tabNames[i]}" ocupa espaço`).toBe(true)
        // Nenhum ancestral do painel esconde o conteúdo para a árvore de acessibilidade.
        expect(await panel.evaluate((el) => !el.closest("[hidden],[aria-hidden='true'],[inert]"))).toBe(true)
      }
    })

    test("trocar de aba NÃO leva o foco ao topo da página", async ({ page }) => {
      const tabs = page.getByRole("tablist", { name: spec.tablist }).getByRole("tab")
      await tabs.nth(1).focus()
      await page.keyboard.press("Enter")
      await expect(tabs.nth(1)).toBeFocused()
    })
  })
}

test.describe("Histórico — painel e estados de dados", () => {
  test("8 · vazio: abas continuam com nome, foco e painel; mensagem de vazio, sem métricas zeradas", async ({ page }) => {
    await page.goto(`${HISTORY}?state=empty`)
    const tablist = page.getByRole("tablist", { name: "Visualização do histórico" })
    await expect(tablist.getByRole("tab", { name: "Lista" })).toBeVisible()
    await expect(page.getByText("Nenhum estudo registrado")).toBeVisible()
    await expectPanelOf(page, tablist.getByRole("tab", { name: "Lista" }))
    await tablist.getByRole("tab", { name: "Lista" }).focus()
    await page.keyboard.press("ArrowRight")
    await expect(tablist.getByRole("tab", { name: "Calendário" })).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(tablist.getByRole("tab", { name: "Calendário" })).toHaveAttribute("aria-selected", "true")
    await expectPanelOf(page, tablist.getByRole("tab", { name: "Calendário" }))
  })

  test("9 · carregado: lista com registros no painel e Calendário no outro", async ({ page }) => {
    await page.goto(HISTORY)
    const tablist = page.getByRole("tablist", { name: "Visualização do histórico" })
    const list = await expectPanelOf(page, tablist.getByRole("tab", { name: "Lista" }))
    await expect(list.getByRole("button", { name: "Editar registro" }).first()).toBeVisible()
    await tablist.getByRole("tab", { name: "Calendário" }).click()
    const calendar = await expectPanelOf(page, tablist.getByRole("tab", { name: "Calendário" }))
    await expect(calendar.getByRole("button", { name: "Editar registro" })).toHaveCount(0)
  })

  test("erro recuperável na lista: mensagem visível e abas utilizáveis", async ({ page }) => {
    await page.goto(`${HISTORY}?state=error`)
    const tablist = page.getByRole("tablist", { name: "Visualização do histórico" })
    await expect(page.getByText("Não foi possível carregar seu histórico")).toBeVisible()
    await tablist.getByRole("tab", { name: "Lista" }).focus()
    await page.keyboard.press("End")
    await expect(tablist.getByRole("tab", { name: "Calendário" })).toBeFocused()
  })

  test("falha ao carregar o calendário não trava a aba: sai do carregamento e o painel segue acessível", async ({ page }) => {
    await page.goto(`${HISTORY}?state=calendar-error`)
    const tablist = page.getByRole("tablist", { name: "Visualização do histórico" })
    await tablist.getByRole("tab", { name: "Calendário" }).click()
    await expect(tablist.getByRole("tab", { name: "Calendário" })).toHaveAttribute("aria-selected", "true")
    await expect(page.getByText(/Erro ao carregar calendário/)).toBeVisible()
    await expectPanelOf(page, tablist.getByRole("tab", { name: "Calendário" }))
    // Volta para a Lista (pelo teclado) e tudo continua funcionando.
    await tablist.getByRole("tab", { name: "Calendário" }).focus()
    await page.keyboard.press("Home")
    await page.keyboard.press("Enter")
    await expectPanelOf(page, tablist.getByRole("tab", { name: "Lista" }))
  })

  test("foco: modal aberto de dentro do painel devolve o foco a quem o abriu", async ({ page }) => {
    await page.goto(HISTORY)
    const edit = page.getByRole("button", { name: "Editar registro" }).first()
    await edit.focus()
    await page.keyboard.press("Enter")
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    // 1º Esc pode só fechar a dica (tooltip) do botão focado; o modal fecha em seguida
    // (mesmo comportamento já coberto em study-register.spec.ts).
    await page.keyboard.press("Escape")
    if (await dialog.count()) await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    await expect(edit).toBeFocused()
  })
})

test.describe("Planejamento — painel e estados de dados", () => {
  test("9 · carregado: Ciclo mostra os blocos; trocar para Dia/Semana mantém painel e abas", async ({ page }) => {
    await page.goto(PLANNING)
    const tablist = page.getByRole("tablist", { name: "Visões do planejamento" })
    const cycle = await expectPanelOf(page, tablist.getByRole("tab", { name: "Ciclo" }))
    await expect(cycle.getByText("Língua Portuguesa").first()).toBeVisible()
    for (const name of ["Dia", "Semana", "Mês", "Metas e horas"]) {
      await tablist.getByRole("tab", { name }).click()
      await expect(tablist.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true")
      await expectPanelOf(page, tablist.getByRole("tab", { name }))
    }
  })

  test("8 · vazio: sem plano não há abas, e a tela explica o próximo passo", async ({ page }) => {
    await page.goto(`${PLANNING}?state=empty`)
    await expect(page.getByText("Nenhum planejamento criado")).toBeVisible()
    await expect(page.getByRole("tablist")).toHaveCount(0)
    await expect(page.getByRole("tabpanel")).toHaveCount(0)
  })
})

test.describe("abas verticais — Minha conta (ativação automática)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/e2e-harness/account-menu")
    await page.getByRole("button", { name: "Menu do usuário" }).click()
    await page.getByRole("menuitem", { name: "Minha conta" }).click()
    await expect(page.getByRole("dialog", { name: "Minha Conta" })).toBeVisible()
  })

  const SECTIONS = ["Dados Pessoais", "Preferências", "Ranking", "Categorias", "Notificações", "Segurança"]

  test("lista de seções vertical com nomes; painel rotulado pela aba ativa", async ({ page }) => {
    const tablist = page.getByRole("tablist", { name: "Seções da conta" })
    await expect(tablist).toHaveAttribute("aria-orientation", "vertical")
    for (const name of SECTIONS) await expect(tablist.getByRole("tab", { name })).toBeVisible()
    await expectRovingTabindex(tablist.getByRole("tab"), 0)
    await expectPanelOf(page, tablist.getByRole("tab", { name: "Dados Pessoais" }))
  })

  test("↑/↓/Home/End movem foco E seleção juntos; ←/→ não fazem nada", async ({ page }) => {
    const tablist = page.getByRole("tablist", { name: "Seções da conta" })
    const tabs = tablist.getByRole("tab")
    await tabs.nth(0).focus()
    await page.keyboard.press("ArrowDown")
    await expect(tabs.nth(1)).toBeFocused()
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true")
    await expectPanelOf(page, tabs.nth(1))
    await page.keyboard.press("ArrowRight")
    await expect(tabs.nth(1)).toBeFocused()
    await page.keyboard.press("End")
    await expect(tabs.nth(SECTIONS.length - 1)).toBeFocused()
    await expect(tabs.nth(SECTIONS.length - 1)).toHaveAttribute("aria-selected", "true")
    await page.keyboard.press("ArrowDown") // circula
    await expect(tabs.nth(0)).toBeFocused()
    await page.keyboard.press("ArrowUp")
    await expect(tabs.nth(SECTIONS.length - 1)).toBeFocused()
    await page.keyboard.press("Home")
    await expect(tabs.nth(0)).toBeFocused()
    await expectRovingTabindex(tabs, 0)
    await expectVisibleFocusIndicator(tabs.nth(0))
  })

  test("Esc fecha o modal e o foco volta ao botão do menu", async ({ page }) => {
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Menu do usuário" })).toBeFocused()
  })
})

// ---------------------------------------------------------------- responsivo
const SIZES = [
  { name: "320x480", width: 320, height: 480 },
  { name: "375x812", width: 375, height: 812 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1280x800", width: 1280, height: 800 },
] as const

test.describe("10 · abas em 320/375/768/1280", () => {
  for (const size of SIZES) {
    test(`Histórico e Planejamento em ${size.name}: sem overflow, abas visíveis e alvo de toque utilizável`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "a matriz define o tamanho de tela; roda uma vez")
      await page.setViewportSize({ width: size.width, height: size.height })
      for (const spec of [HISTORY_SPEC, PLANNING_SPEC]) {
        await page.goto(spec.url)
        const tabs = page.getByRole("tablist", { name: spec.tablist }).getByRole("tab")
        await expect(tabs.first()).toBeVisible()
        await expectNoHorizontalOverflow(page)
        for (let i = 0; i < spec.tabNames.length; i += 1) {
          const tab = tabs.nth(i)
          await tab.scrollIntoViewIfNeeded()
          const box = await tab.boundingBox()
          expect(box, `${spec.name} · ${spec.tabNames[i]} visível`).not.toBeNull()
          if (!box) continue
          expect(box.x, `${spec.name} · ${spec.tabNames[i]} dentro da janela (esq.)`).toBeGreaterThanOrEqual(-1)
          expect(box.x + box.width, `${spec.name} · ${spec.tabNames[i]} dentro da janela (dir.)`).toBeLessThanOrEqual(size.width + 1)
          expect(box.height, `${spec.name} · ${spec.tabNames[i]} alvo de toque`).toBeGreaterThanOrEqual(28)
        }
        await tabs.nth(1).click()
        await expectNoHorizontalOverflow(page)
        await expect(page.getByRole("tabpanel")).toBeVisible()
      }
    })

    test(`Minha conta em ${size.name}: seções acessíveis e painel visível`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "a matriz define o tamanho de tela; roda uma vez")
      await page.setViewportSize({ width: size.width, height: size.height })
      await page.goto("/e2e-harness/account-menu")
      await page.getByRole("button", { name: "Menu do usuário" }).click()
      await page.getByRole("menuitem", { name: "Minha conta" }).click()
      const dialog = page.getByRole("dialog", { name: "Minha Conta" })
      await expect(dialog).toBeVisible()
      const tabs = dialog.getByRole("tablist", { name: "Seções da conta" }).getByRole("tab")
      expect(await tabs.count()).toBe(6)
      for (let i = 0; i < 6; i += 1) {
        await tabs.nth(i).scrollIntoViewIfNeeded()
        await expect(tabs.nth(i)).toBeVisible()
      }
      await tabs.nth(1).click()
      await expect(dialog.getByRole("tabpanel")).toBeVisible()
      await expectNoHorizontalOverflow(page)
    })
  }
})

// ------------------------------------------------------------------- axe
// Única exceção (escopada por seletor, nunca a regra inteira): chips de disciplina
// do calendário usam a COR ESCOLHIDA PELO USUÁRIO como fundo com texto branco —
// o contraste depende do dado, não da semântica de abas. Limitação registrada em
// docs/g2-23-tabs-keyboard-accessibility-report.md (seção "Limitações").
const USER_COLOR_CHIP: AxeException = {
  rule: "color-contrast",
  selector: ".shadow-2xs.gap-1.text-white",
  reason: "cor de disciplina definida pelo usuário (dado) sob texto branco; não é defeito de abas",
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`11/13 · axe nas abas — tema ${scheme}`, () => {
    test.use({ colorScheme: scheme })

    async function expectScheme(page: Page) {
      if (scheme === "dark") await expect(page.locator("html")).toHaveClass(/\bdark\b/)
      else await expect(page.locator("html")).not.toHaveClass(/\bdark\b/)
    }

    test("Histórico: lista, calendário e vazio", async ({ page }) => {
      await page.goto(HISTORY)
      await expectScheme(page)
      const tablist = page.getByRole("tablist", { name: "Visualização do histórico" })
      await expect(page.getByRole("button", { name: "Editar registro" }).first()).toBeVisible()
      await expectNoAxeViolations(page)
      await tablist.getByRole("tab", { name: "Calendário" }).click()
      await expect(page.getByRole("tabpanel")).toBeVisible()
      await expectNoAxeViolations(page)
      await page.goto(`${HISTORY}?state=empty`)
      await expect(page.getByText("Nenhum estudo registrado")).toBeVisible()
      await expectNoAxeViolations(page)
    })

    test("Planejamento: Ciclo, Mês e Metas", async ({ page }) => {
      await page.goto(PLANNING)
      await expectScheme(page)
      const tablist = page.getByRole("tablist", { name: "Visões do planejamento" })
      await expect(page.getByRole("tabpanel")).toBeVisible()
      await expectNoAxeViolations(page)
      for (const name of ["Mês", "Metas e horas"]) {
        await tablist.getByRole("tab", { name }).click()
        await expect(tablist.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true")
        await expectNoAxeViolations(page, { exceptions: [USER_COLOR_CHIP] })
      }
    })

    test("Minha conta: seções", async ({ page }) => {
      await page.goto("/e2e-harness/account-menu")
      await expectScheme(page)
      await page.getByRole("button", { name: "Menu do usuário" }).click()
      await page.getByRole("menuitem", { name: "Minha conta" }).click()
      const dialog = page.getByRole("dialog", { name: "Minha Conta" })
      await expect(dialog).toBeVisible()
      await waitForToastsGone(page)
      await expectNoAxeViolations(page)
      await dialog.getByRole("tab", { name: "Preferências" }).click()
      await expect(dialog.getByRole("tab", { name: "Preferências" })).toHaveAttribute("aria-selected", "true")
      await expectNoAxeViolations(page)
    })
  })
}

test("sem erros inesperados de página nas telas de abas", async ({ page, pageErrors }) => {
  await page.goto(HISTORY)
  await page.getByRole("tab", { name: "Calendário" }).click()
  await page.goto(PLANNING)
  await page.getByRole("tab", { name: "Mês" }).click()
  expect(unexpected(pageErrors)).toEqual([])
})
