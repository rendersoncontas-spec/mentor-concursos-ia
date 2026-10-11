import { expect, test, unexpected } from "../../support/test"

// G2.20 — OPCIONAL: só roda com E2E_AUTH=1, contra um Supabase LOCAL
// (`supabase start`) com um usuário de teste criado LÁ, e um storageState
// gerado por você (ver docs/e2e-browser-testing.md). Nunca contra produção:
// o playwright.config.ts recusa URL que não seja localhost.

const STORAGE = process.env["E2E_STORAGE_STATE"]
test.skip(!STORAGE, "defina E2E_STORAGE_STATE (sessão de teste do Supabase local)")
if (STORAGE) test.use({ storageState: STORAGE })

for (const [path, heading] of [["/dashboard", null], ["/mentor", "Mentor de estudos"], ["/simulados", null]] as const) {
  test(`${path} carrega autenticado, sem erro de página e sem rolagem horizontal`, async ({ page, pageErrors }) => {
    await page.goto(path)
    await expect(page).toHaveURL(new RegExp(path))
    if (heading) await expect(page.getByRole("heading", { name: heading })).toBeVisible()
    await expect(page.getByRole("button", { name: "Menu do usuário" })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
    expect(unexpected(pageErrors)).toEqual([])
  })
}
