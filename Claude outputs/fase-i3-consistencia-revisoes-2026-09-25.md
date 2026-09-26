# NomeIA — Fase I.3: consistência transversal do sistema de revisões

**Data:** 25/09/2026
**Escopo:** as três inconsistências apontadas na auditoria da Fase I.2. Nenhuma funcionalidade nova, nenhuma decisão D1–D9 alterada, nenhum DDL.
**Git:** nada commitado, nada enviado. Só `git status --short`, `git diff --stat` e `git diff --check`.

---

## CORREÇÕES

Onze arquivos: oito alterados e três testes novos.

| Arquivo | O que mudou |
|---|---|
| `src/application/review-engine/review.repository.ts` | passa a **exportar** a regra de item ativo (`activeReviewItemsOnly`) e a usá-la nas próprias consultas, em vez de repetir os filtros à mão |
| `src/application/study-analytics/statistics-center.action.ts` | a leitura de `review_items` das Estatísticas aplica essa mesma regra |
| `src/application/study-analytics/statistics-review-items-active.test.ts` | **novo** — regressão do filtro (ativo, suspenso, arquivado, outro aluno) e da fonte única |
| `src/domain/mentor-ai/mentor-ai.models.ts` | o `IntelligenceContext` deixou de exigir um bloco de revisões que ninguém preenchia |
| `src/application/mentor-ai/hub/intelligence.hub.ts` | saíram os três zeros fixos de revisão |
| `src/application/mentor-ai/engine/prompt-builder.ts` | o prompt não fala mais de revisões (nem no texto, nem no JSON compacto) |
| `src/application/mentor-ai/mentor-reviews-no-fake-zero.test.ts` | **novo** — nenhum zero inventado volta, e o mentor não passa a consultar as tabelas de revisão |
| `src/infrastructure/email/email.templates.ts` | texto do lembrete corrigido; rótulo do e-mail de boas-vindas alinhado ao nome do recurso |
| `src/infrastructure/email/study-reminder-review-wording.test.ts` | **novo** — nenhum template promete cartões de memorização |
| `src/application/performance-fase-f1.wiring.test.ts` | a garantia de paginação da leitura de `review_items` das Estatísticas acomoda o novo invólucro |
| `package.json` | os três testes novos entraram na suíte |

## ESTATÍSTICAS

O problema era de **semântica divergente**, não de cálculo: `computeRevisionStatistics` já usava o mesmo dia de São Paulo e a mesma noção de atrasado/hoje/próximo da fila de Revisões. O que divergia era a consulta — ela trazia todos os `review_items` do aluno, sem os filtros de suspensão e arquivamento (colunas que só passaram a existir na Fase I.1). Resultado: suspender um tópico o tirava da fila de Revisões e ele continuava contando como pendente em `/estatisticas`.

A correção não foi copiar dois filtros para lá. A regra de "item ativo" virou **uma função só**, exportada pelo repositório de revisões — a camada que já era dona dessa definição:

```ts
export function activeReviewItemsOnly<Q extends { is(column: string, value: null): Q }>(query: Q): Q {
  return query.is("suspended_at", null).is("archived_at", null)
}
```

Ela é aplicada nos dois lados: nas quatro contagens da fila, nas listas de vencidas e de próximas e na busca da próxima revisão (dentro do repositório), e agora também na leitura das Estatísticas. Não há mais filtro manual solto — o único lugar onde `suspended_at` aparece "cru" é a lista de itens **suspensos** (`listFlagged`), que por definição filtra o contrário.

Tratamento passou a ser:

| Situação | Estatísticas | Fila de Revisões |
|---|---|---|
| Item ativo (nem suspenso nem arquivado) | conta | aparece |
| Item **suspenso** | não conta | não aparece (fica na lista de suspensas) |
| Item **arquivado** | não conta | não aparece (fica na lista de arquivadas) |
| Item de outro aluno | não conta | não aparece |

A definição de "pendente" que já existia foi mantida: neste motor `totalPending` são os itens agendados (atrasados + de hoje + próximos). O teste mostra a diferença concreta com o mesmo conjunto de dados — três itens ativos e dois inativos vencidos: **agora 1 atrasada e 3 agendadas; antes 3 atrasadas e 5 agendadas**. E sem item nenhum o resultado continua sendo zero medido, com `completionRate` em `null` (não 0%).

A contagem de revisões **concluídas** nos últimos 30 dias (`review_history`) não mudou: uma revisão que aconteceu aconteceu, independentemente de o tópico ter sido suspenso depois.

Verifiquei também se havia mais algum lugar contando `review_items` como pendente: não há. Hoje só duas camadas leem essa tabela — o repositório de revisões (12 consultas) e as Estatísticas (1). O replan devolve mapa vazio sem consultar (D6, desde a I.1), o widget do Dashboard saiu na I.2 e as Conquistas contam `review_history`, não `review_items`.

## MENTOR

O `IntelligenceHub` montava isto, sem nenhuma consulta por trás:

```ts
reviews: { totalOverdue: 0, criticalOverdue: 0, itemsToReviewToday: 0 }
```

E o `PromptBuilder` mandava ao mentor `"Revisões: Atrasadas Críticas: 0"` mais o bloco inteiro no JSON compacto. Com a fila de revisões cheia, o mentor lia zero — um número inventado apresentado como medido.

Como as revisões vivem somente na própria área (D6), a solução foi **remover o campo**, que era a preferência indicada: sem fonte real, o mentor não fala de revisões em vez de falar com dado falso. Três lugares:

1. **contrato** (`mentor-ai.models.ts`) — o bloco `reviews` saiu do `IntelligenceContext`, com o comentário explicando que ele volta junto com a consulta real, nunca antes dela;
2. **hub** — o objeto de zeros saiu;
3. **prompt** — saiu a linha "Revisões / Atrasadas Críticas" do texto humano e o `rev:` do JSON do LLM.

Nada foi criado no lugar: nenhuma consulta nova, nenhuma camada de agregação, nenhum KPI, nenhum `undefined` vazando para o prompt. O campo simplesmente não existe mais no contrato, então não há como voltar a preenchê-lo com zero sem uma mudança deliberada de tipo — e o teste falha se alguém tentar. Verifiquei que nada mais lia `context.reviews`: o único consumidor era o prompt (o `RuleEngine` usa performance, estudo e burnout, não revisões).

O `TypeScript` valida o resto: se algum lugar dependesse do campo, o build teria quebrado — não quebrou.

## E-MAIL

**Lembrete de revisão** (caso `pending_review`), antes:

> Você possui **7 flashcards/tópicos** aguardando revisão hoje para fixação na memória de longo prazo.

Depois:

> Você tem **7 tópicos do edital** aguardando revisão hoje, para fixação na memória de longo prazo.

Com um único item o texto vai no singular ("1 tópico do edital", assunto "1 revisão pendente") e, quando não há contagem, o texto diz "tópicos do edital" sem inventar número nem usar o antigo "alguns". O botão continua levando a `/dashboard/reviews`. Os outros três motivos do lembrete (meta diária, sequência, disciplina inativa) ficaram intactos.

Procurei outros templates prometendo o mesmo recurso e achei **um**: o e-mail de boas-vindas listava "**Revisões Inteligentes:** Fixe o conteúdo com algoritmos de repetição espaçada". Não mencionava cartões, mas usava um nome que o produto não usa (a regra de nomenclatura da Fase I.1 é "Revisões", sem "Inteligente"). Ficou:

> **Revisões:** Fixe o conteúdo com repetição espaçada — o intervalo de cada tópico é calculado pelas suas respostas.

Nenhum envio foi implementado e nenhuma integração criada: `sendStudyReminderEmail` continua sem nenhum disparador, exatamente como estava. O teste cobre os textos renderizados de verdade (chama os templates) e ainda checa que o arquivo inteiro não menciona cartões de memorização em lugar algum, nem em comentário.

## FORA DO ESCOPO

Confirmado, item por item:

- **Flashcards continuam fora.** Nada foi criado; a única coisa que mudou foi um texto que os prometia. (Lembrete: `study_type: "FLASHCARDS"` no histórico de estudo é outra coisa — é o aluno registrando que estudou com flashcards fora do app, com centenas de sessões reais no banco. Intocado.)
- **Revisão de questões continua fora.** As ações legadas seguem removidas (I.2) e o teste que impede o retorno continua passando.
- **Revisão automática continua fora.** Nenhum estudo, sessão ou simulado cria revisão.
- **Órfãos de simulado intocados.** `SimuladoResultView` e `getSimuladoResultAction` não foram tocados, nem para "limpar".
- **Sem integração nova com Revisões** em Meu Dia, metas, planejamento, Dashboard ou Mentor. Sem limites diários, sem métricas novas, sem widget novo.
- **FSRS intocado:** `ts-fsrs`, `fsrs-scheduler.ts`, a porta `ReviewScheduler`, `learning_steps`, agendamento, fila e sessão não mudaram. A única alteração no módulo de revisões foi extrair para uma função os filtros de item ativo que já estavam nas consultas — os 35 testes de serviço e os de wiring confirmam o comportamento idêntico.
- **Cycle Engine intocado:** `registerStudyToCycle`, `study_cycles`, `study_cycle_sessions`, `study_cycle_items`, cursor, rounds e reconciliação não foram tocados.

## BANCO

- **Nenhuma migration criada.**
- **Nenhum DDL executado** — nesta fase não houve nenhuma chamada de escrita ao banco, de nenhum tipo.
- **Nenhuma alteração** em `review_items`, `review_history`, `review_sessions`, RLS, índices ou constraints.
- A migration da Fase I.1 (`20260925_review_system_fsrs.sql`) **não foi reaplicada**.

As mudanças desta fase são todas de código: um filtro a mais na consulta das Estatísticas, um campo a menos no contrato do mentor e dois textos de e-mail.

## TESTES

| Comando | Resultado |
|---|---|
| `npm test` | **1227 testes, 1227 passando, 0 falhando** (172 suítes) |
| `npx tsc --noEmit` | sem erros |
| `npm run build` | compilou com sucesso; `/dashboard/reviews` e `/estatisticas` presentes |

22 testes novos, em três arquivos:

**A) Estatísticas** (9) — item ativo é contado; suspenso não; arquivado não; de outro aluno não; o número que a página mostra sai certo e a consulta antiga daria 5 em vez de 3; sem item algum o resultado é zero medido com taxa `null`; a consulta das Estatísticas passa pela regra única; as Estatísticas não repetem os filtros à mão; o repositório não tem mais filtro manual.

**B) Mentor** (6) — o hub não monta bloco de revisão; o contrato não exige campos sem fonte; o prompt não menciona número de revisão; nenhum zero fixo sobrou em nenhum arquivo do mentor; o mentor não passou a consultar as tabelas de revisão (D6); e o prompt montado a partir de um contexto real não contém texto de revisão.

**C) E-mail** (7) — nenhuma menção a cartões no assunto, HTML ou texto; terminologia de tópicos do edital; singular com um item; sem contagem não inventa número; os outros motivos do lembrete seguem intactos; boas-vindas descreve Revisões pelo nome certo; o arquivo de templates não menciona o recurso inexistente.

Nenhum teste foi removido ou enfraquecido. Um teste da Fase F.1 foi ajustado (não relaxado): ele exigia que a leitura de `review_items` das Estatísticas começasse com `supabase.from(...)` logo após `fetchAllRowsPaged` — agora existe o invólucro `activeReviewItemsOnly(...)` no meio. A asserção passou a aceitar o invólucro e continua exigindo `fetchAllRowsPaged`, que é a garantia que ela protege.

**Busca estática final:** `totalOverdue`, `criticalOverdue`, `itemsToReviewToday` → nenhuma ocorrência fora dos testes que impedem o retorno. Texto de cartões de memorização → nenhuma ocorrência (só a citação no comentário do teste). `review_items` → lido apenas pelo repositório de revisões e pelas Estatísticas, ambos com a regra de item ativo. `suspended_at`/`archived_at` → só no módulo de revisões (as ocorrências em `study-plan` são da coluna `archived_at` de `study_plans`, outra tabela).

## GIT

```
git status --short   → 242 entradas
                        208 M  (160 só CRLF/LF · 48 com mudança real)
                         11 D  (nenhuma nova nesta fase)
                         23 ?? (novos; 3 são os testes desta fase)

git diff --stat dos arquivos rastreados desta fase:
  package.json                                        |  3 +-
  src/application/mentor-ai/engine/prompt-builder.ts  | 13 ++--
  src/application/mentor-ai/hub/intelligence.hub.ts   |  6 ---
  src/application/performance-fase-f1.wiring.test.ts  | 63 ++++++++++++---
  src/application/study-analytics/statistics-center.action.ts | 18 ++++--
  src/domain/mentor-ai/mentor-ai.models.ts            | 18 ++++---
  src/infrastructure/email/email.templates.ts         | 18 ++++--
  7 arquivos, 108 inserções, 31 remoções
  (o oitavo arquivo alterado, review.repository.ts, é novo da Fase I.1 e aparece em ??)

git diff --stat (global)  → 215 arquivos (inclui os 160 de fim de linha e as fases anteriores)
git diff --check          → sem apontamentos nos arquivos desta fase
```

Nenhum commit, nenhum push, nenhuma alteração de remote.

**Sobre EOL, com precisão:** não normalizei nada e não rodei `dos2unix`, prettier global nem `.gitattributes`. A lista de "somente CRLF/LF" caiu de 161 para 160 por um motivo específico e vale você saber: `src/domain/mentor-ai/mentor-ai.models.ts` estava nessa lista (arquivo com CRLF na pasta, LF no HEAD) e foi um dos que **precisei editar** nesta fase; ao ser reescrito, voltou a LF junto com a mudança real. Ou seja, nenhum arquivo foi tocado *apenas* por fim de linha — mas esse arquivo, que eu tinha de editar de todo modo, saiu do bolo do CRLF. Os outros quatro arquivos de código que editei já estavam em LF. Os 160 restantes (`docs/`, `.agents/skills/`, `.sql`) continuam exatamente como estavam.

## PARA VOCÊ FAZER

1. `npm install` se ainda não rodou desde a Fase I.1 (dependência `ts-fsrs@5.4.2`).
2. `npm test`, `npx tsc --noEmit` e `npm run build` na sua máquina.
3. Abrir `/estatisticas` e conferir o bloco de revisões: suspender um tópico em `/dashboard/reviews` agora tem de reduzir o número lá também.
4. Revisar e commitar você mesmo, de preferência separando os arquivos de código dos 160 que só têm diferença de fim de linha.
