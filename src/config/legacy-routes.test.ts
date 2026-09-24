import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

import { LEGACY_ROUTE_REDIRECTS } from "./legacy-routes"

/**
 * Fase G.1 — rotas antigas do Dashboard: destino definido, sem loop, sem
 * links internos apontando para elas e sem revalidatePath inútil.
 */

const ROOT = process.cwd()
const APP = path.join(ROOT, "src/app")
const REDIRECTED = ["/dashboard/analytics", "/dashboard/performance", "/dashboard/questions"]
const KEPT = ["/dashboard/adaptive", "/dashboard/mentor", "/dashboard/homologation"]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

/** Rotas reais do App Router: cada page.tsx, sem os grupos "(x)". */
function appRoutes(): Set<string> {
  const routes = new Set<string>()
  for (const file of walk(APP)) {
    if (path.basename(file) !== "page.tsx") continue
    const segments = path
      .relative(APP, path.dirname(file))
      .split(path.sep)
      .filter((s) => s && !/^\(.*\)$/.test(s))
    routes.add("/" + segments.join("/"))
  }
  return routes
}

/** Remove comentários (bloco, JSX e de linha) para só olhar código. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
}

function productionSources(): Array<{ file: string; code: string }> {
  return walk(path.join(ROOT, "src"))
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
    .filter((f) => !f.endsWith(path.join("config", "legacy-routes.ts")))
    .map((f) => ({ file: path.relative(ROOT, f), code: stripComments(fs.readFileSync(f, "utf-8")) }))
}

describe("LEGACY_ROUTE_REDIRECTS", () => {
  it("as três rotas substituídas vão para /estatisticas com 307 (permanent: false)", () => {
    assert.deepEqual(
      LEGACY_ROUTE_REDIRECTS.map((r) => [r.source, r.destination, r.permanent]),
      REDIRECTED.map((s) => [s, "/estatisticas", false]),
    )
  })

  it("sem loop: nenhum destino é origem de outro redirect, e todo destino é uma página real", () => {
    const sources = new Set(LEGACY_ROUTE_REDIRECTS.map((r) => r.source))
    const routes = appRoutes()
    for (const r of LEGACY_ROUTE_REDIRECTS) {
      assert.equal(sources.has(r.destination), false, `${r.destination} redireciona de novo`)
      assert.ok(routes.has(r.destination), `${r.destination} não é uma página do app`)
    }
  })

  it("as rotas redirecionadas não têm mais página (o redirect é o único comportamento)", () => {
    const routes = appRoutes()
    for (const source of REDIRECTED) assert.equal(routes.has(source), false, `${source} ainda tem page.tsx`)
  })

  it("adaptive, mentor e homologation continuam como páginas e não são redirecionadas", () => {
    const routes = appRoutes()
    const sources = new Set(LEGACY_ROUTE_REDIRECTS.map((r) => r.source))
    for (const kept of KEPT) {
      assert.ok(routes.has(kept), `${kept} deveria existir`)
      assert.equal(sources.has(kept), false)
    }
  })

  it("next.config.ts aplica a lista em redirects()", () => {
    const config = fs.readFileSync(path.join(ROOT, "next.config.ts"), "utf-8")
    assert.ok(config.includes('import { LEGACY_ROUTE_REDIRECTS } from "./src/config/legacy-routes"'))
    assert.ok(/async redirects\(\)\s*\{\s*return LEGACY_ROUTE_REDIRECTS\.map/.test(config))
  })

  it("legacy-routes.ts não importa nada (é carregado pelo next.config)", () => {
    const source = fs.readFileSync(path.join(ROOT, "src/config/legacy-routes.ts"), "utf-8")
    assert.equal(/^import\s/m.test(source), false)
  })
})

describe("nenhuma referência de código às rotas redirecionadas", () => {
  it("sem href/push/revalidatePath/lista de rotas apontando para /dashboard/{analytics,performance,questions}", () => {
    const hits: string[] = []
    for (const { file, code } of productionSources()) {
      for (const route of REDIRECTED) {
        if (code.includes(`"${route}"`) || code.includes(`'${route}'`) || code.includes(`\`${route}`)) {
          hits.push(`${file}: ${route}`)
        }
      }
    }
    assert.deepEqual(hits, [])
  })

  it("a página mantida /dashboard/adaptive não linka mais para as rotas redirecionadas", () => {
    const page = stripComments(
      fs.readFileSync(path.join(APP, "(protected)/dashboard/adaptive/page.tsx"), "utf-8"),
    )
    for (const route of REDIRECTED) assert.equal(page.includes(route), false, route)
  })
})

describe("revalidatePath só aponta para rotas que existem", () => {
  // Rota inexistente já conhecida, fora do escopo da Fase G.1:
  // study-session.action.ts (salvamento de sessão — área protegida) revalida
  // "/home", que não existe. Registrado como DEFERIDO no relatório.
  const KNOWN_DEFERRED = new Set(["/home"])

  it("toda chamada revalidatePath(\"...\") e toda entrada das listas de revalidação é uma rota real", () => {
    const routes = appRoutes()
    const bad: string[] = []
    for (const { file, code } of productionSources()) {
      const targets = [...code.matchAll(/revalidatePath\(\s*["']([^"']+)["']/g)].map((m) => m[1] as string)
      for (const list of ["HISTORY_PATHS", "IMPORT_REVALIDATE_PATHS"]) {
        const start = code.indexOf(`const ${list} = [`)
        if (start === -1) continue
        const block = code.slice(start, code.indexOf("]", start))
        targets.push(...[...block.matchAll(/"([^"]+)"/g)].map((m) => m[1] as string))
      }
      for (const t of targets) {
        if (t === "/" || routes.has(t) || KNOWN_DEFERRED.has(t)) continue
        bad.push(`${file}: ${t}`)
      }
    }
    assert.deepEqual(bad, [])
  })
})
