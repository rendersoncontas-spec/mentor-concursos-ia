// Gera docs/topic-catalog.sql a partir de src/application/topic-catalog/catalog.json
// Uso: node scripts/generate-topic-catalog-sql.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const catalog = JSON.parse(readFileSync(join(root, "src/application/topic-catalog/catalog.json"), "utf8"))

const norm = (s) => s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")

// ── Validação do catálogo: nomes normalizados únicos por disciplina ────────
const problems = []
for (const d of catalog.disciplines) {
  const names = d.topics.map((t) => norm(t.name))
  const seen = new Set()
  for (const n of names) {
    if (seen.has(n)) problems.push(`Tópico duplicado '${n}' em '${d.name}'`)
    seen.add(n)
  }
  for (const t of d.topics) {
    const subs = (t.subtopics ?? []).map((s) => norm(s))
    const subSeen = new Set()
    for (const s of subs) {
      if (subSeen.has(s)) problems.push(`Subtópico duplicado '${s}' em '${d.name} > ${t.name}'`)
      subSeen.add(s)
    }
  }
}
if (problems.length > 0) {
  console.error("ERROS NO CATÁLOGO:")
  for (const p of problems) console.error(" - " + p)
  process.exit(1)
}

const esc = (s) => s.replace(/'/g, "''")
const normExpr = (s) => `public.normalize_text('${esc(s)}')`

const lines = []
lines.push("-- ========================================================================================")
lines.push("-- MIGRATION: Catálogo global de tópicos e subtópicos (gerado automaticamente)")
lines.push(`-- Fonte: src/application/topic-catalog/catalog.json · ${catalog.disciplines.length} disciplinas`)
lines.push("-- Gerado por scripts/generate-topic-catalog-sql.mjs — NÃO editar manualmente.")
lines.push("-- ========================================================================================")
lines.push("")
lines.push("-- 1. Função de normalização (imutável, sem dependência de extensões) — usada nos índices e no matching")
lines.push("CREATE OR REPLACE FUNCTION public.normalize_text(s text)")
lines.push("RETURNS text")
lines.push("LANGUAGE sql")
lines.push("IMMUTABLE")
lines.push("PARALLEL SAFE")
lines.push("STRICT")
lines.push("RETURN lower(btrim(translate(")
lines.push("  s,")
lines.push("  'áàâãäéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',")
lines.push("  'aaaaaeeeeiiiiooooouuuucnyyAAAAAEEEEIIIIOOOOOUUUUCNY'")
lines.push(")));")
lines.push("")
lines.push("-- 2. Tabela de tópicos do catálogo (reutiliza a tabela existente public.topics)")
lines.push("CREATE TABLE IF NOT EXISTS public.topics (")
lines.push("  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,")
lines.push("  discipline_id uuid NOT NULL REFERENCES public.disciplines(id) ON DELETE CASCADE,")
lines.push("  name text NOT NULL,")
lines.push("  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())")
lines.push(");")
lines.push("")
lines.push("-- Unicidade normalizada (ignora caixa, acentos e espaços) para evitar duplicação")
lines.push("CREATE UNIQUE INDEX IF NOT EXISTS topics_discipline_name_norm_idx")
lines.push("  ON public.topics (discipline_id, public.normalize_text(name));")
lines.push("")
lines.push("-- 3. Tabela de subtópicos do catálogo")
lines.push("CREATE TABLE IF NOT EXISTS public.subtopics (")
lines.push("  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,")
lines.push("  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,")
lines.push("  name text NOT NULL,")
lines.push("  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())")
lines.push(");")
lines.push("")
lines.push("CREATE UNIQUE INDEX IF NOT EXISTS subtopics_topic_name_norm_idx")
lines.push("  ON public.subtopics (topic_id, public.normalize_text(name));")
lines.push("")
lines.push("-- 4. RLS")
lines.push("ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;")
lines.push("ALTER TABLE public.subtopics ENABLE ROW LEVEL SECURITY;")
lines.push("")
lines.push('DROP POLICY IF EXISTS "Todos podem ler tópicos" ON public.topics;')
lines.push('CREATE POLICY "Todos podem ler tópicos"')
lines.push("  ON public.topics FOR SELECT")
lines.push("  USING (true);")
lines.push("")
lines.push('DROP POLICY IF EXISTS "Usuários autenticados podem criar tópicos" ON public.topics;')
lines.push('CREATE POLICY "Usuários autenticados podem criar tópicos"')
lines.push("  ON public.topics FOR INSERT")
lines.push("  WITH CHECK (auth.role() = 'authenticated');")
lines.push("")
lines.push('DROP POLICY IF EXISTS "Todos podem ler subtópicos" ON public.subtopics;')
lines.push('CREATE POLICY "Todos podem ler subtópicos"')
lines.push("  ON public.subtopics FOR SELECT")
lines.push("  USING (true);")
lines.push("")
lines.push('DROP POLICY IF EXISTS "Usuários autenticados podem criar subtópicos" ON public.subtopics;')
lines.push('CREATE POLICY "Usuários autenticados podem criar subtópicos"')
lines.push("  ON public.subtopics FOR INSERT")
lines.push("  WITH CHECK (auth.role() = 'authenticated');")
lines.push("")
lines.push("-- ========================================================================================")
lines.push("-- 5. SEEDS (idempotentes: rodar N vezes não duplica — ON CONFLICT + normalização)")
lines.push("-- ========================================================================================")
lines.push("")

for (const disc of catalog.disciplines) {
  const names = [disc.name, ...(disc.aliases ?? [])]
  const normNames = names.map(normExpr).join(", ")

  lines.push(`-- ${disc.name} (${disc.topics.length} tópicos)`)
  lines.push(`-- 5.1 Garante a disciplina (reutiliza a linha existente por nome/alias; só cria se não houver nenhuma)`)
  lines.push("INSERT INTO public.disciplines (name, area)")
  lines.push(`SELECT '${esc(disc.name)}', '${esc(disc.area)}'`)
  lines.push(`WHERE NOT EXISTS (SELECT 1 FROM public.disciplines WHERE public.normalize_text(name) IN (${normNames}));`)
  lines.push("")

  const targetCte = `WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (${normNames})
  ORDER BY CASE WHEN public.normalize_text(d.name) = ${normExpr(disc.name)} THEN 0 ELSE 1 END
  LIMIT 1
)`

  lines.push(`-- 5.2 Tópicos padrão da disciplina`)
  lines.push(targetCte)
  lines.push("INSERT INTO public.topics (discipline_id, name)")
  lines.push(`SELECT target.id, t.name`)
  lines.push(`FROM target`)
  lines.push(`JOIN (VALUES ${disc.topics.map((t) => `('${esc(t.name)}')`).join(", ")}) AS t(name) ON true`)
  lines.push("ON CONFLICT DO NOTHING;")
  lines.push("")

  const withSubs = disc.topics.filter((t) => t.subtopics && t.subtopics.length > 0)
  if (withSubs.length > 0) {
    lines.push(`-- 5.3 Subtópicos dos tópicos`)
    lines.push(targetCte)
    lines.push("INSERT INTO public.subtopics (topic_id, name)")
    lines.push("SELECT tp.id, s.name")
    lines.push("FROM target")
    lines.push("JOIN public.topics tp ON tp.discipline_id = target.id")
    lines.push(`JOIN (VALUES ${withSubs.flatMap((t) => t.subtopics.map((s) => `('${esc(t.name)}', '${esc(s)}')`)).join(", ")}) AS s(topic_name, name) ON true`)
    lines.push(`WHERE public.normalize_text(tp.name) = public.normalize_text(s.topic_name)`)
    lines.push("ON CONFLICT DO NOTHING;")
    lines.push("")
  }
}

lines.push("-- Fim da migração do catálogo.")
writeFileSync(join(root, "docs", "topic-catalog.sql"), lines.join("\n"), "utf8")

let topicCount = 0
let subCount = 0
for (const d of catalog.disciplines) {
  topicCount += d.topics.length
  subCount += d.topics.reduce((acc, t) => acc + (t.subtopics?.length ?? 0), 0)
}
console.log(`OK: docs/topic-catalog.sql gerado — ${catalog.disciplines.length} disciplinas, ${topicCount} tópicos, ${subCount} subtópicos.`)
