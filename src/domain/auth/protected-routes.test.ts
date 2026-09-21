import assert from "node:assert/strict"
import test from "node:test"

import { isProtectedPath, PROTECTED_ROUTE_PREFIXES } from "./protected-routes"

// Toda rota real de src/app/(protected)/**/page.tsx (levantada manualmente em
// 2026-09 durante o QA funcional). Se uma rota nova for adicionada aqui e o
// middleware nao for atualizado, este teste falha - e' a rede de seguranca
// contra a lacuna que permitia acesso anonimo a /assinatura, /disciplines,
// /doacao, /edital, /pedidos-editais e /study-plan.
const REAL_PROTECTED_PAGES = [
  "/admin",
  "/admin/users/abc123",
  "/assinatura",
  "/biblioteca",
  "/ciclos",
  "/concursos",
  "/conquistas",
  "/dashboard",
  "/dashboard/adaptive",
  "/dashboard/analytics",
  "/dashboard/history",
  "/dashboard/homologation",
  "/dashboard/mentor",
  "/dashboard/performance",
  "/dashboard/questions",
  "/dashboard/reviews",
  "/dashboard/study-session",
  "/disciplines",
  "/doacao",
  "/edital",
  "/estatisticas",
  "/onboarding",
  "/pedidos-editais",
  "/planejamento",
  "/planos",
  "/profile",
  "/ranking",
  "/simulados",
  "/study-plan",
]

test("isProtectedPath: cobre todas as rotas reais de src/app/(protected)", () => {
  for (const path of REAL_PROTECTED_PAGES) {
    assert.equal(isProtectedPath(path), true, `rota protegida real nao coberta pelo middleware: ${path}`)
  }
})

test("isProtectedPath: nao marca rotas publicas/de auth como protegidas", () => {
  assert.equal(isProtectedPath("/login"), false)
  assert.equal(isProtectedPath("/register"), false)
  assert.equal(isProtectedPath("/forgot-password"), false)
  assert.equal(isProtectedPath("/"), false)
})

test("isProtectedPath: bug encontrado no QA funcional (2026-09) - regressao", () => {
  // Estas 7 rotas existiam como paginas reais mas nao estavam na lista do
  // middleware antes da correcao; usuario anonimo conseguia abri-las sem
  // ser redirecionado para /login.
  assert.equal(isProtectedPath("/assinatura"), true)
  assert.equal(isProtectedPath("/ciclos"), true)
  assert.equal(isProtectedPath("/disciplines"), true)
  assert.equal(isProtectedPath("/doacao"), true)
  assert.equal(isProtectedPath("/edital"), true)
  assert.equal(isProtectedPath("/pedidos-editais"), true)
  assert.equal(isProtectedPath("/study-plan"), true)
})

test("PROTECTED_ROUTE_PREFIXES: nao tem prefixos duplicados", () => {
  const unique = new Set(PROTECTED_ROUTE_PREFIXES)
  assert.equal(unique.size, PROTECTED_ROUTE_PREFIXES.length)
})
