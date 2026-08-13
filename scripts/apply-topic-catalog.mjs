// Aplica docs/topic-catalog.sql no banco usando DATABASE_URL do .env.local
// Uso: node scripts/apply-topic-catalog.mjs
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import pg from "pg"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

function readEnv(key) {
  const raw = readFileSync(join(root, ".env.local"), "utf8")
  const line = raw.split(/\r?\n/).find((l) => l.startsWith(`${key}=`))
  if (!line) throw new Error(`${key} não encontrada em .env.local`)
  return line.slice(key.length + 1).replace(/^"|"$/g, "").trim()
}

const sql = readFileSync(join(root, "docs", "topic-catalog.sql"), "utf8")
const client = new pg.Client({ connectionString: readEnv("DATABASE_URL") })

try {
  await client.connect()
  const res = await client.query(sql)
  const total = res.reduce((acc, r) => acc + (r?.rowCount ?? 0), 0)
  console.log(`OK: SQL aplicado com sucesso (${res.length} comandos, ${total} linhas afetadas).`)
} catch (err) {
  console.error("FALHA ao aplicar o SQL:", err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
