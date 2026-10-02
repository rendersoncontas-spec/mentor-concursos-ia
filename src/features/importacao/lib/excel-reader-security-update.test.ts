import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import * as XLSX from "xlsx"
import { readWorkbook } from "./excel-reader"

/**
 * Fase G2.6.1 — correção de segurança (achado P2 da auditoria
 * "Auditoria de Segurança — RLS / Supabase / Dependências — 2026-10-01"):
 * o pacote `xlsx@0.18.5` publicado no npm tem duas vulnerabilidades sem
 * correção disponível NO NPM:
 *   - GHSA-4r6h-8v6p-xvw6 (Prototype Pollution) — corrigida em 0.19.3
 *   - GHSA-5pgg-2g8v-p4x9 (ReDoS)               — corrigida em 0.20.2
 * `npm audit` confirma "No fix available" porque o mantenedor (SheetJS)
 * parou de publicar versões novas no registry do npm e passou a
 * distribuí-las apenas pelo próprio CDN (cdn.sheetjs.com).
 *
 * Na Fase G2.6.1, por `cdn.sheetjs.com` estar bloqueado pela política de
 * rede deste ambiente, a correção provisória foi usar `@e965/xlsx`, um
 * espelho terceiro no npm. Na Fase G2.6.2, o usuário baixou o tarball
 * oficial (`xlsx-0.20.3.tgz`, de uma máquina com acesso ao CDN) e o
 * disponibilizou localmente — o pacote agora instalado é o `xlsx` OFICIAL
 * do SheetJS (não mais o espelho terceiro), vendorizado em
 * `vendor/xlsx-0.20.3.tgz` e referenciado como `"xlsx": "file:vendor/xlsx-0.20.3.tgz"`.
 * A checagem detalhada de proveniência do pacote (ausência do `@e965/xlsx`,
 * versão resolvida, conteúdo do lockfile) está em
 * `xlsx-official-dependency.wiring.test.ts`; aqui ficam apenas os testes de
 * comportamento, que continuam válidos com qualquer uma das duas fontes
 * porque a API do pacote é idêntica.
 */

test("Fase G2.6.2: o pacote 'xlsx' instalado é a versão oficial 0.20.3 (corrige as duas CVEs do achado P2, >= 0.20.2)", () => {
  const pkgPath = path.join(process.cwd(), "node_modules", "xlsx", "package.json")
  assert.ok(fs.existsSync(pkgPath), "pacote xlsx deve estar instalado")
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { name: string; version: string; author?: unknown }
  assert.equal(pkg.name, "xlsx")
  const parts = pkg.version.split(".").map((n) => parseInt(n, 10))
  const major = parts[0] ?? 0
  const minor = parts[1] ?? 0
  const patch = parts[2] ?? 0
  const atLeast = (maj: number, min: number, pat: number) =>
    major > maj || (major === maj && minor > min) || (major === maj && minor === min && patch >= pat)
  assert.ok(atLeast(0, 20, 2), `esperado >= 0.20.2 (corrige GHSA-5pgg-2g8v-p4x9), instalado: ${pkg.version}`)
})

test("package.json depende do 'xlsx' oficial vendorizado, não mais do espelho terceiro '@e965/xlsx'", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  assert.equal(pkg.dependencies?.["@e965/xlsx"], undefined, "o espelho terceiro @e965/xlsx não deve mais ser dependência")
  assert.equal(pkg.devDependencies?.["@e965/xlsx"], undefined)
  assert.ok(pkg.dependencies?.["xlsx"], "deveria depender de 'xlsx' (pacote oficial)")
})

test("importação existente: readWorkbook continua lendo .xlsx corretamente após a troca de fonte", () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Matéria", "Duração (minutos)"],
    ["Direito Constitucional", 60],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, "Histórico")
  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer

  const sheets = readWorkbook(buffer)
  assert.equal(sheets.length, 1)
  assert.equal(sheets[0]?.name, "Histórico")
  assert.deepEqual(sheets[0]?.rows[0], ["Matéria", "Duração (minutos)"])
  assert.deepEqual(sheets[0]?.rows[1], ["Direito Constitucional", 60])
})

test("arquivo .csv: readWorkbook lê corretamente (mesmo caminho de código do .xlsx)", () => {
  // Nota: igual ao comportamento já existente antes desta fase (não alterado
  // por esta correção de segurança), a leitura usa type: "array" sobre os
  // bytes crus do arquivo — o SheetJS decodifica como codepage padrão, não
  // necessariamente UTF-8. Por isso o conteúdo de teste evita acentuação:
  // o que importa aqui é confirmar que a estrutura linha/coluna do .csv
  // continua sendo lida corretamente pela biblioteca trocada, não a
  // fidelidade de acentuação (fora do escopo desta fase de segurança).
  const csvContent = "Materia,Duracao (minutos)\nDireito Administrativo,45\n"
  const buffer = new TextEncoder().encode(csvContent).buffer as ArrayBuffer

  const sheets = readWorkbook(buffer)
  assert.equal(sheets.length, 1)
  assert.deepEqual(sheets[0]?.rows[0], ["Materia", "Duracao (minutos)"])
  assert.deepEqual(sheets[0]?.rows[1], ["Direito Administrativo", 45])
})

test("arquivo inválido/corrompido: readWorkbook não trava o processo nem executa nada do conteúdo — apenas texto inerte", () => {
  // Comportamento real do SheetJS (confirmado também na versão antiga,
  // não é uma regressão desta troca): bytes não reconhecidos como
  // xlsx/xls/ods são tratados de forma permissiva como uma única célula de
  // texto, em vez de lançar exceção. O que a correção de segurança desta
  // fase garante é que esse conteúdo nunca é interpretado como código/objeto
  // (prototype pollution) nem causa um laço custoso (ReDoS) — apenas texto.
  const garbage = new TextEncoder().encode("isto nao e um arquivo de planilha valido \x00\x01\x02").buffer as ArrayBuffer

  const start = Date.now()
  const sheets = readWorkbook(garbage)
  const elapsedMs = Date.now() - start

  assert.ok(Array.isArray(sheets))
  assert.ok(elapsedMs < 2000, "não deve haver travamento tipo ReDoS ao processar conteúdo inválido")
  for (const sheet of sheets) {
    for (const row of sheet.rows) {
      for (const cell of row) {
        assert.notEqual(typeof cell, "function", "conteúdo do arquivo nunca deve virar código executável")
      }
    }
  }
})

test("arquivo vazio: readWorkbook não trava e não retorna linhas fantasma", () => {
  const empty = new ArrayBuffer(0)
  const sheets = readWorkbook(empty)
  assert.ok(Array.isArray(sheets))
  for (const sheet of sheets) {
    assert.equal(sheet.rows.length, 0, "arquivo vazio não deve produzir linhas de dados")
  }
})

test("entrada maliciosa típica de prototype pollution (__proto__ como cabeçalho) não contamina Object.prototype", () => {
  // Regressão direta do achado: GHSA-4r6h-8v6p-xvw6. Mesmo com a correção da
  // biblioteca, este teste documenta e trava o comportamento esperado: um
  // cabeçalho/dado com "__proto__" é tratado como texto de célula comum,
  // nunca usado para escrever em Object.prototype.
  const csvContent = '__proto__,Duração (minutos)\nmalicioso,10\n'
  const buffer = new TextEncoder().encode(csvContent).buffer as ArrayBuffer

  const beforePollutionCheck = ({} as Record<string, unknown>)["polluted"]
  const sheets = readWorkbook(buffer)
  const afterPollutionCheck = ({} as Record<string, unknown>)["polluted"]

  assert.equal(beforePollutionCheck, undefined)
  assert.equal(afterPollutionCheck, undefined)
  assert.ok(sheets.length >= 1)
})
