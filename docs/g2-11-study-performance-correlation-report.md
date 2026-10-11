# G2.11 — Estudo × desempenho em simulados (relatório)

**Data:** 2026-10-03 · **Veredito: 🟢 VERDE**, com a mesma ressalva da G2.10: a tela não foi aberta num navegador (não há navegador no ambiente do projeto). Cálculo, leitura, componentes e atualização estão cobertos por testes, tipos e build.

Nenhum commit, push, deploy ou escrita em produção (banco consultado só com `SELECT`). Antes de começar, a cópia de trabalho foi alinhada com a sua pasta, que tinha duas alterações novas na importação de planilhas (`import-history-modal.tsx`, `normalize.ts`) — preservadas, não tocadas.

## 1. Arquitetura encontrada

`study_history.discipline_id` e `simulado_disciplines.discipline_id` apontam para o mesmo catálogo `disciplines`. Os cálculos de desempenho por matéria já existiam (G2.10) e o motor de Estatísticas já definia o que é "tempo estudado" (`duration_minutes`, dia em São Paulo). Nenhuma tabela nova foi necessária.

Produção (só leitura): 5.410 sessões, nenhuma sem disciplina, 22 com duração 0, nenhuma acima de 12 h, nenhuma duplicada, nenhuma disciplina órfã.

## 2. Fontes de dados

Tempo: `study_history` (fato realizado). Desempenho: simulados externos, via `getSimuladoRecordsAction` e `buildSubjectAnalysis` (G2.10). `question_attempts`: fora do escopo (decisão G2.9 mantida).

## 3. Cálculos

`study-performance.ts`: `periodWindow`, `aggregateStudyMinutes`, `classifyStudyPerformance`, `buildStudyPerformance`, `formatPpSigned`. Formatação de horas reaproveita `formatDurationRaw` (a mesma de Estatísticas).

## 4. Thresholds

Evolução +3 p.p., alta +8 p.p., queda −3 p.p., muito estudo 3 h/semana, pouco estudo 1 h/semana, mínimo de 2 simulados para evolução, tendência com 3+ (G2.10), sessão inválida acima de 24 h. Tabela e ordem das regras em `docs/study-performance-correlation.md`.

## 5. Telas

`/simulados`, nova seção **Estudo × desempenho por matéria** (logo após os gargalos):

- período 4 semanas / 8 semanas / todo o período, com as datas exibidas;
- resumo: horas de estudo, nº de matérias, nº de simulados; avisos de estudo sem matéria e de sessões descartadas;
- desktop: tabela (Matéria, Estudo, Simulados, Média, Primeiro → último, Evolução, Situação);
- celular: cartões compactos com área de toque ≥ 44 px;
- detalhe da matéria em Dialog: 9 números, frases, linha do tempo dos simulados e estudo por semana;
- aviso permanente: "Os números mostram estudo e resultados do mesmo período, lado a lado. Eles não indicam que um causou o outro."

A página também deixou de piscar o spinner de tela inteira ao salvar/excluir (só no primeiro carregamento), o que preserva o período escolhido.

## 6. Insights

Frases factuais por matéria (horas no período; resultado primeiro → último; dados suficientes ou não; o aviso de "muito estudo, pouca evolução"). Nenhuma afirma causa — travado por teste.

## 7. Performance

3 leituras por cálculo, nenhuma por disciplina: simulados (mesma action da página), sessões do período paginadas (`fetchAllPagesInParallel`, 4 colunas, ordenação estável por `started_at, id`, teto de 50.000) e nomes das matérias em lote de 100 ids.

## 8. Cache

A action não tem cache. A seção recalcula ao montar, ao trocar o período e quando a página incrementa `refreshKey` — o que acontece depois de registrar, editar ou excluir um simulado. Um estudo registrado em outra tela aparece ao abrir Simulados de novo (a página busca os dados ao montar).

## 9. Testes

`study-performance.test.ts` (28): períodos de 4/8 semanas e tudo (inclusive limites de data), sessões duplicadas, duração inválida, sessões sem disciplina, distribuição semanal, nenhuma/uma/várias disciplinas, disciplina sem estudo, sem simulado, matéria sem id do catálogo, 1/2/3+ simulados, datas iguais, ausência de causalidade, todas as classificações (evolução, alta, estável, queda, muito estudo/pouca evolução, pouco estudo, dados insuficientes), simulado criado/editado/excluído e estudo registrado refletindo na análise, e travas de que a tela recarrega e a action não tem cache.

`test-registry.test.ts` (2): todo `*.test.ts` precisa estar no `npm test`, e o script não pode listar arquivo inexistente.

## 10. Auditoria dos testes órfãos

Ver `docs/orphan-tests-audit.md`. Os 32 arquivos (424 testes) são travas de funcionalidades atuais; nenhum histórico ou duplicado. 4 testes falhavam: 2 por mudanças da G2.10 e 2 por uma mudança intencional da G2.6.1 que não tinha chegado a eles. Os 4 foram ajustados ao comportamento atual documentado (sem afrouxar asserções) e os 32 entraram no `npm test`.

## 11. Problemas encontrados

- 32 arquivos de teste fora do `npm test` (resolvido + trava para não voltar).
- 2 testes que eu tinha quebrado na G2.10 sem perceber, justamente por não rodarem (corrigidos).
- Catálogo com matérias quase iguais em entradas diferentes ("Raciocínio Lógico" / "Raciocínio Lógico e Matemático" / "Raciocínio Lógico-Matemático"; "Direito Administrativo" / "Noções de Direito Administrativo"): horas e simulados só se encontram quando usam o mesmo id.

## 12. Problemas não corrigidos

- Unificar entradas duplicadas do catálogo — decisão de produto e de dados (mexe em histórico, ciclos e planejamento de quem usa cada id). Não tentei adivinhar por nome.
- Período personalizado (datas livres) — a página não tem seletor de datas; fica para quando houver demanda.

## 13. Limitações

- Correlação só por id do catálogo (ver acima).
- Média por matéria é ponderada por questões (igual à G2.10).
- Horas de "todo o período" dependem de quanto histórico existe; o "por semana" usa do primeiro registro até hoje.
- Interface não validada visualmente nesta sessão.

## 14. Próximos passos para o Mentor IA

O `StudyPerformanceReport` já entrega, por matéria, horas, evolução, situação e frases determinísticas. O Mentor IA pode conversar sobre esses números (explicar, perguntar sobre a qualidade do estudo de uma matéria em "muito estudo, pouca evolução"), sem recalculá-los nem afirmar causa. Antes disso, vale resolver a duplicidade do catálogo, que é o que mais limita o cruzamento hoje.

## Comandos

```
npm test              → 2141 testes, 2141 passando (1687 + 28 + 2 novos + 424 órfãos registrados)
npx tsc --noEmit      → 0 erros
npm run build         → sucesso
npm audit --omit=dev  → 0 vulnerabilidades
npm audit             → 7 (4 high, 3 moderate), só devDependencies (ESLint/Capacitor CLI), inalterado
```
