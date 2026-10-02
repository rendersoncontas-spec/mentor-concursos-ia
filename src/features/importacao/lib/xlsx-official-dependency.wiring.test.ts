import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Fase G2.6.2 — eliminar o ponto AMARELO da Fase G2.6.1: substituir o
 * espelho terceiro `@e965/xlsx` pela distribuição OFICIAL do SheetJS.
 *
 * A fonte oficial recomendada pelo próprio SheetJS para releases >= 0.18.6
 * é `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` — mas esse host
 * está bloqueado pela política de rede deste ambiente: confirmado tanto via
 * `curl` (403 do proxy no CONNECT) quanto executando literalmente
 * `npm install "xlsx@https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"`
 * (npm error 403). Por isso o pacote não pôde ser buscado automaticamente
 * pela rede deste ambiente.
 *
 * O usuário baixou o tarball oficial de uma máquina com acesso ao CDN e o
 * disponibilizou manualmente. Antes de instalar, o conteúdo foi conferido:
 * `package/package.json` dentro do tarball declara
 * `{"name":"xlsx","version":"0.20.3","author":"sheetjs", ...}`, a lista de
 * arquivos (xlsx.js, xlsx.mjs, dist/*.min.js, bin/xlsx.njs, types/index.d.ts)
 * corresponde exatamente à estrutura conhecida do pacote oficial, e o
 * pacote não declara nenhum script `preinstall`/`postinstall`/`install` nem
 * dependências de runtime.
 *
 * Como este ambiente não pode buscar o tarball pela URL oficial (e portanto
 * não pode registrar literalmente `"xlsx": "https://cdn.sheetjs.com/..."`
 * em package.json sem quebrar um `npm install` futuro feito daqui), o
 * tarball foi vendorizado no próprio repositório (`vendor/xlsx-0.20.3.tgz`)
 * e referenciado via `"xlsx": "file:vendor/xlsx-0.20.3.tgz"` — o mecanismo
 * padrão do npm para uma dependência local, com o MESMO efeito prático
 * pedido pelo brief (pacote oficial, sem o espelho terceiro, sem alterar a
 * API). Em uma máquina/CI com acesso a cdn.sheetjs.com, basta trocar esse
 * campo para a URL oficial — o conteúdo instalado já é idêntico.
 */

const PACKAGE_JSON_PATH = path.join(process.cwd(), "package.json")
const PACKAGE_LOCK_PATH = path.join(process.cwd(), "package-lock.json")
const VENDOR_TARBALL_PATH = path.join(process.cwd(), "vendor", "xlsx-0.20.3.tgz")
const INSTALLED_XLSX_PACKAGE_JSON = path.join(process.cwd(), "node_modules", "xlsx", "package.json")

test("G2.6.2: o tarball oficial vendorizado existe no repositório", () => {
  assert.ok(fs.existsSync(VENDOR_TARBALL_PATH), "vendor/xlsx-0.20.3.tgz deveria existir")
})

test("G2.6.2: package.json aponta 'xlsx' para o tarball oficial vendorizado (não para o registry, não para o espelho terceiro)", () => {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf-8")) as {
    dependencies?: Record<string, string>
  }
  const dep = pkg.dependencies?.["xlsx"]
  assert.ok(dep, "package.json deveria declarar uma dependência 'xlsx'")
  assert.match(dep as string, /^file:vendor\/xlsx-0\.20\.3\.tgz$/)
})

test("G2.6.2: '@e965/xlsx' não aparece mais em package.json (nem em dependencies, nem em devDependencies)", () => {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf-8")) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  assert.equal(pkg.dependencies?.["@e965/xlsx"], undefined)
  assert.equal(pkg.devDependencies?.["@e965/xlsx"], undefined)
})

test("G2.6.2: '@e965/xlsx' não aparece mais no package-lock.json (sem resolução residual do pacote terceiro)", () => {
  const lockContent = fs.readFileSync(PACKAGE_LOCK_PATH, "utf-8")
  assert.doesNotMatch(lockContent, /@e965\/xlsx/, "o lockfile não deveria mais referenciar @e965/xlsx")
})

test("G2.6.2: o 'xlsx' resolvido no lockfile vem do tarball vendorizado, não do registry do npm", () => {
  const lock = JSON.parse(fs.readFileSync(PACKAGE_LOCK_PATH, "utf-8")) as {
    packages?: Record<string, { version?: string; resolved?: string }>
  }
  const entry = lock.packages?.["node_modules/xlsx"]
  assert.ok(entry, "lockfile deveria ter uma entrada para node_modules/xlsx")
  assert.equal(entry?.version, "0.20.3")
  assert.match(entry?.resolved ?? "", /^file:vendor\/xlsx-0\.20\.3\.tgz$/, "resolved não deveria apontar para registry.npmjs.org")
})

test("G2.6.2: o pacote efetivamente instalado em node_modules/xlsx é a versão oficial 0.20.3 do SheetJS", () => {
  assert.ok(fs.existsSync(INSTALLED_XLSX_PACKAGE_JSON), "node_modules/xlsx/package.json deveria existir")
  const installed = JSON.parse(fs.readFileSync(INSTALLED_XLSX_PACKAGE_JSON, "utf-8")) as {
    name: string
    version: string
    author?: unknown
  }
  assert.equal(installed.name, "xlsx")
  assert.equal(installed.version, "0.20.3")
})

test("G2.6.2: '@e965/xlsx' não está instalado em lugar nenhum da árvore de dependências", () => {
  // Checa o package.json do pacote em si, não só a pasta do scope @e965 —
  // o npm por vezes deixa a pasta do scope vazia para trás após remover o
  // único pacote dentro dela, o que não indica que o pacote ainda exista.
  const e965XlsxPackageJson = path.join(process.cwd(), "node_modules", "@e965", "xlsx", "package.json")
  assert.ok(!fs.existsSync(e965XlsxPackageJson), "node_modules/@e965/xlsx não deveria mais existir")
})
