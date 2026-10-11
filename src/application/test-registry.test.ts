import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

// G2.11 — os testes deste projeto são listados um a um no script `npm test`
// (package.json). Esquecer de registrar um arquivo faz ele nunca rodar: a
// auditoria da G2.11 encontrou 32 arquivos (424 testes) nessa situação, dois
// deles quebrados havia semanas sem ninguém perceber. Esta trava falha
// quando um *.test.ts existe em src/ mas não está no script.

function findTests(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) findTests(full, out)
    else if (name.endsWith(".test.ts")) out.push(full.split("\\").join("/"))
  }
  return out
}

test("todo arquivo *.test.ts de src/ está registrado no script npm test", () => {
  const script = (JSON.parse(readFileSync("package.json", "utf-8")) as { scripts: Record<string, string> }).scripts["test"] ?? ""
  const listed = new Set(script.split(/\s+/).filter((t) => t.endsWith(".test.ts")))
  const missing = findTests("src").filter((f) => !listed.has(f)).sort()
  assert.deepEqual(missing, [], `Registre no script "test" do package.json:\n${missing.join("\n")}`)
})

test("o script não lista arquivo de teste que não existe mais", () => {
  const script = (JSON.parse(readFileSync("package.json", "utf-8")) as { scripts: Record<string, string> }).scripts["test"] ?? ""
  const existing = new Set(findTests("src"))
  const stale = script.split(/\s+/).filter((t) => t.endsWith(".test.ts") && !existing.has(t))
  assert.deepEqual(stale, [])
})
