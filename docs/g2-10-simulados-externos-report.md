# G2.10 — Simulados externos + evolução de desempenho (relatório)

**Data:** 2026-10-03 · **Veredito: 🟢 VERDE**, com uma ressalva: a interface não foi aberta num navegador nesta sessão (não há navegador no ambiente que roda o projeto). Lógica, servidor e componentes foram validados por testes, tipos e build.

Nenhum commit, push, deploy ou escrita em produção (banco consultado só com `SELECT`). Antes de começar, as mudanças parciais do G2.10 anterior (simulador interno, cancelado pelo usuário) foram descartadas na cópia de trabalho; a pasta real nunca as recebeu.

## 1. Arquitetura encontrada

O módulo de registro externo já existia e funcionava: tabela `simulados` (compartilhada com o simulador interno, distinguida por `mode` nulo), `simulado_disciplines` para o desempenho por matéria, `simulado-records.actions.ts`, `simulado-stats.service.ts` (média, evolução, matérias fracas, queda, CEBRASPE), formulário com modos "geral" e "por matéria" e uma tela com métricas, gráfico, filtros e lista. Preservei tudo e corrigi/completei o que faltava.

## 2. Estrutura de dados

Schema real conferido em produção: cobre nome, data, banca, plataforma, concurso, cargo, totais, percentual, tempo, observações e desempenho por disciplina (com FK para o catálogo). **Nenhuma migration.** Dado existente: 1 simulado (120 questões, 7 matérias, todas com `discipline_id`, somas coerentes) — compatível com as novas validações.

## 3. Telas

`/simulados` (mesma página):

- **Métricas** (simulados, questões, média, melhor, último) — inalteradas.
- **Evolução de acertos**: gráfico com eixo fixo 0–100%; média, melhor, pior, último, primeiro → último, últimos 5; tendência só com 3+ simulados.
- **Filtros**: período, concurso, cargo, fonte + novos **matéria** e **desempenho**.
- **Onde você está perdendo pontos** (novo): gargalo principal em uma frase com números reais e demais matérias apontadas com o motivo.
- **Lista** mais recente primeiro, com desempate determinístico.
- **Desempenho por matéria**: cada matéria abre o próprio histórico (simulado a simulado) com média, primeiro, último, melhor, pior, evolução e seta de tendência.
- **Detalhe do simulado**: agora no Dialog do design system (Esc, foco preso, título anunciado); cabeçalho "72 / 100" + percentual; matérias da melhor para a pior; observações e tempo.
- **Formulário**: data padrão = hoje em São Paulo (antes, depois das 21h, sugeria amanhã), data futura bloqueada, `requestId` para não duplicar.

## 4. Server Actions

`saveSimuladoRecordAction`, `getSimuladoRecordsAction`, `getSimuladoRecordAction`, `deleteSimuladoRecordAction`, `getSimuladoFormDisciplinesAction`. Save/delete viraram camadas finas sobre `simulado-record-persistence.ts` (testável com banco em memória).

## 5. Cálculos

Centralizados em `simulado-stats.service.ts` (uma fonte só): `compareRecordsChronologically`, `sortRecordsChronologically`, `sortRecordsRecentFirst`, `trendOfSeries`, `computePanelStats`, `buildEvolutionPoints`, `buildSubjectAnalysis`, `findBottlenecks`, `describeBottleneck`. Validação de entrada em `simulado-record-validation.ts`. Detalhes e fórmulas em `docs/simulados-externos-and-performance.md`.

## 6. Evolução geral

Média ponderada por questões; primeiro → último em p.p.; tendência (UP/STABLE/DOWN, limiar 2 p.p.) só com 3+ simulados. Mudança de comportamento intencional: antes, 2 simulados (60% → 61%) já mostravam "Seu desempenho está evoluindo"; o teste antigo que fixava isso foi atualizado com a explicação.

## 7. Evolução por disciplina

Histórico só com os simulados em que a matéria aparece (ausência ≠ 0%), estatísticas por matéria e tendência com a mesma regra de 3+ pontos.

## 8. Gargalos

Determinísticos: abaixo da média geral (≥ 5 p.p.), aproveitamento < 60%, queda recente (≥ 5 p.p. no último simulado); amostra mínima de 5 questões; marcação "baseado em 1 simulado" quando há poucos dados.

## 9. UX

Sem cards novos de destaque, sem gradiente/sombra/emoji; gargalo como frase única, matérias como lista expansível; eixo do gráfico honesto (0–100%) em vez de ampliar variações pequenas.

## 10. Mobile

Linhas das matérias com área de toque ≥ 44 px (`min-h-11`), barra de progresso escondida no celular (só o número), grades de 3 colunas no detalhe, filtros quebram linha, detalhe com rolagem própria. Não validado visualmente (ver ressalva).

## 11. Testes

| Arquivo | Testes | Cobre |
|---|---|---|
| `simulado-record-validation.test.ts` (novo) | 22 | resultado válido, acertos/erros inválidos, total zero, percentual, data (formato, inexistente, futura, antiga, bissexto), duração, campos obrigatórios, matérias (duplicada por id e por nome, inconsistentes, totais derivados), pontuação |
| `simulado-record-persistence.test.ts` (novo) | 17 | criar, catálogo, dados inválidos não chegam ao banco, duplo clique/reenvio, envios concorrentes, falha de matérias com rollback, editar (substitui, falhas sem perda), troca para resultado geral, ownership em editar/excluir/requestId, simulado interno não editável, segundo clique em excluir |
| `simulado-evolution.test.ts` (novo) | 16 | empate de datas e ordem, independência da ordem de entrada, 0/1/2/vários simulados, tendência, matéria presente em alguns simulados e ausente em outros, ordenação, gargalos |
| `simulado-stats.test.ts` (atualizado) | 39 | fixtures com os campos novos; regra de tendência atualizada |

Limitação documentada nos testes: o banco em memória não aplica RLS/CHECK; a RLS real foi conferida em produção.

## 12. Arquivos alterados

Novos: `src/application/simulados/simulado-record-validation.ts`, `simulado-record-persistence.ts`, os 3 arquivos de teste acima, `docs/simulados-externos-and-performance.md`, este relatório.
Alterados: `simulado-records.actions.ts`, `simulado-stats.service.ts`, `simulado-stats.test.ts`, `src/domain/simulados/types.ts`, `src/features/simulados/components/simulados-view.tsx`, `simulado-record-modal.tsx`, `src/application/achievements/achievements.action.ts` (conquistas contam só simulados concluídos), `package.json` (3 testes registrados), `src/application/accessibility-g1-10.test.ts` e `global-data-rls-g1-2.test.ts` (ver item 14).

## 13. Migrations

Nenhuma.

## 14. Problemas encontrados

Corrigidos: total 0 virava 1 em silêncio; servidor não validava matérias (duplicadas, acertos > questões, id fora do catálogo) nem data/duração; registros podiam duplicar em retry; edição apagava as matérias antes de gravar as novas; listagem incluía simulados internos e de qualquer status; empate de data embaralhava "último resultado" e a tendência; tendência com 2 pontos; data padrão do formulário em UTC; eixo do gráfico; excluir dizia "sucesso" mesmo sem apagar nada; conquistas contavam simulados não concluídos.

Achado lateral: **32 arquivos de teste (424 testes) não estão registrados no script `npm test`** — nunca rodam. Rodei todos: 418 passam. Dois falhavam por mudanças minhas (um teste lia o arquivo antigo do Dashboard depois da divisão da Fase F.3; outro conferia a validação no lugar antigo) e foram ajustados. **Dois continuam falhando e não são desta fase**: `admin-security-a1-1.wiring.test.ts` (A1.1-B, `auditSupportAction`) e `conclude-cycle-round.wiring.test.ts` (segurança de `concludeCurrentCycleRound`) — não mexi (área de ciclo/admin, fora do escopo).

## 15. Limitações e próximos passos

- Validar a tela num navegador (desktop e celular) antes de considerar a UX fechada.
- Decidir se os 32 testes órfãos entram no `npm test` (e investigar os 2 que falham).
- Cruzar desempenho por matéria com horas de estudo (`study_history`) — viável sem mudar arquitetura; documentado como próxima fase.
- Pendência conhecida fora do escopo: no simulador interno (inativo), o "Finalizar" manual não grava o resultado — só relevante se o simulador for reativado.

## Comandos

```
npm test              → 1687 testes, 1687 passando (1632 + 55 novos)
npx tsc --noEmit      → 0 erros
npm run build         → sucesso
npm audit --omit=dev  → 0 vulnerabilidades
npm audit             → 7 (4 high, 3 moderate), só devDependencies (ESLint/Capacitor CLI), inalterado
```
