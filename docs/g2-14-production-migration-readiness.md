# G2.14 — Prontidão da migration G2.12 para staging/produção

Migration: `supabase/migrations/20261006_g2_12_discipline_canonical_identity.sql` — **não aplicada** (conferido em 2026-10-06: a coluna `canonical_discipline_id` não existe em produção).

## ANTES (produção, leitura em 2026-10-06)

| item | valor |
|---|---|
| disciplinas | 123 (última criada em 08/09) |
| `name_key` divergente da chave do código | 68 |
| `name_key` nula | 0 |
| colisões de chave após correção | 0 |
| FKs apontando para `disciplines(id)` | 16 (13 CASCADE, 3 SET NULL) |
| policies em `disciplines` | 3 (SELECT, INSERT, UPDATE — o UPDATE aceita qualquer autenticado) |
| triggers em `disciplines` | 0 |
| uso dos 2 aliases a vincular | Raciocínio Lógico-Matemático: 6 sessões, 6 sessões de ciclo, 1 vínculo pessoal; Tecnologia da Informação: 11 tópicos de catálogo, nenhum outro uso |
| `study_history` / `simulado_disciplines` / `user_disciplines` | 5.413 / 7 / 88 linhas |

## DEPOIS ESPERADO

| item | valor |
|---|---|
| disciplinas | **123** (nenhuma criada ou apagada) |
| `name` alterado | **0** |
| `name_key` divergente | 0 (68 corrigidas; NOTICE "corrigidas 68") |
| vínculos `canonical_discipline_id` | **2** (`6514acc4…` → `a999929b…`, `90a1c53e…` → `b518ed3a…`) |
| FKs para `disciplines(id)` | 17 (16 + a autorreferência nova, `ON DELETE SET NULL`) |
| policy de UPDATE | só admin (`get_user_role(auth.uid()) = 'admin'`); SELECT/INSERT iguais |
| triggers | 2 (`disciplines_sync_name_key_trg`, `disciplines_guard_canonical_trg`) |
| tabelas de histórico | intocadas (o SQL executável nem as cita — teste de wiring) |

## Verificação estática e dinâmica

- **Sintaxe e semântica:** executada 2× (idempotência) em PGlite (Postgres em memória) com as 123 linhas reais e as policies atuais: **26/26** — sem perda de linha, nenhum `name` alterado, `name_key` igual à chave do código em todas as linhas e em 10 casos-limite (NFD, travessão, `ß`, `Ø`…), só 2 vínculos, usuário comum barrado pela RLS (0 linhas) e pela guarda (42501), cadeia/auto-referência barradas, admin atualiza e a chave é recalculada, apagar a canônica só desfaz o vínculo. Script: `docs/g2-12-migration-check.mjs`.
- **Constraints:** `disciplines_canonical_discipline_id_fkey` (SET NULL), `disciplines_canonical_not_self` (CHECK), índice parcial `disciplines_canonical_discipline_id_idx`, UNIQUE `disciplines_name_key_unique_idx` já existente.
- **Admin-only:** trigger de guarda (vale mesmo que a RLS mude) + policy de UPDATE. Moderador não ganha poder nenhum.

## Locks e duração

Tudo roda numa transação (`supabase db push`). Em 123 linhas cada passo é de milissegundos; os locks mais fortes são curtos:

| passo | lock em `disciplines` | observação |
|---|---|---|
| `CREATE FUNCTION` | nenhum | — |
| `UPDATE` de 68 `name_key` | ROW EXCLUSIVE | linhas, não tabela |
| `CREATE TRIGGER` ×2 | SHARE ROW EXCLUSIVE | bloqueia escrita, não leitura |
| `ADD COLUMN` (nullable, sem default) | ACCESS EXCLUSIVE | só metadado, sem reescrever a tabela |
| `ADD CONSTRAINT` FK / CHECK | SHARE ROW EXCLUSIVE / ACCESS EXCLUSIVE | valida 123 linhas |
| `CREATE INDEX` (não concorrente) | SHARE | 123 linhas |
| `DROP/CREATE POLICY` | ACCESS EXCLUSIVE | instantâneo |

Recomendação: janela de baixo uso e `SET lock_timeout = '5s';` antes de aplicar, para falhar rápido em vez de enfileirar leituras se algo segurar a tabela.

## Compatibilidade do código

O código desta branch funciona **antes e depois** da migration: sem a coluna, o loader de identidade devolve "cada id é ele mesmo" e as listas não escondem nada (fail-open). Depois, Estatísticas, Simulados, Estudo × desempenho, Dashboard, Estudos de Hoje e Ciclo passam a juntar os aliases.

## Checagem pós-aplicação (somente leitura)

```sql
SELECT a.name AS alias, c.name AS canonica FROM public.disciplines a
JOIN public.disciplines c ON c.id = a.canonical_discipline_id;          -- 2 linhas
SELECT count(*) FROM public.disciplines;                                  -- 123
SELECT count(*) FROM public.disciplines
WHERE name_key IS DISTINCT FROM public.discipline_name_key(name);         -- 0
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'disciplines';  -- UPDATE só admin
```
No app (aluno afetado): Estatísticas → "Raciocínio Lógico e Matemático" com 287 min no histórico total (antes 228); reconstrução do ciclo com `matchedByIdentity = 6` e o mesmo progresso de antes (essas 6 sessões já entravam por similaridade).

## Rollback

No fim do arquivo SQL: desfaz vínculos, triggers, constraints, índice e coluna, e devolve a policy antiga. Nenhum dado de histórico precisa ser restaurado.

## Pendências que NÃO são da migration

- 4 vínculos ambíguos ("Noções de …", "CF/1988 e Doutrina") aguardam decisão (bloco 7, comentado).
- O alias "Tecnologia da Informação" tem 11 tópicos de catálogo e a canônica "(TI)" tem 0 — vincular não move tópicos (ver relatório G2.14).
