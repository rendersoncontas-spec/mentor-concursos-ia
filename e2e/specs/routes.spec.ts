import { expect, test } from "../support/test"

// G2.20 — rotas reais sem sessão (Supabase local inexistente): a proteção
// continua valendo e nada de conteúdo do aluno vaza. O conteúdo autenticado
// de /dashboard, /mentor e /simulados fica em specs/authenticated (opcional).

test.describe("rotas protegidas sem sessão", () => {
  for (const path of ["/dashboard", "/mentor", "/simulados", "/estatisticas", "/dashboard/mentor"]) {
    test(`${path} → login, sem conteúdo protegido`, async ({ page }) => {
      await page.goto(path)
      await page.waitForURL((u) => u.pathname === "/login")
      expect(new URL(page.url()).searchParams.get("redirectedFrom")).toBe(path)
      await expect(page.getByRole("button", { name: /Entrar na Plataforma/ })).toBeVisible()
      await expect(page.getByText("Seu momento atual")).toHaveCount(0)
      await expect(page.getByText("Análise do Mentor")).toHaveCount(0)
    })
  }
})

test.describe("login (formulário real, sem backend)", () => {
  test("campos com rótulo; validação; envio sem servidor de auth mostra erro e preserva o e-mail", async ({ page }) => {
    await page.goto("/login")
    const email = page.getByLabel("E-mail")
    const password = page.getByLabel("Senha", { exact: true })
    await expect(email).toBeVisible()
    await expect(password).toBeVisible()
    const submit = page.getByRole("button", { name: /Entrar na Plataforma/ })
    await submit.click()
    await expect(page.getByText("O e-mail é obrigatório.")).toBeVisible()
    await email.fill("nao-e-um-email")
    await password.fill("123")
    await submit.click()
    await expect(page.getByText("E-mail inválido.")).toBeVisible()
    await expect(page.getByText("A senha deve ter pelo menos 6 caracteres.")).toBeVisible()
    await email.fill("aluno.teste@exemplo.invalid")
    await password.fill("senha-de-teste-123")
    await submit.click()
    // Sem servidor de autenticação (endereço local inexistente): erro tratado, sem travar.
    await expect(page.locator("[data-sonner-toast]").first()).toBeVisible({ timeout: 20_000 })
    await expect(page).toHaveURL(/\/login/)
    await expect(email).toHaveValue("aluno.teste@exemplo.invalid")
    await expect(submit).toBeEnabled()
  })
})

test.describe("manifest do app", () => {
  test("público, válido para instalação e com ícones acessíveis", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest")
    expect(res.status()).toBe(200)
    const m = (await res.json()) as { name: string; short_name: string; start_url: string; scope: string; display: string; icons: { src: string; sizes: string }[] }
    expect(m).toMatchObject({ name: "NomeIA", short_name: "NomeIA", start_url: "/dashboard", scope: "/", display: "standalone" })
    for (const size of ["192x192", "512x512"]) expect(m.icons.some((i) => i.sizes === size)).toBe(true)
    for (const icon of m.icons) {
      const r = await request.get(icon.src)
      expect(r.status(), icon.src).toBe(200)
      expect(r.headers()["content-type"]).toContain("image/png")
    }
  })
})
