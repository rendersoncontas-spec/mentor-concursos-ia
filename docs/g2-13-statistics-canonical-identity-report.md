# G2.13 — Estatísticas pela identidade canônica — relatório

Data: 2026-10-06. Produção só com SELECT. Migration G2.12 **não aplicada**. Sem commit/push/deploy.
Detalhes: `docs/statistics-canonical-identity.md`.

**Veredito: VERDE.** Estatísticas usam a identidade canônica num ponto só; aliases comprovados somam; nenhum registro conta duas vezes; ambíguos separados; personalização preservada; filtros e seções sem série duplicada; 2209/2209 testes, tsc e build OK. Ressalva fora do escopo: o `npm audit` passou a acusar avisos novos (item 14) sem nenhuma mudança de dependência nesta fase.

## 1. Pontos encontrados (inventário)
Central de Estatísticas = `getStatisticsCenterAction` (servidor) → payload → `statistics-center-view.tsx` + `stats-engine.ts` (cliente). Pontos com `discipline_id`:
- `study_history` (sessões: tempo, sessões, foco, páginas, flashcards, questões da sessão, tópicos, tendência, último estudo, prioridades, insights, relatórios);
- `question_attempts` via `questions.discipline_id` (acurácia, erros, pontos fracos);
- `user_disciplines` + `disciplines` (status do edital, cobertura, registro de nomes);
- `review_items` (revisões atrasadas por disciplina, atenção);
- `study_plan_items` (plano × realizado — o cálculo não usa disciplina);
- filtros: disciplina (opções a partir das sessões + vínculos), período, tipo de estudo;
- seções/gráficos por disciplina: Desempenho por disciplina, Tópicos, Pontos fracos, Cobertura do edital, Revisões por disciplina, Prioridades. Gráficos de evolução/horas/heatmap são por dia.
Fora da página (não alterados): ranking por disciplina do Dashboard, widget "Estudos de Hoje", `getUserStatisticsAction` (sem consumidor).

## 2. Arquivos alterados
Novos: `src/application/study-analytics/statistics-identity.ts`, `src/application/simulados/simulado-records.read.ts`, `src/features/statistics/lib/simulados-by-discipline.ts`, 2 testes, 2 docs.
Alterados: `statistics-center.action.ts`, `statistics-center-view.tsx`, `simulado-records.actions.ts`, `discipline-actions.ts`, `package.json` (só o script de teste).

## 3. Funções alteradas
- `getStatisticsCenterAction`: + leitura de simulados, + identidade (1 chamada), + `canonicalizeStatisticsInput`; payload ganhou `simulados` e `identity`; cache só com payload íntegro (inclui simulados e identidade).
- `getSimuladoRecordsAction` / `getSimuladoRecordAction`: passam a usar `readSimuladoRecords`/`readSimuladoSubjects`.
- `saveSimuladoRecordAction` / `deleteSimuladoRecordAction`: invalidam o cache das Estatísticas.
- `addUserDisciplineAction`, `removeUserDisciplineAction`, `updateDisciplineAppearanceAction`: invalidam o cache (pessoal: do aluno; rename global por admin: de todos).
- `StatisticsCenterView`: filtro resolvido pela identidade; simulados por disciplina; `DisciplinasSection` mostra simulados e "Inclui também".
- Motor (`stats-engine.ts`): **nenhuma mudança**.

## 4. Estratégia de identidade
Tradução única na fronteira servidor → tela, com a regra da G2.12. Sem fuzzy, sem comparação de nome, sem segunda canonicalização, sem `if` espalhado: o motor continua agrupando por `disciplineId`, que já chega canônico.

## 5. Estudo
Sessões do alias somam na canônica (tempo, sessões, questões, tópicos, tendência, último estudo). Real (U3, simulando a migration): RL e Matemático 228 → 287 min; 33 → 32 disciplinas; total de minutos e sessões idêntico.

## 6. Simulados
Payload traz os simulados externos já canônicos; a tela usa `buildSubjectAnalysis` (G2.10) via `simuladoAnalysisByDiscipline`, filtrado por período e matéria. Detalhe da disciplina: simulados, média, evolução (p.p.).

## 7. Agregação
Dedupe pelo id real de sessão, questão, revisão e simulado; alias + canônica no mesmo simulado viram uma matéria; vínculo de edital duplicado (alias + canônica do mesmo aluno — existe 1 caso real) vira uma entrada, com o status da canônica.

## 8. Filtros
Opções só com identidades. Id de alias no filtro → resolvido para a canônica antes de filtrar sessões, questões e simulados. Período vale para os três; tipo de estudo não se aplica a simulado externo.

## 9. Gráficos
Nenhuma série por alias: todas as seções por disciplina usam o id canônico; os gráficos por dia não dependem de disciplina.

## 10. Cache
Cache em memória (5 min) só guarda payload íntegro (agora também exige simulados e identidade). Invalidação explícita: estudo (já existia), simulado salvo/excluído, vínculo adicionado/removido, nome pessoal, rename global. Vínculo de alias feito por SQL: até 5 min.

## 11. Performance
+1 leitura de simulados (em paralelo com as demais) e +2–3 leituras de identidade (lotes de 100 ids, não por registro). Tradução O(n) com mapas; teste com 50.000 sessões: soma exata, bem abaixo de 1,5 s. Nenhum N+1.

## 12. Testes
2185 → **2209** (+24): `statistics-canonical-identity.test.ts` (20 — os 18 cenários pedidos: sem alias, alias, dois aliases, estudo no alias/na canônica/ambos, simulado no alias/na canônica/ambos, sem duplicação, custom_name, ambígua separada, filtro canônico, filtro por alias, sem série duplicada em edital/revisões/tópicos, 0/1/50.000 registros, + wiring de action, tela, cache e motor intocado) e `simulado-records.read.test.ts` (4 — filtro de externos/usuário, erro nas matérias, >1.000 matérias paginadas, vazio).

## 13. Problemas encontrados (e corrigidos)
- **Simulado sem matérias por falha silenciosa:** a leitura das matérias devolvia vazio em erro; abrir a edição nesse estado e salvar gravaria o simulado sem matérias. Agora é erro.
- **Matérias truncadas:** `simulado_disciplines` era lido numa consulta só (corte de 1.000 linhas do PostgREST; até 300 simulados × 60 matérias). Agora paginado e em lotes.
- **`custom_name` ignorado nas Estatísticas:** agora aparece (via identidade).
- **Cache sem invalidação** ao adicionar/remover disciplina e ao mudar o nome pessoal.

## 14. Problemas não corrigidos
- `npm audit --omit=dev`: 4 avisos (1 alta: `source-map-js` GHSA-68fv-2mgg-jv7q, correção sem quebra disponível; 3 moderadas: `mammoth` → `argparse` → `sprintf-js`, correção só com downgrade de major). `npm audit`: 11 (6 moderadas, 5 altas). Lockfile não mudou nesta fase — são avisos publicados depois da G2.11. Não corrigido aqui (fase sem mudança de dependência; nunca `--force`).
- Ranking por disciplina do Dashboard e "Estudos de Hoje" ainda por id original.
- Ciclo ainda casa estudo por similaridade (achado G2.12).

## 15. Limitações
Efeito real só após aplicar a migration G2.12. Vínculo feito por SQL aparece em até 5 min. Simulados limitados a 300 por aluno. Filtro de tipo de estudo não filtra simulados.

## 16. Próximos passos
1. Aplicar G2.12 (staging → produção). 2. Decidir "Noções de X". 3. Dashboard (ranking por disciplina) pela mesma identidade. 4. Tratar `source-map-js` com `npm audit fix` (sem `--force`) numa fase de dependências. 5. Ciclo: trocar similaridade por identidade.

## Comandos

```
npm test              → # tests 2209 · # pass 2209 · # fail 0
npx tsc --noEmit      → exit 0
npm run build         → ✓ Compiled successfully
npm audit --omit=dev  → 4 vulnerabilities (3 moderate, 1 high)
npm audit             → 11 vulnerabilities (6 moderate, 5 high)
eslint (arquivos tocados) → nenhum erro novo (view: mesmos 3 eqeqeq + 5 no-nested-ternary pré-existentes)
```
