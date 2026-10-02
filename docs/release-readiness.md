# NomeIA — Release Readiness (G1.1 → G1.11)

Estado em 2026-09-29. Auditoria global por fases; este documento resume o
que entra no release e o que permanece pendente.

## Estado geral

| Fase | Status |
|---|---|
| G1.1 segurança/isolamento/catalogação | VERDE |
| G1.2 RLS/integridade/importação | VERDE |
| G1.3 ciclo/review/planning (+validação autenticada G1.3.2) | VERDE |
| G1.4 concorrência (P0 double-ACTIVE corrigido) | VERDE no código; PENDENTE DE INFRAESTRUTURA p/ corridas com COMMIT (G1.4.1) |
| G1.5 paginação/timezone/determinismo | VERDE |
| G1.6 validação/errors/contratos | VERDE |
| G1.7 offline/cache/logout/user-switch | VERDE |
| G1.8 performance (N+1 + waterfalls) | VERDE |
| G1.9 auth hardening | VERDE |
| G1.10 a11y + reorder rollback | VERDE |
| G1.11 consolidação | VERDE |

## O que foi corrigido (por fase)

- **G1.3:** `updateFullCycleAction` termina em rebuild canônico; finalize de
  review nunca declara sucesso sem `study_history`; planejamento atômico via
  RPC `generate_study_plan_atomic`; filtro de disciplina exato; duração com
  `round` canônico; fingerprint `~null~` único TS=SQL.
- **G1.4:** índice `uq_study_plans_single_active` + RPC com archive-before-insert.
- **G1.5:** desempate `id` em paginações; `start_date` em America/Sao_Paulo;
  `dayOfWeekForDateKey`; lookups `ilike` determinísticos.
- **G1.6:** validadores runtime no save de estudo; 23505 estreitado no review;
  reuso de operationId; meta corrompida vira erro; parse local com fallback.
- **G1.7:** guarda de troca de usuário (purge + reload); logout canônico no recovery.
- **G1.8:** N+1 de itens por plano eliminado; 4 waterfalls paralelizados.
- **G1.10:** rollback de reorder; `aria-label`s; trava em edit-discipline.

## O que foi comprovado no banco real (somente leitura + transações com rollback)

Schemas, constraints, RLS/policies, RPCs executando, rollback mid-transaction,
fingerprint TS=SQL byte-a-byte, 1 ACTIVE por usuário, zero órfãos/duplicatas,
registry G11–G14. Nenhum COMMIT de teste em produção.

## O que depende de infraestrutura (G1.4.1, PENDENTE)

Corridas com COMMIT concorrente isolado: sem branch DB, sem Docker/Supabase
CLI, sem staging. Não bloqueia o release (P0 já corrigido e protegido por
índice); registrar como pendência explícita.

## PWA / Offline

Manifest instalável + ícones existem. **Não há Service Worker**: offline real
é IndexedDB (`nomeia-offline`) + sync queue com `operationId`. Não chamar de
"offline completo via SW".

## Testes / Build / Env / Migrations

- Suíte completa verde G1.12: 1766/1766, 315 suites, 0 fail/skip/todo;
  `tsc --noEmit` 0; `npm run build` OK (todas as rotas + middleware +
  `manifest.webmanifest` compilam).
- Migrations G13/G21/G14 aplicadas e presentes localmente; 7 históricas
  pré-G11 aplicadas sem registro (objetos verificados, sem impacto funcional).
- Env: 2 obrigatórias com fail-fast; nenhum segredo em `NEXT_PUBLIC_*`;
  service-role fora do bundle.

## Procedimento de release manual

1. Revisar `git status` (lista na §17 do relatório G1.11).
2. `git add` dos grupos do commit plan (funcional → migrations → testes → docs).
3. NÃO adicionar: `Claude outputs/`, SQLs/`.bat`/seeds da raiz, `scripts/` de
   diagnóstico (decisão do usuário — são arquivos pessoais/utilitários).
4. `git commit` + `git push` (nunca executados pelo agente).
5. Deploy existente (Vercel) sem alteração de config.
