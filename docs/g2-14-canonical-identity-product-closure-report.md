# G2.14 — Identidade canônica no produto inteiro — relatório

Data: 2026-10-06. Produção só com SELECT. Migration G2.12 **não aplicada**. Sem commit/push/deploy.
Detalhe por área: `docs/g2-14-canonical-identity-product-closure.md`. Migration: `docs/g2-14-production-migration-readiness.md`.

**Veredito: AMARELO** — o código está fechado (Dashboard, Estudos de Hoje, Ciclo, listas, filtros, cache; 2238/2238 testes, tsc e build OK), mas restam: migration aguardando staging/produção, e duas decisões de produto (classe C do ciclo; "Noções de …").

## 1. Inventário global
Matriz completa no doc de fechamento. Consumidores com identidade canônica agora: Estatísticas, Simulados, Estudo × desempenho (G2.12/13), Dashboard, Estudos de Hoje, Ciclo e listas de seleção (G2.14). Auditados sem mudança (sem impacto real): Planejamento, Revisões, Edital, tela Disciplinas. Similaridade: só no ciclo (legado) e na sugestão visível da importação.

## 2. Dashboard
Ranking por matéria, desempenho por matéria, cobertura do edital e contexto plano/ciclo/30 dias pela identidade (`dashboard-identity.ts` + 1 leitura de identidade em `getDashboardData`). Alias + canônica = uma linha, `custom_name` aplicado; vínculo duplicado (1 caso real: o mesmo aluno com alias e canônica) vira uma entrada.

## 3. Estudos de Hoje
`alignHistoryToBlocks` troca apenas o id da disciplina da entrada para o do bloco da mesma identidade; componente do plano intocado (hoje, fuso, duração, distribuição, estudo livre iguais).

## 4. Ciclo
Matcher extraído (`cycle-item-matcher.ts`): id → **identidade** → nome → similaridade. Dados reais: classe B (6 sessões de "RL-Matemático" no item "RL e Matemático") passa a casar por identidade com o mesmo resultado; classe C (50 sessões/80 min de "Raciocínio Lógico" no item "RL e Matemático", por similaridade 0,80) **preservada e documentada** — corrigir muda o progresso de um ciclo real. Reconciliação do ciclo intocada. Diagnóstico ganhou `matchedByIdentity`.

## 5. Planejamento
Sem agrupamento por nome; gera a partir dos vínculos. 0 itens/blocos em alias. Não alterado.

## 6. Reviews
0 itens em alias; motor intocado. Achado: tópicos de catálogo da TI estão só no alias (11) — a canônica tem 0.

## 7. Edital
Import por igualdade normalizada exata; progresso por tópico. Não alterado.

## 8. Listas
Alias escondido nas listas de escolha do catálogo (simulado, importação, seletor da sessão — exceto se no plano — e busca), com fail-open. RL e "RL e Matemático" seguem separados.

## 9. Admin
Sem tela nova: 2 vínculos já na migration, 4 aguardam decisão, escrita já é admin-only no banco. Recomendado só com volume.

## 10. Migration readiness
Revalidada em PGlite (26/26, 2×). Antes: 123 disciplinas, 68 `name_key` divergentes, 16 FKs, 3 policies, 0 triggers. Depois esperado: 123 disciplinas, 0 nomes alterados, 0 divergentes, 2 vínculos, 17 FKs, UPDATE só admin, 2 triggers. Locks curtos (tabela de 123 linhas); sugerido `lock_timeout`.

## 11. name_key
Escritores/leitores mapeados; 3 inserções gravam sem chave; risco latente de duplicata para nome sem acento em 3 resolvedores com fallback acentuado (0 duplicatas hoje). A migration resolve (recalcula + trigger). Sem backfill nesta fase.

## 12. Cache
Dashboard por requisição; Estudos de Hoje 5 min com refresh no estudo salvo; Estatísticas com invalidação (G2.13); vínculo feito por SQL aparece na próxima carga (Estatísticas: até 5 min).

## 13. Performance
Uma leitura de identidade por tela, em lotes; tradução O(n); sem N+1; ciclo carrega identidade 1× por reconstrução. Testes com 30.000/50.000 sessões.

## 14. npm audit
- `source-map-js` (alta, transitiva de `@tailwindcss/postcss`/`postcss`, uso em build): **corrigido** — 1.2.1 → 1.2.2 só no `package-lock.json` (`npm update source-map-js`, dentro do range `^1.2.1`; nada mais mudou).
- `mammoth` 1.12.1 (direta, produção) → `argparse` 1.0.10 → `sprintf-js` (3 moderadas, DoS): o `argparse` só é usado pelo CLI do mammoth (`bin/mammoth`); o app chama `extractRawText` da biblioteca, que não o carrega → não explorável pelo app. Correção do npm = downgrade para 0.3.29 (quebra) → não aplicada.
- Dev: `@next/eslint-plugin-next` (braces/micromatch/fast-glob) e `@capacitor/cli` (uuid/xcode) — correções só com troca de major; não alteradas (Capacitor fora do escopo).

## 15. Testes
2209 → **2238** (+29), `canonical-identity-g2-14.test.ts`: cenário central (estudo em A + simulado em B → X em Estudo × desempenho, Estatísticas, Dashboard e Ciclo), Dashboard (sem alias, alias/canônica/ambos, duplicação, vínculos, ambígua, zero, 30.000), Estudos de Hoje (alias↔canônica, sem identidade, ambígua, matéria diferente), Ciclo (A/B/C/D, legado idêntico sem identidade, contrato IMPORT 11), cadeia A→B→C, auto-referência, vínculo inexistente, listas (alias some, plano mantém, fail-open) e wiring. Registry: 170 arquivos de teste, 170 no `npm test`, nenhum órfão.

## 16. Arquivos alterados
Novos: `src/application/dashboard/dashboard-identity.ts`, `src/application/disciplines/discipline-aliases.ts`, `src/application/study-cycle/cycle-item-matcher.ts`, `src/application/canonical-identity-g2-14.test.ts`, 3 docs.
Alterados: `dashboard.service.ts`, `dashboard.types.ts`, `dashboard-widget-catalog.tsx`, `cycle-study-registration.service.ts`, `simulado-records.actions.ts`, `import-history.actions.ts`, `get-disciplines.action.ts`, `edital.action.ts`, `package.json` (script de teste), `package-lock.json` (source-map-js), docs G2.12/G2.13 (correção de contagem e limitação).

## 17. Problemas corrigidos
- Dashboard e Estudos de Hoje separavam alias e canônica.
- Ciclo dependia de texto para casar alias comprovado.
- Listas ofereciam alias e canônica como opções independentes.
- `source-map-js` vulnerável.
- Docs G2.12 diziam 19 FKs; o real é 16 (13 CASCADE, 3 SET NULL).

## 18. Problemas pendentes
- Classe C do ciclo (50 sessões de RL contando em "RL e Matemático").
- Tópicos da TI no alias.
- 3 inserções sem `name_key` até a migration.
- Planejamento pode duplicar matéria se o aluno vincular alias e canônica.
- `mammoth`/dev advisories sem correção não-quebrante.

## 19. Decisões de produto
1. Aplicar G2.12 (staging → produção).
2. "Noções de X" = X? (+ "CF/1988 e Doutrina").
3. Ciclo: parar de casar "Raciocínio Lógico" com "RL e Matemático" (e, em geral, desligar a similaridade quando o estudo já tem `discipline_id`)? Muda o progresso de 1 ciclo real em 80 min.
4. Tópicos da TI: mover/copiar do alias para a canônica?

## 20. Próxima fase recomendada
G2.15 — aplicar a migration em staging com o checklist do readiness, decidir os itens 2–4 e, se aprovados, (a) descomentar os vínculos, (b) restringir a similaridade do ciclo com teste de regressão do progresso, (c) migrar tópicos da TI com prévia de impacto.

## Comandos

```
npm test              → # tests 2238 · # pass 2238 · # fail 0
npx tsc --noEmit      → exit 0
npm run build         → ✓ Compiled successfully
npm audit --omit=dev  → 3 moderate severity vulnerabilities (mammoth → argparse → sprintf-js)
npm audit             → 10 vulnerabilities (6 moderate, 4 high) — antes 11 (6 moderate, 5 high)
eslint (arquivos tocados) → nenhum erro novo
```
