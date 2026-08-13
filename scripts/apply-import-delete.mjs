// Aplica docs/ensure-import-delete.sql no banco usando DATABASE_URL do .env.local
// Uso: node scripts/apply-import-delete.mjs
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

const client = new pg.Client({
  connectionString: readEnv("DATABASE_URL"),
  connectionTimeoutMillis: 20000,
  ssl: { rejectUnauthorized: false },
})

try {
  await client.connect()
  const sql = readFileSync(join(root, "docs", "ensure-import-delete.sql"), "utf8")
  await client.query(sql)
  console.log("OK: migration aplicada com sucesso.")
} catch (err) {
  console.error("FALHA ao aplicar:", err.message)
  process.exitCode = 1
} finally {
  await client.end()
}