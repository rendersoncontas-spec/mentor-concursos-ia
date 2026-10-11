# G2.15 — Mentor IA: fundação de inteligência do aluno — relatório

Data: 2026-10-06. Produção só com SELECT. Migration G2.12 **não aplicada** (o contexto funciona sem ela). Nenhum LLM integrado. Sem commit/push/deploy.
Detalhes: `docs/mentor-ai-context.md` (contexto, limites, fontes) e `docs/mentor-ai-prompt-contract.md` (contrato futuro com o LLM).

**Veredito: VERDE** — contexto, qualidade, insights com evidência, recomendações candidatas, tela `/mentor`, segurança e cache funcionando; 2261/2261 testes, tsc e build OK. Ressalva fora do código: os avisos do `mammoth` não têm correção (item 11).

## 1. Dados utilizados
`study_history` (5.413), simulados externos (1 + 7 matérias), `review_items` (0), `question_attempts` (0), ciclos ativos (3), planos ativos (3), metas de `profiles`, `user_disciplines` (88, status do edital), `user_targets` (4). Vazias hoje: revisões, questões avulsas, `edital_topic_progress`. Nenhuma tabela nova.

## 2. Arquitetura
`getStudentMentorContextAction` (servidor, sem parâmetros) → payload da Central de Estatísticas + leitor do ciclo + metas + alvo → `buildStudentMentorContext` (puro) → `computeContextQuality` → `buildMentorInsights` → `buildRecommendationCandidates`. A tela `/mentor` só renderiza o JSON.

## 3. StudentMentorContext
`target, study, simulations, reviews, cycle, planning, goals, edital, disciplines, contextQuality, insights, recommendations, identity, sources`. Cada seção tem `status` (OK/NO_DATA/UNAVAILABLE); sem fonte → `null`. Disciplinas na identidade canônica, com `mergedNames`.

## 4. Métricas
Todas reaproveitadas: motor das Estatísticas (buckets, time cards, sequência, disciplina, plano, revisões, edital), G2.10 (painel, análise por matéria, gargalos), G2.11 (classificação estudo × desempenho), leitor oficial do ciclo. Única conta nova: o **proporcional da meta até hoje** (meta × dias decorridos da semana ÷ 7), documentado e exposto na evidência.

## 5. contextQuality
EMPTY / LOW / MEDIUM / HIGH com limites objetivos (sessões em 28 dias, total de sessões, simulados, revisões, ciclo, plano, meta). Produção: 2 EMPTY, 2 LOW, 2 MEDIUM, 0 HIGH (ninguém tem 2 simulados).

## 6. Insights
13 tipos factuais, cada um com `period`, `evidence` e frase sem causalidade (teste automatizado). Ex.: "Você estudou 12h 40min nos últimos 7 dias…", "Contabilidade apresenta média de 63,3% nos simulados.", "Você possui 5 revisões vencidas.".

## 7. Recomendações
7 tipos candidatos (`LOW_STUDY_VOLUME`, `HIGH_OVERDUE_REVIEWS`, `LOW_SIMULADO_PERFORMANCE`, `DECLINING_DISCIPLINE`, `HIGH_PROGRESS`, `STUDY_BELOW_GOAL`, `INSUFFICIENT_DATA`), com evidência e motivo factual; nenhuma é executada. Limites de estudo × desempenho importados da G2.11.

## 8. UI
`/mentor` ("Mentor de estudos" na barra lateral, rota protegida): faixa de métricas (horas 7 dias, meta, simulados, revisões vencidas), matéria que merece atenção, evolução, fatos e pontos para acompanhar. Usuário sem dados: "Dados insuficientes para avaliar sua evolução.". "—" onde não há dado. Visual nos componentes do redesign (MetricStrip, Badge, EmptyState). Não foi conferida em navegador (exige sessão real); validada por build e testes.

## 9. Cache
Sem cache próprio. O contexto usa o payload das Estatísticas (5 min, invalidado em estudo salvo/excluído, simulado criado/editado/excluído, revisão, meta, nome/vínculo de disciplina e rename global — conferido por teste); ciclo, metas e alvo são lidos a cada abertura. Vínculo de alias feito por SQL: até 5 min.

## 10. Segurança
Action sem parâmetros; aluno resolvido no servidor (`getEffectiveUserId`); todas as leituras filtram pelo aluno (RLS por cima); somente leitura; só a action é exportada do arquivo `"use server"`; nenhum dado administrativo; nenhum `fetch` externo/LLM (teste).

## 11. Dependências (npm audit)
- `source-map-js`: corrigido na G2.14 (1.2.2, transitiva de `@tailwindcss/postcss`/`postcss`, uso em build). Não aparece mais.
- `mammoth` 1.12.1 (direta, produção, leitura de .docx no importador de edital) → `argparse` 1.0.10 → `sprintf-js` (GHSA-hp3w-g68c-fv3c, DoS, faixa afetada `*` = **nenhuma versão corrigida**). `mammoth` 1.13.0 (última) ainda depende de `argparse ~1.0.3`. O `argparse` só é usado pelo CLI `bin/mammoth`; o app chama `extractRawText` da biblioteca, que não o carrega → não explorável pelo app. "Correção" do npm = downgrade para `mammoth` 0.3.29 (quebra). Não alterado.
- Dev: `@next/eslint-plugin-next` (braces/micromatch/fast-glob) e `@capacitor/cli` (uuid/xcode) — só com troca de major; não alterados.

## 12. Testes
2238 → **2261** (+23), `student-mentor-context.test.ts`: usuário novo, sem estudo, sem simulados, sem revisões, completo, meta sem estudo, revisões sem simulado, uma disciplina, falha de leitura, alias + canônica (estudo no alias + simulado na canônica = uma disciplina, nome pessoal), ambígua separada, evolução, queda (evidência estruturada), estável, metas (default ignorado, não default aceito), ciclo, contextQuality (EMPTY/LOW/MEDIUM/HIGH), insights, recomendações, sem causalidade, ownership/somente leitura, cache (invalidações), sem LLM, tela, alvo.

## 13. Problemas encontrados
- `user_targets` **não tem** `exam_name`/`exam_date`; o Dashboard lê com `select("*")` (campos chegam `undefined`, os dados reais vêm do JSON de `main_study_source`). Um `select` explícito dessas colunas quebraria a leitura.
- Metas de questões (100), dias (6) e revisões (5) têm **default no banco**: igual ao default não dá para afirmar que o aluno escolheu.
- `loadActiveCycleOverview` devolve `null` tanto para "sem ciclo" quanto para erro.
- O feed antigo `/dashboard/mentor` (heurístico) grava `mentor_history` a cada visita (5 linhas hoje) e usa médias de energia/foco com `0` quando não há dado.
- Estudo × desempenho (G2.11) descarta sessões > 24 h; as Estatísticas não.

## 14. Problemas corrigidos
- Leitura do alvo extraída para `resolveTargetFields` (Dashboard e Mentor leem igual; o Mentor seleciona só colunas que existem).
- Mentor distingue erro de ausência no ciclo (consulta própria da existência + leitor oficial).
- Defaults do perfil não viram meta no contexto.
- Contexto usa só a regra de horas das Estatísticas (a G2.11 entra apenas como classificação).

## 15. Problemas pendentes
- Feed antigo `/dashboard/mentor`: decidir aposentar (ou parar de gravar `mentor_history`).
- Revisões, questões e progresso de tópicos vazios: o Mentor vai ganhar profundidade conforme o uso.
- `mammoth`/advisories dev sem correção não-quebrante.
- Migration G2.12 e decisões de produto da G2.14 (ciclo classe C, "Noções de X", tópicos da TI).

## 16. Limitações
Sem LLM; contexto por aluno sob demanda (sem histórico de contextos); evolução de simulados precisa de ≥ 2 registros; tela não testada visualmente em navegador.

## 17. Próxima fase
G2.16 — camada de narração por LLM atrás de uma interface (`MentorNarrator`), consumindo só o `StudentMentorContext`, com validação de saída por `id` (contrato em `docs/mentor-ai-prompt-contract.md`), modo "desligado" como padrão, e aposentadoria do feed heurístico antigo.

## Comandos

```
npm test              → # tests 2261 · # pass 2261 · # fail 0
npx tsc --noEmit      → exit 0
npm run build         → ✓ Compiled successfully (rota ƒ /mentor)
npm audit --omit=dev  → 3 moderate severity vulnerabilities (mammoth → argparse → sprintf-js)
npm audit             → 10 vulnerabilities (6 moderate, 4 high)
eslint (arquivos tocados) → nenhum erro novo
```
