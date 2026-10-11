# G2.9 — Pipeline de questões e revisões (relatório)

**Data:** 2026-10-03 · **Veredito: 🟡 AMARELO** — causa raiz comprovada, nenhum dado perdido e nenhum furo de RLS; um bug latente de duplicação no único caminho de gravação foi corrigido. Voltar a popular `question_attempts` depende de uma decisão de produto (reativar o simulador interno), não de uma correção de código.

Nenhuma operação de git, nenhum deploy e nenhuma escrita em produção (todas as consultas ao banco foram `SELECT`).

## 1. Estado atual de `question_attempts`

0 linhas, nenhum registro em toda a história do banco (`max(answered_at)` = null). Schema, RLS e índices coerentes com o código que grava.

## 2. Estado atual de `review_items`

0 linhas (e 0 em `review_sessions` e `review_history`). Schema, CHECKs, índices únicos e RLS conferidos um a um contra `review.repository.ts` — batem.

## 3. Causa raiz

**`question_attempts` — classes F + J (ação nunca é chamada / módulo deixado inativo):**

- O único código que grava a tabela é a finalização do simulador interno (`simulados.actions.ts`). `registerAttempt` em `question-attempt.service.ts` não tem chamador.
- A interface do simulador (`simulado-player.tsx`, `simulado-config-dialog.tsx`) foi apagada no commit `04c0e4d` (16/09/2026). Hoje `/simulados` só tem o registro manual de simulados externos. `createSimuladoAction`, `saveSimuladoAnswersAction` e `finishSimuladoAction` não têm nenhum chamador na UI.
- A Fase I (25/09) já registrava o módulo de questões como "desligado". Não é um bug de gravação: o fluxo que gravaria não é alcançável.
- Não é falta de dado de base: há 67 questões ativas e 3 usuários têm disciplinas com questões.
- O único simulado em produção é um registro manual (sem `simulado_questions`, `mode`/`started_at` nulos) — corretamente não gera tentativas.
- Sessões de estudo não gravam em `question_attempts` por desenho (lote sem `question_id`, FK obrigatória). Correto; não forçar.

**`review_items` — classe J (preparado, fluxo manual por decisão de produto):** criação só pelo aluno, em Revisões → "Adicionar à revisão" (decisões D1/D2 da Fase I). O caminho está ligado na UI e o contrato com o banco está correto; ninguém usou ainda. Não existe — e não deve ser presumida — a ligação "tentativa de questão → item de revisão": o CHECK de `source_type` só aceita tópico/subtópico do edital.

**Dado real de desempenho existe:** 145 sessões com questões registradas (1.525 respondidas, 1.061 corretas, 2 usuários) em `study_history.metadata`, e as estatísticas já as consomem.

## 4. Fluxo real

Ver `docs/question-review-data-pipeline.md` (seções 3 e 4) — fluxograma completo do simulador e ciclo de vida das revisões.

## 5. Arquivos analisados

`simulados.actions.ts`, `simulado-engine.ts`, `simulado-records.actions.ts`, `question-attempt.service.ts`, `session-orchestrator.ts`, `review.actions.ts`, `review.repository.ts`, `fsrs-scheduler.ts`, `add-to-review-modal.tsx`, `reviews-view.tsx`, `simulados-view.tsx`, `simulado-result.tsx`, `app/(protected)/simulados/page.tsx`, e todos os leitores de `question_attempts` listados no documento do pipeline. No banco: colunas, constraints, índices, triggers, grants e policies de `question_attempts`, `review_items`, `review_history`, `review_sessions`, `simulados`, `simulado_questions`; contagens agregadas.

## 6. Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/application/simulados/simulado-finalize.ts` (novo) | `buildSimuladoAttemptRows` (puro) e `persistSimuladoFinalization` (compare-and-set + rollback de status) |
| `src/application/simulados/simulados.actions.ts` | finalização passa a usar o helper; removido o `UPDATE` incondicional de `finished_at` em `finishSimuladoAction`; contagem "só erradas" da configuração usa a leitura ordenada `fetchLastAttemptMap` |
| `src/application/simulados/simulado-finalize.test.ts` (novo) | 17 testes |
| `package.json` | teste novo registrado no script `test` |
| `docs/question-review-data-pipeline.md` (novo) | documentação do pipeline |
| `docs/g2-9-question-review-pipeline-report.md` (novo) | este relatório |

## 7. Migrations

Nenhuma. A idempotência veio da condição do `UPDATE`, sem constraint nova.

## 8. Testes

17 novos em `simulado-finalize.test.ts`: acerto, erro, questão em branco, colunas NOT NULL/CHECK, `user_id` do servidor, finalização normal, duplo clique/retry, duas finalizações concorrentes, simulado já FINISHED, simulado CANCELED, outro usuário, falha ao gravar tentativas + retry, erro na transição de status, simulado sem respostas, e três testes de fiação. Limitação documentada no próprio arquivo: o duplo em memória não aplica RLS/CHECK; o contrato real foi conferido no banco.

## 9. Problemas corrigidos

1. **Tentativas duplicadas na finalização (P1 latente, integridade de dados).** `buildResultPayload(finalizing=true)` não conferia o status: cada chamada repetida (duplo clique, timeout + clique, retry depois de sucesso, duas abas) reinseria todas as tentativas — sem chave única, cada questão virava 2+ linhas e todas as estatísticas de acerto contariam em dobro.
2. **Simulado cancelado podia ser "ressuscitado".** Finalizar um simulado CANCELED trocava o status para FINISHED e gravava tentativas.
3. **Perda silenciosa de respostas.** O status virava FINISHED antes da gravação das tentativas; se a gravação falhasse, o erro só ia para o console e não havia como tentar de novo. Agora o status volta a IN_PROGRESS e o erro chega ao usuário.
4. **`finished_at` sobrescrito** a cada nova chamada sobre um simulado já finalizado.
5. **Contagem "só erradas" divergente do pool real** na tela de configuração (leitura sem `ORDER BY`).

Todos estão num caminho hoje inalcançável pela UI — nenhum dado de produção foi afetado. Corrigidos agora porque são o único ponto de gravação de `question_attempts` e quebrariam as estatísticas no dia em que o simulador voltar.

## 10. Problemas não corrigidos

- **Reativar o simulador interno** — decisão de produto (a UI foi removida deliberadamente). Não recriei a interface.
- **Questão errada → item de revisão** — fora do escopo (decisão D1, e o schema não aceita).
- `registerAttempt`/`getUserAttempts` sem chamador — mantidos e documentados, não apagados.
- Escritas em modo suporte são bloqueadas pela RLS (comportamento atual do desenho, não alterado).

## 11. Limitações históricas

Não existe histórico por questão antes desta data e ele não deve ser preenchido retroativamente (os dados de sessão são agregados). Se o simulador voltar, a coleta por questão começa na primeira finalização após a reativação.

## 12. Impacto nas estatísticas

Nenhuma mudança no que é exibido hoje (`question_attempts` vazio contribui 0, como antes). As telas já usam a fonte real (`study_history.metadata`). Com o simulador reativado, as tentativas entram sem contagem dupla.

## 13. Impacto no futuro Mentor IA

Atualiza `docs/ai-mentor-readiness.md`: análise "por questão / por tipo de erro" continua sem dado e só passa a ter com o simulador ativo. Análise por disciplina já é possível com `study_history` e `simulado_disciplines`.

## 14. Recomendação de próxima fase

Decidir o destino do módulo de questões: (a) reativar o simulador interno com uma interface nova sobre as actions já existentes (agora idempotentes), ou (b) retirar formalmente o código e as leituras de `question_attempts`. Enquanto não houver decisão, nenhuma ação técnica adicional é necessária neste pipeline.

## Comandos

```
npm test              → 1632 testes, 1632 passando (1615 + 17 novos)
npx tsc --noEmit      → 0 erros
npm run build         → sucesso
npm audit --omit=dev  → 0 vulnerabilidades
npm audit             → 7 (4 high, 3 moderate), só devDependencies (ESLint/Capacitor CLI), inalterado
```
