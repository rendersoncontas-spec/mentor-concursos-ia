# Mentor IA — contexto estruturado do aluno (G2.15)

```
DADOS REAIS → MÉTRICAS DETERMINÍSTICAS → StudentMentorContext → INSIGHTS / EVIDÊNCIAS → (IA futura)
```

Código: tipos em `src/domain/mentor/student-mentor-context.ts`; montagem pura em `src/application/mentor/student-context.builder.ts`; insights/recomendações/qualidade em `src/application/mentor/mentor-insights.ts`; leitura em `src/application/mentor/student-context.action.ts`; tela em `/mentor`.

## 1. Arqueologia do dado (produção, 2026-10-06, somente leitura)

| fonte | linhas | situação |
|---|---|---|
| `study_history` | 5.413 (3 de 6 alunos) | **fonte de verdade do estudo**; confiável; histórico desde 2020 (importado) |
| `simulados` externos + `simulado_disciplines` | 1 + 7 | existe e é confiável, mas quase vazio (1 aluno, 1 simulado) |
| `review_items` / `review_history` / `review_sessions` | 0 / 0 / 0 | estrutura pronta, **vazia** |
| `question_attempts` | 0 | vazia |
| `study_cycles` / itens / sessões | 3 / 26 / 1.054 | 3 ciclos ativos; sessões são derivadas do histórico (reconstrução) |
| `study_plans` / itens / blocos / replanejamentos | 30 / 808 / 606 / 511 | 3 planos ativos |
| `profiles` (metas) | 6 | `weekly_study_hours` sem default (real quando preenchido: 2 alunos); `weekly_questions_goal`=100, `weekly_study_days_goal`=6, `weekly_revisions_goal`=5 são **defaults do banco** |
| `user_disciplines` (status do edital) | 88 | nenhuma marcada como concluída |
| `edital_topic_progress` | 0 | vazia |
| `user_targets` | 4 (4 ativos) | **não tem** colunas `exam_name`/`exam_date`: data e nome do exame ficam no JSON de `main_study_source` |
| `mentor_history` | 5 | log do feed heurístico antigo (`/dashboard/mentor`); não usado pelo contexto |

Nenhuma tabela nova foi criada.

## 2. Seções do contexto e de onde vêm

| seção | fonte | cálculo reaproveitado |
|---|---|---|
| `study` | `study_history` (payload das Estatísticas) | `buildDayBucketsFromKeys`, `computeTimeCards`, `computeStreaks`, `aggregateBuckets` (duração = `duration_minutes ?? active_minutes`, dia em São Paulo) |
| `disciplines` | sessões + simulados + vínculos + revisões | `computeDisciplineStats`, `buildSubjectAnalysis` (G2.10), `buildStudyPerformance` 4 semanas (G2.11), `computeRevisionStatistics` |
| `simulations` | simulados externos | `computePanelStats`, `buildSubjectAnalysis`, `findBottlenecks` (G2.10) |
| `reviews` | `review_items` ativos + `review_history` 30 dias | `computeRevisionStatistics` |
| `cycle` | ciclo ativo | `loadCycleOverviewById` → `buildCycleOverview` (somente leitura) |
| `planning` | plano ativo | `computePlanning` (planejado ≠ realizado) |
| `goals` | `profiles` | meta de horas × minutos da semana (`computeTimeCards`) |
| `edital` | `user_disciplines.status` | `computeEditalCoverage` |
| `target` | `user_targets` | `resolveTargetFields` (mesma leitura do Dashboard) |

Identidade: todas as disciplinas chegam pela identidade canônica do payload das Estatísticas (G2.13). Nenhuma normalização nova, nenhum fuzzy. Os 4 casos ambíguos continuam como disciplinas próprias.

## 3. Regra contra alucinação

- Sem fonte → `null`; o porquê fica no `status` da seção (`NO_DATA` = o banco respondeu vazio; `UNAVAILABLE` = a leitura falhou).
- `0` só quando é fato (há histórico e o período não teve estudo; há meta e a semana ainda não teve estudo).
- 0 revisões cadastradas ⇒ `reviews.status = "NO_DATA"` e contagens `null` — não é "desempenho ruim".
- Metas iguais ao default do banco (100 questões, 6 dias) **não** são tratadas como meta do aluno (não há como distinguir de "nunca configurou"); diferentes do default, sim. A meta de horas não tem default — quando existe, é do aluno.

## 4. Métricas de estudo

`last7`, `previous7` (dias 8–14), `last28`, `currentWeekMinutes` (semana pelo início configurado), `totalMinutes`, `totalSessions`, sequência atual/maior, último dia de estudo. Por disciplina: minutos em 28 dias e no total, sessões, último estudo.

Observação: Estudo × desempenho (G2.11) descarta sessões > 24 h ao somar horas; as horas do contexto seguem a regra das Estatísticas (sem esse corte). Só a **classificação** G2.11 entra no contexto, para não haver dois números de horas para a mesma matéria.

## 5. contextQuality (limites objetivos)

| nível | regra |
|---|---|
| `EMPTY` | 0 sessões, 0 simulados, 0 revisões ativas, sem ciclo, sem plano e sem meta |
| `HIGH` | ≥ 8 sessões nos últimos 28 dias **e** ≥ 2 simulados **e** ≥ 20 sessões no total |
| `MEDIUM` | (≥ 3 sessões em 28 dias **e** (≥ 1 simulado **ou** ≥ 20 sessões no total)) **ou** ≥ 2 simulados |
| `LOW` | qualquer outro caso com algum dado |

Constantes em `mentor-insights.ts`. Em produção hoje: 2 alunos `EMPTY`, 1 `LOW` (histórico grande, sem estudo há ~2 meses), 1 `LOW` (só plano/meta) e 2 `MEDIUM` (estudo recente; nenhum aluno tem 2 simulados, então nenhum é `HIGH`).

## 6. Insights (fatos com evidência)

| tipo | quando | evidência |
|---|---|---|
| `STUDY_LAST_7_DAYS` | há estudo | minutos, sessões, dias |
| `STUDY_TREND_WEEK` | os 7 dias anteriores tiveram estudo | últimos 7, anteriores 7, diferença |
| `NO_RECENT_STUDY` | último estudo há ≥ 7 dias | data, dias |
| `LAST_SIMULADO` | há simulado | último %, data, total |
| `SIMULADO_EVOLUTION` | ≥ 2 simulados | primeiro, último, variação, total, tendência (≥ 3) |
| `DISCIPLINE_ATTENTION` | gargalo G2.10 | média, motivos, simulados, `lowData` |
| `DECLINING_DISCIPLINE` / `IMPROVING_DISCIPLINE` | ≥ 2 simulados com a matéria e variação ≤ −3 / ≥ +3 p.p. (G2.11) | primeiro, último, variação, simulados, horas 28 d/total |
| `OVERDUE_REVIEWS` | revisões vencidas > 0 (alta ≥ 5) | vencidas, hoje, próximas |
| `GOAL_PROGRESS` | meta de horas | meta, realizado, diferença, proporcional até hoje, dias decorridos |
| `CYCLE_POSITION` | ciclo ativo | volta, voltas concluídas, % da volta, próxima matéria |
| `EDITAL_PROGRESS` | disciplinas vinculadas | total, concluídas, estudando, revisando, não iniciadas |
| `INSUFFICIENT_DATA` | contexto vazio, ou estudo sem simulado | — |

As mensagens são frases factuais em português; nenhuma afirma causa (teste automatizado).

## 7. Recomendações candidatas (nunca executadas)

| tipo | regra | prioridade |
|---|---|---|
| `INSUFFICIENT_DATA` | qualidade `EMPTY` ou `LOW` | média (EMPTY) / baixa |
| `LOW_STUDY_VOLUME` | < 60 min nos últimos 7 dias (limite G2.11) com histórico | alta se 0 min, senão média |
| `HIGH_OVERDUE_REVIEWS` | ≥ 5 revisões vencidas | alta |
| `LOW_SIMULADO_PERFORMANCE` | gargalo G2.10 com faixa baixa | média (baixa com 1 simulado) |
| `DECLINING_DISCIPLINE` | variação ≤ −3 p.p. com ≥ 2 simulados | média |
| `HIGH_PROGRESS` | variação ≥ +8 p.p. (matéria ou geral) com ≥ 2 simulados | baixa |
| `STUDY_BELOW_GOAL` | realizado < proporcional da meta até hoje (meta × dias decorridos ÷ 7) | alta se faltar ≥ metade do proporcional, senão média |

## 8. Consultas, cache e segurança

- **Consultas:** payload da Central de Estatísticas (já paginado, com identidade, cache de 5 min e invalidação em estudo salvo/excluído, simulado criado/editado/excluído, revisão, meta e mudança de disciplina) + 1 linha do ciclo ativo → leitor do ciclo + 1 linha de metas + 1 linha do alvo, em paralelo. Sem N+1, sem consulta por disciplina, identidade lida uma vez (dentro do payload).
- **Cache próprio:** nenhum (o contexto é barato sobre o payload já cacheado; ciclo/metas/alvo vêm sempre frescos).
- **Segurança:** a action não recebe parâmetro; o aluno é resolvido no servidor (`getEffectiveUserId`, inclusive modo suporte auditado); toda leitura filtra pelo id dele; nada é escrito; nenhum dado administrativo sai no contexto.

## 9. Limitações e dados faltantes

- Revisões, questões avulsas e progresso de tópicos do edital estão vazios em produção: as seções existem, mas hoje dizem `NO_DATA`.
- Simulados: só 1 registro no total; evolução real exige ≥ 2.
- Metas de questões/dias iguais ao default não são aproveitadas.
- Sem a migration G2.12, aliases ainda aparecem separados (`identity.knownAliases = 0`).
- O ciclo pode estar inflado pela similaridade de nomes (classe C da G2.14) — o contexto reflete o estado oficial do ciclo, não o corrige.
- Área (`/dashboard/mentor`, feed heurístico antigo) continua existindo e grava `mentor_history` a cada visita; não faz parte deste contexto.

## 10. Arquitetura futura

```
getStudentMentorContextAction()  ──►  StudentMentorContext (JSON)
                                         │
                                         ├─ UI determinística (/mentor)  ← hoje
                                         └─ LLM (narração/explicação)    ← futuro, contrato em docs/mentor-ai-prompt-contract.md
```
O LLM recebe o JSON pronto, nunca o banco; não tem ferramenta de escrita.
