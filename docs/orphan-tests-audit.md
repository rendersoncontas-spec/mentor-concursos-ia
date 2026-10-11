# Auditoria dos testes órfãos (G2.11)

Data: 2026-10-03.

## O problema

O `npm test` não descobre testes sozinho: cada arquivo precisa estar listado no script `test` do `package.json`. A G2.10 encontrou **32 arquivos `*.test.ts` (424 testes) fora dessa lista** — nunca executados pelo `npm test`, pelo build ou por qualquer verificação desta série de fases.

## Catálogo

Cada arquivo foi executado isoladamente (`npx tsx --test <arquivo>`), seu cabeçalho foi lido para identificar a área e o histórico do git foi conferido.

| Arquivo | Área | Testes | Passavam antes | Última alteração | Situação |
|---|---|---:|---:|---|---|
| `utils/user-data.test.ts` | P1.4 — isolamento de dados locais entre usuários no logout | 4 | 4 | 2026-10-02 | Registrado (passava) |
| `features/study-session/lib/timer-sound-g2-1.test.ts` | G2.1 — preferência de som do timer ligada ao player | 5 | 5 | 2026-10-02 | Registrado (passava) |
| `application/study-analytics/s1-1-pagination-error-honest.test.ts` | S1.1 — paginação e erro honesto nas estatísticas | 12 | 12 | 2026-10-02 | Registrado (passava) |
| `application/study-analytics/s1-3-low-priority.test.ts` | S1.3 — contratos menores das estatísticas | 10 | 10 | 2026-10-02 | Registrado (passava) |
| `application/study-analytics/s1-2-consistency.test.ts` | S1.2 — filtros, semana e fuso nas estatísticas | 18 | 18 | 2026-10-02 | Registrado (passava) |
| `application/integrity-g1-3.test.ts` | G1.3 — integridade de ciclo, estudo e revisões | 40 | 40 | 2026-10-02 | Registrado (passava) |
| `application/admin/admin-security-a1-1.wiring.test.ts` | A1.1 — segurança da administração | 8 | 7 | 2026-10-02 | Ajustado e registrado |
| `application/admin/admin-integrity-a1-2.test.ts` | A1.2 — integridade da administração | 13 | 13 | 2026-10-02 | Registrado (passava) |
| `application/pagination-g1-5.test.ts` | G1.5 — paginação, fuso e ordenação | 22 | 22 | 2026-10-02 | Registrado (passava) |
| `application/auth-hardening-g1-9.test.ts` | G1.9 — autenticação e sessão | 13 | 13 | 2026-10-02 | Registrado (passava) |
| `application/accessibility-g1-10.test.ts` | G1.10 — acessibilidade e consistência interativa | 16 | 15 | 2026-10-02 | Ajustado e registrado |
| `application/timer-sound-g2-2.test.ts` | G2.2 — fechamento do sistema de som | 7 | 7 | 2026-10-02 | Registrado (passava) |
| `application/completeness-g1-17.test.ts` | G1.17 — visível = funcional | 8 | 8 | 2026-10-02 | Registrado (passava) |
| `application/ux-functional-g1-16.test.ts` | G1.16 — UX funcional e feedback | 22 | 22 | 2026-10-02 | Registrado (passava) |
| `application/study-cycle/conclude-cycle-round.wiring.test.ts` | Ciclo — Concluir volta | 20 | 19 | 2026-09-26 | Ajustado e registrado |
| `application/global-data-rls-g1-2.test.ts` | G1.2 — integridade de dados, RLS e constraints | 26 | 25 | 2026-10-02 | Ajustado e registrado |
| `application/performance-g1-8.test.ts` | G1.8 — performance (N+1, payloads) | 10 | 10 | 2026-10-02 | Registrado (passava) |
| `application/review-engine/review-period-filter-g2-1.test.ts` | G2.1 — filtro por período das revisões | 11 | 11 | 2026-10-02 | Registrado (passava) |
| `application/functional-g1-14.test.ts` | G1.14 — fluxos principais ponta a ponta | 12 | 12 | 2026-10-02 | Registrado (passava) |
| `application/study-plan/p1-6-2-weekly-hours.test.ts` | P1.6.2 — horas semanais no wizard | 5 | 5 | 2026-10-02 | Registrado (passava) |
| `application/study-plan/p1-5-consolidation.wiring.test.ts` | P1.5 — consolidação do planejamento | 7 | 7 | 2026-09-26 | Registrado (passava) |
| `application/study-plan/p1-6-1-fixes.wiring.test.ts` | P1.6.1 — erros do wizard e 1º dia da semana | 8 | 8 | 2026-10-02 | Registrado (passava) |
| `application/study-plan/weekly-goal-resolution.test.ts` | Planejamento — resolução da meta semanal | 3 | 3 | 2026-09-26 | Registrado (passava) |
| `application/study-plan/p1-2-planejamento-closure.wiring.test.ts` | P1.2 — fechamento do planejamento | 8 | 8 | 2026-10-02 | Registrado (passava) |
| `application/study-plan/planning-preferences.test.ts` | P1.5 — preferências banco > legado > padrão | 8 | 8 | 2026-09-26 | Registrado (passava) |
| `application/study-plan/rhythm-g2-1.test.ts` | G2.1 — ritmo no fatiamento do plano | 13 | 13 | 2026-10-02 | Registrado (passava) |
| `application/offline-cache-g1-7.test.ts` | G1.7 — offline, cache e logout | 13 | 13 | 2026-10-02 | Registrado (passava) |
| `application/daily-study-g2-3.test.ts` | G2.3 — estudo diário (plano → sessão → progresso) | 8 | 8 | 2026-10-02 | Registrado (passava) |
| `application/global-security-g1-1.test.ts` | G1.1 — segurança e isolamento global | 40 | 40 | 2026-10-02 | Registrado (passava) |
| `application/errors-validation-g1-6.test.ts` | G1.6 — validação de entradas e erros | 13 | 13 | 2026-10-02 | Registrado (passava) |
| `application/functional-hardening-g1-15.test.ts` | G1.15 — hardening dos suspeitos funcionais | 13 | 13 | 2026-10-02 | Registrado (passava) |
| `application/concurrency-g1-4.test.ts` | G1.4 — concorrência (duplicação/avanço duplo) | 8 | 8 | 2026-10-02 | Registrado (passava) |

## Classificação

- **Funcionalidade atual**: todos os 32. São travas de regressão das fases G1.x, G2.x, P1.x, S1.x, A1.x e "Concluir volta" (setembro–outubro de 2026), escritas para o comportamento em produção. Nenhum testa funcionalidade removida.
- **Históricos / aposentar**: nenhum. Nenhum lê arquivo inexistente nem trava comportamento que o produto abandonou.
- **Duplicados**: nenhum duplicado exato. Há sobreposição temática com testes registrados (ex.: performance G1.8 × `performance-fase-f*.wiring`, som G2.1 × G2.2), mas cada arquivo trava contratos diferentes; manter os dois não custa nada além de alguns segundos.
- **Falhando**: 4 de 424 testes (1 por arquivo). Dois eram consequência da G2.10 (minhas mudanças, invisíveis porque esses testes não rodavam) e dois eram travas anteriores à G2.6.1 que não acompanharam uma mudança documentada e intencional.

## O que foi feito

Os 4 só foram ajustados porque o comportamento atual está documentado e atende à mesma intenção do teste — nenhuma asserção foi removida ou afrouxada para "ficar verde":

- `application/accessibility-g1-10.test.ts`: 1 falha — causada pela G2.10 (detalhe do simulado passou a usar o Dialog do design system). Agulha atualizada para o markup atual.
- `application/global-data-rls-g1-2.test.ts`: 1 falha — causada pela G2.10 (validação passou para simulado-record-persistence.ts). Verificação de ordem apontada para o novo módulo.
- `application/admin/admin-security-a1-1.wiring.test.ts`: 1 falha — teste anterior à G2.6.1, que moveu a auditoria de modo suporte para getEffectiveUserId (auth-guard.ts). Verificação apontada para auth-guard.ts.
- `application/study-cycle/conclude-cycle-round.wiring.test.ts`: 1 falha — teste anterior à G2.6.1, que passou a chamar getEffectiveUserId(supabase, { action: "CONCLUDE_CYCLE_ROUND", … }). Regex aceita o auditContext.

Depois disso, **os 32 arquivos foram registrados no script `npm test`** (todos passam: 424/424) e foi criada a trava `src/application/test-registry.test.ts`, que falha se um `*.test.ts` existir em `src/` sem estar no script — ou se o script listar arquivo que não existe mais. Assim o problema não volta silenciosamente.

## Efeito

`npm test`: 1715 → 2141 testes (2141/2141), duração ~55 s.
