# NomeIA — Fase I.5: correção dos 3 bloqueios do sistema de revisões

**Data:** 25/09/2026
**Escopo:** apenas os achados A1, A2 e A3 da auditoria I.4, mais M4 (o contador da sessão), que a própria auditoria apontou como acoplado ao A3. Nenhuma funcionalidade nova, nenhum DDL, nada commitado.

---

## A1 — o esqueleto de carregamento não promete mais intervalos fixos

**`src/app/(protected)/dashboard/reviews/loading.tsx`** — a descrição era `"Repetição espaçada: 24h · 7d · 15d · 30d · 60d"`, uma escada que não existe em nenhum lugar do código. Agora é exatamente a mesma frase da página real:

> Repetição espaçada: o intervalo de cada tópico é calculado pelas suas respostas

Não criei constante compartilhada: como o brief indicou, sem uma já existente o certo é repetir o texto e não inventar abstração para uma string. O que impede a divergência de voltar é o teste, não a abstração.

**`src/application/fase-h-dados-reais.test.ts`** — a asserção que protegia só `page.tsx` agora:

- proíbe a escada nos **dois** arquivos da rota;
- exige que os dois contenham a **mesma** descrição (era a divergência entre eles que produziu o texto falso);
- e, por regex, proíbe `24h`, `7d`, `15d`, `30d` e `60d` em qualquer um dos dois.

Conferi que o teste realmente pega a regressão: reintroduzi a escada no `loading.tsx`, rodei a suíte (1 falha, com a mensagem "o esqueleto não pode anunciar intervalos fixos") e desfiz.

---

## A2 — erro de consulta deixou de virar zero

### Como o erro é propagado

A regra nova está escrita no topo do repositório: **consulta que falhou devolve `null` — nunca `0`, nunca `[]`.** Zero e lista vazia voltaram a significar uma única coisa: o banco respondeu que não há dados.

| Função | Antes | Agora |
|---|---|---|
| `countActive` | `error ? 0 : count` | `number \| null` |
| `countBuckets` | sempre 6 números | `ReviewCounts \| null` — se **qualquer** uma das seis contagens falhar, o conjunto inteiro é `null` |
| `listDueGroup`, `listUpcoming`, `listFlagged` | `if (error) return []` | `ReviewItem[] \| null` |
| `recentGrades` | `if (error) return []` | `number[] \| null` |
| `nextDueAfter` | `string \| null` (mesmo valor para "sem próxima" e para falha) | `{ dueAt: string \| null } \| null` — objeto = respondeu, `null` = falhou |
| `nextDueItem` | `ReviewItem \| null` | `{ item: ReviewItem \| null } \| null` |

Mostrar cinco contagens certas e uma inventada seria pior do que admitir a falha — por isso o conjunto é tudo-ou-nada.

### Como o serviço distingue os dois casos

`getReviewsOverview` reúne as nove leituras e, se **qualquer uma** devolveu `null`, retorna a visão geral em estado de erro: `counts: null`, listas vazias, `nextDueAt: null`, retenção `{ rate: null, answered: 0 }`. Fora disso, nada muda — zero medido continua chegando como zero.

`ReviewsOverview.counts` passou a ser `ReviewCounts | null`, documentado no domínio; e `ReviewSessionState.remaining` passou a ser `number | null` (fila desconhecida ≠ fila vazia). `startReviewSession` e `getActiveReviewSession` devolvem erro explícito quando a fila não pode ser lida, em vez de abrir uma sessão dizendo "nada para revisar".

### O que a UI faz

**`reviews-view.tsx`** ganhou um caminho de erro antes de qualquer cálculo: com `counts === null`, a página não monta resumo, fila nem seções — todas ficariam zeradas e pareceriam "você não tem revisões", que é exatamente a mentira corrigida aqui. O aluno vê:

> **Não foi possível carregar suas revisões**
> A consulta ao servidor falhou, então não temos como dizer quantas revisões você tem. Nada foi perdido: tente novamente em instantes.

com **Tentar novamente** (reusa o `refresh()` que já existia — nenhum sistema de retry novo) e o botão **Iniciar/Continuar revisão** **habilitado**: a sessão é aberta pelo servidor e não depende das contagens, então não desabilitamos por falta de um dado que não conseguimos ler.

Os três estados ficam distintos: sem revisões → estado vazio normal; erro → estado de erro; com revisões → contagens reais.

**`review-session-modal.tsx`**: a fila desconhecida aparece como `—` (era `0 na fila`), e o **encerramento automático** ao esvaziar a fila agora exige `remaining === 0` — antes, uma falha de leitura zerava o card e a sessão era encerrada sozinha por erro.

### Testes de A2 (`review-load-errors.test.ts`, 15 casos)

O banco falso passou a simular erro de consulta com o mesmo formato `{ error }` do PostgREST (`db.failOn({ table, head, times })`).

- **A)** count = 0 → `counts` com zeros medidos, não erro.
- **B)** count > 0 → números reais.
- **C)** erro na contagem → `counts === null`, nunca 0.
- **D)** erro em **uma** das seis → visão geral em estado de erro.
- **E)** erro na fila / na retenção → estado de erro, não fila vazia.
- **F)** abrir sessão com fila ilegível → erro explícito, não "nada para revisar".
- **G)** erro na contagem após responder → `remaining: null` e **a resposta do aluno segue registrada**.
- Mais estáticos: nenhum `error ? 0` nem `catch → 0` no repositório; assinaturas declarando `| null`; o ramo de erro da view não exibe contagem, não exibe métrica, não diz "Você não tem revisões agendadas" e não desabilita o botão; o modal não voltou a usar `remaining ?? 0`.

---

## A3 — encerrar a sessão não perde mais estudo

### Fluxo antigo

1. sessão ACTIVE → 2. **marca COMPLETED** → 3. lê as respostas → 4. leitura falha e devolve `[]` → 5. `answers.length === 0` → 6. **`study_history` não é gravado** → 7. a sessão já não está ACTIVE → 8. a segunda tentativa cai na trava de idempotência → 9. **o tempo de revisão real é perdido em silêncio**, com o relatório dizendo "nenhum item respondido".

### Fluxo novo

1. localiza a sessão (não ACTIVE → caminho normal idempotente, sem erro);
2. **lê as respostas** (`listSessionAnswers`);
3. havendo respostas, **lê as disciplinas** dos itens respondidos;
4. se qualquer uma dessas leituras falhar → **retorna erro controlado, a sessão permanece ACTIVE**, nada é gravado, e o aluno pode encerrar de novo;
5. só então o **compare-and-swap** (`status = 'ACTIVE'` → `COMPLETED`, com `.select("id").maybeSingle()`) — a trava de idempotência continua exatamente a mesma;
6. se o CAS não afetou linha (outra aba venceu) → retorna sem gravar nada;
7. com respostas → duração real, **um** `study_history` (`REVIEW`/`REVISAO`), ciclo pelo mecanismo central, `HISTORY_PATHS` revalidadas, cache de Estatísticas invalidado;
8. sem respostas → sessão encerrada, nenhum estudo.

`finalizeSession` agora devolve `{ cycleSyncError, completed?, error? }`: `error` é a falha de leitura recuperável; `completed` diz se **esta** chamada encerrou a sessão. "Sessão já encerrada" continua sendo caminho normal (sem erro), e o retorno literal `{ cycleSyncError: null }` foi preservado para que os testes de wiring históricos continuem valendo sem alteração.

`finishReviewSession` também não aceita mais `[]` por erro: sem as respostas não há relatório nem encerramento — devolve erro e a sessão fica aberta.

### As leituras que mascaravam erro

| Função | Antes | Agora |
|---|---|---|
| `listSessionAnswers` | `if (error) return []` | `SessionAnswer[] \| null` |
| `disciplinesOfItems` | `if (error) return []` | `string[] \| null` |
| `countSessionAnswers` (M4) | `error ? 0` | `number \| null` |

**M4** (o único MÉDIO incluído, por estar no mesmo fluxo): em `answerReviewCard`, quando a contagem falha **nada é gravado** em `review_sessions.items_answered` — antes o zero de erro era persistido e a sessão passava a dizer "0 respondidas" depois de respostas reais. Mantendo o último valor lido, a próxima resposta corrige o número sozinha, porque ele é sempre recontado a partir dos eventos.

### Testes de A3 (`review-finalize-resilience.test.ts`, 15 casos)

1. sessão com respostas + falha ao listá-las → **ACTIVE**, `finished_at` intacto, erro explícito, zero `study_history`;
2. depois da falha, a segunda tentativa **grava o estudo**: `study_history` com `REVIEW`/`REVISAO`, disciplina derivada e `reviews_completed: 1`, sessão COMPLETED, respostas intactas — a prova de que nada se perdeu;
3. falha ao identificar a disciplina → também não encerra;
4. o relatório não inventa "nenhum item respondido" quando a leitura falha;
5. sessão sem respostas → encerra sem estudo;
6. encerrar duas vezes → a segunda não encerra nem duplica, e o `finished_at` da primeira é o que vale;
7. duas abas em paralelo → exatamente uma finalização efetiva;
8. sessão de outro aluno → não encerra e não vira erro de leitura;
9. M4: falha na contagem **não** zera `items_answered`, e o número se corrige na resposta seguinte;
10. estáticos: as respostas e as disciplinas são lidas **antes** do CAS, o trecho entre a leitura e o CAS não grava nada, e o CAS + a guarda de idempotência continuam no lugar.

O caso 2 é um ganho colateral: ele exercita o caminho positivo até a gravação do estudo (algo que a auditoria havia registrado como coberto só por wiring — B13). Ele para no `registerStudyToCycle`, que exige contexto de requisição do Next, e o teste documenta isso explicitamente em vez de fingir cobertura.

---

## TESTES

| Comando | Resultado |
|---|---|
| `npm test` | **1257 testes, 1257 passando, 0 falhando** (180 suítes) |
| `npx tsc --noEmit` | sem erros |
| `npm run build` | compilou com sucesso; `/dashboard/reviews` presente |

30 testes novos (15 + 15), nenhum teste removido ou enfraquecido. Os testes de wiring históricos do encerramento (idempotência, cache de Estatísticas, sincronização do ciclo e D4) passaram **sem nenhuma alteração**, o que é a melhor evidência de que a reordenação não afrouxou nada.

**Busca estática pedida no brief:**

| Padrão | Resultado |
|---|---|
| `24h · 7d · 15d · 30d · 60d` | só no teste que o proíbe |
| `error ? 0` | nenhuma ocorrência em código (só na asserção que proíbe) |
| `if (error) return []` no módulo de revisões | **1**, em `listUserDisciplines` (catálogo do modal "Adicionar à revisão") — fora do escopo de A1/A2/A3; registrado abaixo |
| `countSessionAnswers` / `listSessionAnswers` | ambas com `| null` e sem fallback de erro |
| `Você não tem revisões agendadas` | só no caminho com contagem lida (`queueSummary`), nunca no estado de erro |
| `0 pendentes` | nenhuma ocorrência |

**Ponto honesto:** a única leitura que ainda transforma erro em lista vazia é o catálogo de disciplinas do modal de adicionar tópico — um erro ali mostra "Nenhuma disciplina cadastrada". É a mesma classe de problema, fora dos três bloqueios desta fase, e não mexi por isso. Fica anotado para a fase dos MÉDIOS.

---

## BANCO

- **Nenhuma migration criada, nenhum DDL executado, nenhuma consulta de escrita.**
- Nada alterado em `review_items`, `review_history`, `review_sessions`, RLS, índices ou constraints.
- A correção é inteiramente de aplicação, UI e testes.
- FSRS intocado (`ts-fsrs`, `fsrs-scheduler.ts`, `ReviewScheduler`, `learning_steps`, notas, estabilidade, dificuldade, intervalos, fila) e Cycle Engine intocado (`registerStudyToCycle`, `study_cycles`, `study_cycle_sessions`, `study_cycle_items`, cursor, rounds, reconciliação). Paginação inalterada; limite global do PostgREST inalterado.
- Nenhum item MÉDIO ou BAIXO da I.4 foi tocado, com a única exceção combinada: M4.

---

## GIT

```
git status --short   → 247 entradas
                        209 M  (160 só CRLF/LF · 49 com mudança real)
                         11 D
                         27 ?? (inclui os 2 testes novos desta fase
                                e o relatório da I.4 em "Claude outputs/")

git diff --stat      → 220 arquivos, 19.426 inserções, 22.942 remoções
                        (acumulado das fases I.1–I.5 + os 160 de fim de linha)

git diff --stat dos arquivos rastreados desta fase:
  package.json                                       |  3 +-
  src/app/(protected)/dashboard/reviews/loading.tsx  | 12 +-
  src/application/review-engine/review.service.ts    | (acumulado da I.1)
  src/domain/reviews/models.ts                       | (acumulado da I.1)

git diff --check     → sem apontamentos nos arquivos desta fase
```

Os outros oito arquivos que editei (`review.repository.ts`, `reviews-view.tsx`, `review-session-modal.tsx`, `fake-review-db.ts`, `fase-h-dados-reais.test.ts`, `review.service.test.ts` e os dois testes novos) nasceram nas fases I.1–I.5 e aparecem como não rastreados, por isso não entram no `diff --stat`. Os números de `review.service.ts` e `models.ts` são o acumulado desde o HEAD, não o tamanho da mudança de hoje — nesta fase eles receberam a reordenação do encerramento e os campos anuláveis.

**Nenhum commit, nenhum push, nenhuma alteração de remote.** Não normalizei CRLF/LF: a lista de "somente fim de linha" segue com os mesmos 160 arquivos, e nenhum arquivo foi tocado só por isso.

---

## SITUAÇÃO DOS BLOQUEIOS

| Achado | Critério de aceitação | Situação |
|---|---|---|
| **A1** | loading sem intervalos fixos; teste impede o retorno | ✅ texto igual ao da página, teste cobrindo os dois arquivos e verificado por regressão proposital |
| **A2** | erro não vira zero; overview distingue zero de erro; UI honesta | ✅ `null` no repositório, `counts: null` no domínio, estado de erro na página, `—` no modal, botão não desabilitado por dado não lido |
| **A3** | erro de leitura não encerra a sessão nem perde estudo; retry possível; concorrência idempotente; sem zero falso em `items_answered` | ✅ leituras antes do CAS, erro controlado com sessão ACTIVE, segunda tentativa grava o estudo, CAS preservado, contador nunca gravado a partir de leitura falha |

Com isso, os três bloqueios da auditoria I.4 caem. Na minha leitura técnica, o sistema de Revisões está **aprovado para a próxima fase**: D1–D9 intactos, FSRS e Cycle Engine intocados, banco inalterado, nenhum dado falso novo, 1257 testes passando, TypeScript e build limpos.

## PARA VOCÊ FAZER

1. `npm install` se ainda não rodou desde a I.1 (dependência `ts-fsrs@5.4.2`).
2. `npm test`, `npx tsc --noEmit`, `npm run build` na sua máquina.
3. Abrir `/dashboard/reviews` e conferir o cabeçalho durante o carregamento (sem escada de intervalos) e a página normal.
4. Revisar e commitar você mesmo, de preferência separando os arquivos de código dos 160 que só têm diferença de fim de linha.
