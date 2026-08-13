// Verifica o catálogo aplicado no banco: contagem por disciplina + totais
// Uso: node scripts/verify-topic-catalog.mjs
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

const client = new pg.Client({ connectionString: readEnv("DATABASE_URL"), connectionTimeoutMillis: 20000 })

try {
  await client.connect()
  const res = await client.query(`
    SELECT d.name AS disciplina,
           count(DISTINCT t.id) AS topicos,
           count(s.id) AS subtopicos
    FROM public.disciplines d
    LEFT JOIN public.topics t ON t.discipline_id = d.id
    LEFT JOIN public.subtopics s ON s.topic_id = t.id
    GROUP BY d.name
    ORDER BY d.name
  `)
  let totT = 0, totS = 0
  for (const r of res.rows) {
    totT += Number(r.topicos)
    totS += Number(r.subtopicos)
    console.log(`${r.disciplina.padEnd(45)} ${r.topicos.padStart(4)} tópicos  ${r.subtopicos.padStart(5)} subtópicos`)
  }
  console.log("-".repeat(70))
  console.log(`${res.rowCount} disciplinas · ${totT} tópicos · ${totS} subtópicos`)
} catch (err) {
  console.error("ERRO:", err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
