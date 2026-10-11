import { test as base, expect, type Page } from "@playwright/test"

/**
 * G2.20 — base dos testes E2E.
 * - Bloqueia QUALQUER requisição que não seja para 127.0.0.1/localhost
 *   (sem internet, sem Sentry, sem Supabase de verdade, sem LLM).
 * - Coleta erros de página/console; em falha, anexa ao relatório já
 *   saneados (sem tokens, JWT, cookies ou e-mails).
 */

const SECRETISH = [
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT
  /sb-[a-z0-9]+-auth-token[^\s;]*/gi,
  /(api[_-]?key|token|secret|password|senha)\s*[:=]\s*\S+/gi,
  /[\w.+-]+@[\w-]+\.[\w.-]+/g,
]
export function sanitize(text: string): string {
  return SECRETISH.reduce((t, re) => t.replace(re, "[removido]"), text).slice(0, 500)
}

type Fixtures = { pageErrors: string[]; consoleErrors: string[] }

export const test = base.extend<Fixtures>({
  context: async ({ context }, provide) => {
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url())
      const local = url.hostname === "127.0.0.1" || url.hostname === "localhost"
      if (!local || url.pathname.startsWith("/monitoring")) return route.abort()
      return route.continue()
    })
    await provide(context)
  },
  pageErrors: [
    async ({ page }, provide) => {
      const errors: string[] = []
      page.on("pageerror", (e) => errors.push(sanitize(`${e.name}: ${e.message}`)))
      await provide(errors)
    },
    { auto: true },
  ],
  consoleErrors: [
    async ({ page }, provide, testInfo) => {
      const errors: string[] = []
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(sanitize(m.text()))
      })
      await provide(errors)
      if (testInfo.status !== testInfo.expectedStatus && errors.length > 0) {
        await testInfo.attach("console-errors.txt", { body: errors.join("\n"), contentType: "text/plain" })
      }
    },
    { auto: true },
  ],
})

export { expect }

/** Sem rolagem horizontal na página (nada estourando a largura). */
export async function expectNoHorizontalOverflow(page: Page) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }))
  expect(scroll, "a página não deve rolar na horizontal").toBeLessThanOrEqual(client + 1)
}

/** O elemento cabe inteiro na janela visível. */
export async function expectInsideViewport(page: Page, selector: Parameters<Page["locator"]>[0]) {
  const box = await page.locator(selector).first().boundingBox()
  const vp = page.viewportSize()
  expect(box, "elemento visível").not.toBeNull()
  if (!box || !vp) return
  expect(box.x).toBeGreaterThanOrEqual(-1)
  expect(box.y).toBeGreaterThanOrEqual(-1)
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1)
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1)
}

/** Erros esperados no harness sem backend (Supabase local inexistente). */
export const EXPECTED_OFFLINE_NOISE = [/Failed to fetch/i, /ERR_CONNECTION_REFUSED/i, /net::ERR_FAILED/i, /fetch failed/i, /ERR_BLOCKED/i]
export function unexpected(errors: string[]): string[] {
  return errors.filter((e) => !EXPECTED_OFFLINE_NOISE.some((re) => re.test(e)))
}
