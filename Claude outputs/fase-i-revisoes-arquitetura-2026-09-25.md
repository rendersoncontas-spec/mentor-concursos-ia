# NomeIA — Fase I — Sistema de Revisões: auditoria, arquitetura e plano

Data: 25/09/2026 · **Etapa executada: somente auditoria + proposta.** Nenhum código, schema, migration, RPC ou dado foi alterado. Há decisões de produto em aberto (seção 16); por isso a fase **para aqui**, como pedido.

Validação do código atual (inalterado): `npm test` 1158/1158 · `npx tsc --noEmit` 0 erros.

Fontes: banco de produção (somente metadados e contagens agregadas — nenhuma linha de usuário foi lida além de contagens e nomes de chaves de `metadata`), código em `src/`, `supabase/migrations/`, `docs/`.

Legenda: **[BANCO]** confirmado no banco · **[CÓDIGO]** encontrado no código · **[FALTA]** faltante · **[PROPOSTA]** · **[DECISÃO]** decisão de produto necessária · **[NÃO IMPL.]** não implementado.

---

## 1. Schema atual (fonte de verdade: banco)

### 1.1 Tabelas de revisão existentes [BANCO]

| Tabela | Linhas | Observação |
|---|---|---|
| `review_items` | 0 | estado de cada item |
| `review_history` | 0 | eventos de resposta |
| `review_queue` | 0 | fila diária (nunca populada; o código atual não a usa) |
| `review_statistics` | 0 | cache de números agregados |
| `review_strategies` | 2 | configuração: `SM2_PLUS` e `FSRS` (`request_retention 0.9`, `weights: []`) |
| `review_sessions` | **não existe** | usada pelo código (Sprint 14) |
| `review_settings` | **não existe** | usada pelo código (Sprint 14) |

Migrations registradas no banco (`supabase_migrations`): só 6, de 21/09 em diante (ciclos, suporte, índices de `study_history`). As tabelas de revisão vieram de scripts manuais antigos (`docs/sprint6-*.sql`). **O script `docs/sprint14-revisoes.sql` nunca foi aplicado.** Não há funções nem enums no schema `public` relacionados a revisão; não há trigger que crie itens.

### 1.2 `review_items` — coluna a coluna

| Coluna | Tipo | Nullable | Default | FK | Usada pelo código? | Existe no banco? | Observação |
|---|---|---|---|---|---|---|---|
| id | uuid | não | gen_random_uuid() | — | sim | sim | PK |
| user_id | uuid | não | — | profiles(id) CASCADE | sim | sim | |
| discipline_id | uuid | **não** | — | disciplines(id) CASCADE | sim | sim | obrigatório |
| topic_id | uuid | sim | — | **question_topics(id)** CASCADE | sim | sim | aponta para a taxonomia do banco de questões (13 linhas), **não** para os tópicos do edital (`topics` 268 / `subtopics` 1.136) |
| source_type | text | não | — | — | sim | sim | CHECK: QUESTION, TOPIC, FLASHCARD, STUDY_SESSION |
| source_id | uuid | não | — | — | sim | sim | UNIQUE (user_id, source_type, source_id) |
| review_stage | text | não | 'NEW' | — | sim | sim | CHECK: NEW, LEARNING, REVIEW, MASTERED, LAPSED |
| ease_factor | numeric | sim | 2.5 | — | só leitura (histórico) | sim | resquício SM-2 |
| stability_score | numeric | sim | 0 | — | sim (S do FSRS) | sim | |
| memory_strength | integer | sim | 0 | — | sim (derivado de S) | sim | CHECK 0–100; redundante |
| forget_probability | numeric | sim | 0 | — | sim (derivado) | sim | redundante |
| last_review_at | timestamptz | sim | — | — | sim | sim | |
| next_review_at | timestamptz | sim | — | — | sim | sim | é o "due" |
| review_count | integer | sim | 0 | — | sim | sim | |
| lapses_count | integer | sim | 0 | — | sim | sim | |
| base_priority | numeric | sim | 1.0 | — | sim (fila, novos) | sim | |
| created_at / updated_at | timestamptz | sim | now() | — | sim | sim | sem trigger de `updated_at` |
| card_type | — | — | — | — | **sim** | **não** | Sprint 14 |
| card_front / card_back | — | — | — | — | **sim** | **não** | Sprint 14 (conteúdo de flashcard) |
| tags | — | — | — | — | **sim** | **não** | Sprint 14 |
| difficulty | — | — | — | — | **sim** (D do FSRS) | **não** | Sprint 14 |
| last_interval_days | — | — | — | — | **sim** | **não** | Sprint 14 |
| consecutive_correct / consecutive_wrong | — | — | — | — | **sim** | **não** | Sprint 14 |
| is_suspended / is_favorite | — | — | — | — | **sim** | **não** | Sprint 14 |
| deleted_at | — | — | — | — | **sim** | **não** | Sprint 14 |

Índices [BANCO]: `(user_id, next_review_at)`, `(user_id, review_stage)`, único `(user_id, source_type, source_id)`.
RLS [BANCO]: habilitada; políticas `FOR SELECT` e `FOR ALL` com `auth.uid() = user_id` (sem `WITH CHECK` explícito — para `ALL`, o Postgres usa o `USING` também como checagem, então é seguro).

### 1.3 `review_history` — coluna a coluna

| Coluna | Tipo | Nullable | Default | FK | Usada? | Existe? | Observação |
|---|---|---|---|---|---|---|---|
| id | uuid | não | gen_random_uuid() | — | sim | sim | |
| user_id | uuid | não | — | profiles CASCADE | sim | sim | |
| review_item_id | uuid | não | — | review_items CASCADE | sim | sim | **sem checagem de dono**: a FK não passa por RLS; um usuário poderia gravar histórico apontando para o UUID de item de outro (precisaria adivinhar o UUID) |
| strategy_used_id | uuid | sim | — | review_strategies SET NULL | não | sim | nunca preenchida |
| review_date | timestamptz | sim | now() | — | sim | sim | |
| grade | integer | não | — | — | sim | sim | CHECK 1–5; o código usa 1–4 |
| duration_seconds | integer | sim | — | — | sim | sim | |
| previous_interval_days | numeric | sim | — | — | sim | sim | o código grava **dias decorridos**, não o intervalo agendado anterior |
| new_interval_days | numeric | sim | — | — | sim | sim | |
| previous_ease / new_ease | numeric | sim | — | — | sim | sim | o código grava a **dificuldade FSRS** em `new_ease` (semântica errada) |
| created_at | timestamptz | sim | now() | — | não | sim | |
| session_id | — | — | — | — | **sim** | **não** | Sprint 14 |

Índices: `(user_id, review_date desc)`. RLS igual à de `review_items`.

### 1.4 Tabelas relacionadas [BANCO]

`review_queue` (id, user_id, review_item_id, status PENDING/COMPLETED/SKIPPED, due_date date, calculated_priority; UNIQUE (review_item_id, due_date)) · `review_statistics` (total_reviews, mastered_items, retention_rate, current_streak) · `review_strategies` (name, parameters jsonb) · `topics` (id, discipline_id, name, user_id nullable — catálogo do edital + tópicos próprios) · `subtopics` (id, topic_id, name) · `question_topics` (id, discipline_id, parent_topic_id, name) · `questions` 67 linhas (banco de questões) · `question_attempts` 0.

### 1.5 O que existe nos dados reais de estudo [BANCO]

`study_history`: 2.852 sessões. Tipos: livre 1.719, videoaula 523, **FLASHCARDS 314** (o aluno registra tempo de flashcards feitos fora do app), áudio 106, questões 70, teoria 61, leitura 30, **REVISAO 4**. Metadados: `topic_name` existe em 159 sessões mas está **vazio em todas**; `imported_topic` preenchido em **1**. Ou seja: **as sessões reais não têm tópico** — só disciplina.

---

## 2. Divergências código × banco

| Divergência | Onde o código usa | Efeito hoje | Classificação |
|---|---|---|---|
| `review_items.card_type/card_front/card_back/tags` | Sprint 14: flashcards, player, página Revisões | a lista da página Revisões pede essas colunas → **erro silencioso, lista vazia**; criar flashcard falharia | **D** (funcionalidade não implementada no banco) — ver decisão sobre flashcards |
| `review_items.difficulty` | FSRS (D) | sem onde guardar D | **A** necessária (se FSRS) |
| `review_items.last_interval_days` | player / página | lida só para exibir | **B/C** substituível pelo histórico (`scheduled_days` do último evento) |
| `consecutive_correct/wrong` | regra "dominado", leech | — | **B** heurística própria, não FSRS |
| `is_suspended`, `deleted_at` | todas as leituras | KPI do Dashboard e replanejamento filtram por elas → **erro silencioso → zero** | **A** necessária (suspender/arquivar) |
| `is_favorite` | flashcards | — | **D** |
| `review_history.session_id`, `review_sessions`, `review_settings` | sessão, limites, retenção desejada | `createReviewSession` falharia no insert | **A/D** — ver proposta |
| `review_items.topic_id → question_topics` | fila por tópico | taxonomia errada para "tópico do edital" | **C** estrutura substituída — **[DECISÃO]** |
| `review_queue`, `review_statistics`, `review_strategies`, `ease_factor`, `memory_strength`, `forget_probability`, `strategy_used_id` | cache/legado | não participam do fluxo | **B** legado |
| `grade` CHECK 1–5 × código 1–4 | player | compatível | ok |
| `new_ease` recebendo dificuldade; `previous_interval_days` recebendo dias decorridos | `answerReviewCard` | histórico não reproduz o agendamento | **B** código incorreto |

Leituras que hoje falham em silêncio por causa das colunas ausentes: página Revisões (lista), `getPendingReviewsSummary` (KPI do Dashboard → 0), `loadOverdueReviewsByDiscipline` (replanejamento → mapa vazio). Como não há itens, o resultado visível é o mesmo — mas qualquer item criado hoje não apareceria nessas telas.

---

## 3. Modelo FSRS encontrado [CÓDIGO]

Não há biblioteca instalada (`package.json` não tem `ts-fsrs` nem similar). Há uma implementação própria em `src/application/review-engine/fsrs-engine.ts` (221 linhas, com testes).

| Parte | Situação |
|---|---|
| Pesos `FSRS_WEIGHTS` | **17 pesos padrão do FSRS-4.5** |
| Retrievability `R = (1 + t/(9S))^-1` | fórmula do **FSRS v4** (a 4.5 usa outra curva) — **inconsistente com os pesos** |
| Estabilidade inicial `w0..w3` | implementada |
| Estabilidade após acerto | forma v4, **sem** penalidade de "Difícil" (w15) nem bônus de "Fácil" (w16) |
| Estabilidade após erro (w11–w13) | implementada |
| Dificuldade inicial | usa `R` onde a fórmula usa a **nota** → **incorreta** |
| Dificuldade após resposta | sem reversão à média (w7); no erro, `D + 1` ("aproximação") |
| Intervalo `9·S·(1/r − 1)` | correto para v4 |
| Passos de aprendizagem | só "10 min" no erro; nenhum para itens novos |
| "Dominado" (5 revisões, S ≥ 21, 3 acertos seguidos), "leech" | regras próprias, não FSRS |
| Fila (`queue-engine.ts`) | ordem: atrasadas → hoje → lapsos/leech → risco → novas; `riskScore` com pesos próprios (0,45/0,25/0,2/0,1) |
| `SM2_PLUS` (doc 04 diz "100% desenvolvido") | **não existe no código** |
| Otimizador de pesos, fuzz | não existem |

**Conclusão: IMPLEMENTADO parcialmente e de forma aproximada.** Não pode ser apresentado como FSRS. Não recomendo "consertar" as fórmulas à mão (seria escrever um algoritmo "parecido", o que a fase proíbe) — ver proposta 9.

---

## 4. Unidade de revisão

O que o projeto diz:
- `docs/estudei/04-reviews.md`: "sempre que o usuário estuda um **tópico no Edital** ou finaliza uma sessão, um `review_item` é criado ou atualizado"; o player mostra "o **tópico** a ser revisado".
- Roadmap: "encerramento de um estudo gere/atualize o item de revisão correspondente".
- Sprint 14 (código): o item carrega **conteúdo de flashcard** (frente/verso) e também nasce de **questões erradas** de simulado.
- Banco: `source_type` aceita TOPIC, QUESTION, FLASHCARD, STUDY_SESSION.

Os documentos e o código **não concordam** sobre a unidade. E os dados reais não sustentam "tópico estudado" automático: nenhuma sessão tem tópico.

**Proposta:** "Uma unidade de revisão no NomeIA é **um conteúdo que o aluno quer reter e que ele consegue avaliar se lembra**: um tópico/subtópico do edital (lembrar do assunto), um flashcard (pergunta → resposta) ou uma questão errada." O item de revisão guarda **só o estado de memória/agendamento**; o conteúdo fica na sua tabela de origem. → **[DECISÃO D1]** quais tipos entram agora.

---

## 5. Origem dos itens

| Fonte | Existe no produto hoje? | Dados reais | Viável agora? |
|---|---|---|---|
| Tópico do edital (`topics`/`subtopics`) | sim (catálogo e edital verticalizado; marcação de tópicos ainda em `localStorage`) | 268 tópicos / 1.136 subtópicos | **sim**, por ação manual "Adicionar à revisão" |
| Sessão de estudo → revisão automática | não | sessões sem tópico; só disciplina | só se a sessão passar a registrar **o id do tópico** (hoje é texto livre) — **[DECISÃO D2]** |
| Disciplina inteira | não | sim | tecnicamente sim, mas "revisar Direito Constitucional" não é uma unidade avaliável — **não recomendado** |
| Flashcards próprios | código existe (biblioteca desligada), sem colunas no banco | 0 | depende de **[DECISÃO D3]** |
| Questões erradas | código existe (simulado antigo, desligado) | 0 tentativas | não agora (módulo de questões inativo) |
| Biblioteca / material importado | não | — | não |

---

## 6. Fluxo de revisão proposto

1. **Entrada:** o aluno escolhe "Adicionar à revisão" num tópico do edital (e, se D2 aprovada, ao registrar um estudo com tópico selecionado). O item nasce **NEW, vencendo hoje**; nenhuma data inventada.
2. **Fila:** atrasadas (maior atraso primeiro) → vencidas hoje → novas (até o limite diário, se houver). Contagem de atrasadas visível. Sem prioridade adicional inventada; ordem por disciplina/concurso só como filtro.
3. **Sessão:** um item por vez; o aluno tenta lembrar e revela (tópico: lista de subtópicos/anotações; flashcard: verso).
4. **Resultado:** 4 botões FSRS — Errei · Difícil · Bom · Fácil.
5. **Agendamento:** o motor FSRS calcula estado, estabilidade, dificuldade e próximo vencimento; o evento é gravado em `review_history` com antes/depois.
6. **Conclusão:** a sessão fecha quando a fila acaba ou o aluno encerra; resumo real (itens, acertos, tempo).
7. **Próxima:** mostra a próxima data de vencimento real ou "Você não tem revisões agendadas" com ação "Adicionar tópicos do edital" (ação existente só depois da implementação).

**Revisão antecipada [PROPOSTA]:** permitida; o FSRS trata isso nativamente (o `elapsed` é menor que o agendado e o cálculo usa o R real). Registrada no evento como `early = true`, sem regra própria.
**Atrasadas [PROPOSTA]:** entram antes das de hoje, acumulam, sem limite próprio por sessão (limite só se D6 decidir). Nada de "prioridade +5 dias" (regra do doc 04, sem base).

---

## 7. Estados

| Estado | Guardado? | Regra |
|---|---|---|
| NOVO | sim (`state = NEW`) | nunca revisado |
| APRENDENDO | sim (`LEARNING`) | primeiros passos |
| REVISÃO | sim (`REVIEW`) | agendamento de longo prazo |
| REAPRENDENDO | sim (`RELEARNING`) | errou um item em revisão (substitui `LAPSED`) |
| ATRASADO | **não** — derivado | `due_at` < hoje (São Paulo) |
| SUSPENSO | `suspended_at` | fora da fila, estado preservado |
| ARQUIVADO/EXCLUÍDO | `archived_at` | fora de tudo; histórico preservado |
| MADURO / CONCLUÍDO | **não guardar** | "maduro" pode ser exibido como derivado (ex.: estabilidade alta) se o produto quiser; "concluído" não existe em repetição espaçada |

São os 4 estados do próprio FSRS + 2 marcações. Troca a constraint atual (NEW/LEARNING/REVIEW/MASTERED/LAPSED) — a tabela está vazia, sem perda.

---

## 8. Modelo de domínio proposto

| Entidade | Papel | Campos |
|---|---|---|
| **ReviewItem** (principal, estado atual) | um por (aluno, origem) | usuário, disciplina, origem (tipo + id), estado FSRS, estabilidade, dificuldade, `due_at`, última revisão, repetições, lapsos, `suspended_at`, `archived_at` |
| **ReviewEvent** (`review_history`, somente inserção) | cada resposta | item, sessão, `reviewed_at`, nota, `elapsed_days`, `scheduled_days`, estado/estabilidade/dificuldade/due **antes e depois**, `early`, duração, `client_operation_id` |
| **ReviewSession** | agrupa respostas para medir tempo e retomar | início, fim, status, contagens |
| **Conteúdo** | na origem | `topics`/`subtopics` (edital) · `flashcards` (nova, se D3) · `questions` |

Sem duplicação: o conteúdo **não** vai para `review_items` (diferente do Sprint 14); o estado atual fica no item e o histórico completo nos eventos (dá para reconstruir o item a partir deles).

---

## 9. FSRS na arquitetura [PROPOSTA]

Adotar a biblioteca de referência `ts-fsrs` (open-spaced-repetition, licença MIT; versão a confirmar na instalação) atrás de uma porta única `ReviewScheduler` no domínio: `schedule(estadoAtual, nota, agora, parâmetros) → novoEstado + eventoAntesDepois`. O resto do sistema não conhece fórmulas. O `fsrs-engine.ts` atual seria substituído (os testes dele trocados por testes de contrato da porta).

Alternativa sem dependência nova: corrigir o motor próprio para uma versão específica do FSRS e validar contra vetores de referência — mais arriscado e mais lento. **[DECISÃO D7]** (dependência nova precisa de aprovação).

Parâmetros por usuário: só `desired_retention` (padrão do FSRS 0,9) e, opcionalmente, limites diários. Pesos padrão da biblioteca; nada de otimizador agora.

---

## 10–11. Proposta de banco, RLS e índices (SQL **não aplicado**)

As 4 tabelas de revisão estão vazias; a proposta reaproveita `review_items`/`review_history` onde a semântica bate, sem inventar dados.

```sql
-- NÃO APLICADO — proposta para revisão. Depende das decisões D1, D3 e D5.

-- 1) review_items: estado FSRS + marcações; origem polimórfica já existente
alter table public.review_items
  drop constraint if exists review_items_review_stage_check,
  drop constraint if exists review_items_source_type_check,
  drop constraint if exists review_items_topic_id_fkey;

alter table public.review_items
  add column if not exists difficulty numeric(8,4),               -- D do FSRS
  add column if not exists scheduled_days numeric(10,4),          -- intervalo agendado vigente
  add column if not exists suspended_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists origin_study_history_id uuid
    references public.study_history(id) on delete set null;        -- só se D2

-- tabela vazia (0 linhas em 25/09/2026): nenhuma migração de dados

alter table public.review_items
  add constraint review_items_state_check
    check (review_stage in ('NEW','LEARNING','REVIEW','RELEARNING')),
  add constraint review_items_source_type_check
    check (source_type in ('EDITAL_TOPIC','EDITAL_SUBTOPIC','FLASHCARD','QUESTION'));  -- conforme D1/D3

-- topic_id deixa de apontar para question_topics (taxonomia do banco de questões);
-- a origem é (source_type, source_id). Se D5 preferir colunas tipadas:
--   add column edital_topic_id uuid references public.topics(id) on delete cascade,
--   add column edital_subtopic_id uuid references public.subtopics(id) on delete cascade.

create index if not exists idx_review_items_due_active
  on public.review_items (user_id, next_review_at)
  where suspended_at is null and archived_at is null;

-- 2) review_history: evento reprodutível e idempotente
alter table public.review_history
  add column if not exists session_id uuid,
  add column if not exists elapsed_days numeric(10,4),
  add column if not exists scheduled_days numeric(10,4),
  add column if not exists state_before text, add column if not exists state_after text,
  add column if not exists stability_before numeric(12,4), add column if not exists stability_after numeric(12,4),
  add column if not exists difficulty_before numeric(8,4), add column if not exists difficulty_after numeric(8,4),
  add column if not exists due_before timestamptz, add column if not exists due_after timestamptz,
  add column if not exists early boolean not null default false,
  add column if not exists client_operation_id text;

alter table public.review_history
  drop constraint if exists review_history_grade_check,
  add constraint review_history_grade_check check (grade between 1 and 4);

create unique index if not exists uq_review_history_operation
  on public.review_history (user_id, client_operation_id) where client_operation_id is not null;
create index if not exists idx_review_history_item on public.review_history (review_item_id, review_date);

-- dono do item = dono do evento (a FK sozinha não passa pela RLS)
drop policy if exists "Usuário modifica próprio histórico" on public.review_history;
create policy "Usuário insere histórico dos próprios itens" on public.review_history
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.review_items ri where ri.id = review_item_id and ri.user_id = auth.uid())
  );
-- (sem UPDATE/DELETE de eventos: histórico somente inserção)

-- 3) review_sessions (mínima)
create table if not exists public.review_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','COMPLETED','DISCARDED')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  items_answered integer not null default 0
);
alter table public.review_sessions enable row level security;
create policy "Sessões próprias" on public.review_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create unique index if not exists uq_review_sessions_one_active
  on public.review_sessions (user_id) where status = 'ACTIVE';
alter table public.review_history
  add constraint review_history_session_fk foreign key (session_id)
  references public.review_sessions(id) on delete set null;

-- 4) flashcards — somente se D3 = "flashcard faz parte das Revisões"
-- create table public.flashcards (id, user_id, discipline_id, front, back, tags, created_at, updated_at, archived_at) + RLS por user_id.

-- 5) review_settings (opcional): user_id PK, desired_retention numeric(4,3) default 0.9 check (0.7..0.97),
--    new_items_per_day int null, max_reviews_per_day int null  — nulos = sem limite.

-- Legado mantido sem uso: review_queue, review_statistics, review_strategies,
-- ease_factor, memory_strength, forget_probability, base_priority, strategy_used_id
-- (remoção só com decisão D8).
```

Isolamento multiusuário: todas as tabelas com `user_id` + FK para `profiles` + RLS; o evento só pode apontar para item do próprio usuário (política acima); unicidade `(user_id, source_type, source_id)` impede item duplicado; `client_operation_id` único impede aplicar a mesma resposta duas vezes; a atualização do item deve usar trava otimista (`where review_count = :esperado`) para duas abas respondendo ao mesmo tempo.

---

## 12. Relação com disciplina / edital

`discipline_id` obrigatório (já é). Tópico/subtópico do edital pela origem (`EDITAL_TOPIC`/`EDITAL_SUBTOPIC` → `topics`/`subtopics`), sem criar entidade nova. A FK atual para `question_topics` é da taxonomia do banco de questões e não serve para o edital. **[DECISÃO D5]**: origem polimórfica (proposta) × colunas tipadas.

## 13. Relação com `study_history`

`study_history` continua sendo o histórico oficial de **estudo**, sem mudança de semântica. Proposta: o item de revisão pode **referenciar** a sessão que o originou (`origin_study_history_id`, opcional). A sessão de estudo **não** gera revisão sozinha, a menos que D2 aprove (e aí só quando a sessão tiver um tópico escolhido do edital).

Tempo de revisão: o código atual (`finalizeSession`) grava **uma** linha em `study_history` por sessão de revisão (`study_source = REVIEW`, `study_type = REVISAO`, duração da sessão, disciplina mais frequente, `metadata.review_session_id`). **[DECISÃO D4]**: manter isso (revisão conta como estudo) ou registrar tempo só em `review_sessions`.

## 14. Relação com Ciclos

O código atual chama `registerStudyToCycle()` ao fechar a sessão de revisão — ou seja, **tempo de revisão já contaria no ciclo ativo**. Isso não toca cursor/rodada/progresso por si (é o mecanismo central de reconciliação), mas muda o progresso do ciclo. Proposta: **não** integrar nesta fase; a gravação em `study_history` e o registro no ciclo ficam condicionados a D4. Nenhuma mudança no Cycle Engine.

## 15. Relação com Planejamento e Dashboard

Existe hoje: o replanejamento adaptativo lê revisões atrasadas por disciplina para priorizar (hoje falha por colunas ausentes → sem efeito). Proposta: manter a leitura, só consertar a consulta quando o schema existir. Revisões **não** entram no "Meu dia"/metas nesta fase. **[DECISÃO D6]**.
Dashboard: indicadores (hoje, atrasadas, próximas, retenção) **só depois** de haver itens e eventos reais; retenção = acertos (nota ≥ 2) ÷ respostas no período, "—" sem respostas.

## 16. Decisão sobre flashcards

O que existe: biblioteca completa (`flashcard-library.tsx`, 894 linhas, nunca ligada à UI); ações de criar/importar/exportar/gerar a partir de questões (o "gerar" usa questões do banco com `Math.random()` para embaralhar alternativas — não é IA); colunas de conteúdo no `review_items` que não existem no banco. O aluno já registra **314 sessões de FLASHCARDS** feitas fora do app.
Opções: **A)** flashcard é parte das Revisões (conteúdo em tabela `flashcards`, agendamento em `review_items`); **B)** produto separado; **C)** fica desligado agora. → **[DECISÃO D3]**. Recomendação técnica: A no modelo (a arquitetura acima já comporta), mas **C na primeira entrega**, começando por tópicos do edital.

---

## 17. Decisões de produto necessárias (a fase para aqui)

| # | Decisão | Opções | Recomendação técnica |
|---|---|---|---|
| **D1** | Unidade(s) de revisão na 1ª entrega | tópico/subtópico do edital · flashcard · questão | tópico e subtópico do edital |
| **D2** | Criação automática a partir do estudo | só manual · automática quando a sessão tiver tópico do edital (exige registrar o id do tópico na sessão) | começar manual; automática numa etapa seguinte |
| **D3** | Flashcards | parte das Revisões · produto separado · desligado agora | parte, mas depois |
| **D4** | Tempo de revisão | vira `study_history` (conta como estudo, entra no ciclo e nas estatísticas) · fica só nas sessões de revisão | decisão de produto — muda estatísticas e ciclo |
| **D5** | Ligação com o edital | origem polimórfica (`source_type` + `source_id`) · colunas tipadas | polimórfica (já existe a unicidade) |
| **D6** | Planejamento / Meu dia / metas | revisões aparecem no dia e contam na meta · só na página Revisões | só na página Revisões na 1ª entrega |
| **D7** | Motor FSRS | biblioteca `ts-fsrs` (dependência nova) · corrigir o motor próprio | biblioteca |
| **D8** | Legado (`review_queue`, `review_statistics`, `review_strategies`, colunas SM-2) | manter sem uso · remover | manter até a implementação estar estável |
| **D9** | Limites diários (novos/revisões por dia) | sem limite · limite configurável | sem limite na 1ª entrega |

## 18. Plano de implementação (depois das decisões)

1. Migration incremental (seção 10, ajustada às decisões), aplicada em branch/homologação antes de produção.
2. Repository de revisões (única camada que conhece colunas; paginado com os helpers existentes).
3. Domínio: `ReviewItem`, `ReviewEvent`, estados, porta `ReviewScheduler`.
4. Adaptador FSRS (biblioteca) + testes de contrato determinísticos (datas fixas, sem `Math.random`).
5. Serviço: adicionar item, montar fila, responder (idempotente + trava otimista), suspender, arquivar.
6. Actions com `getEffectiveUserId`.
7. Criação de itens pela fonte decidida (D1/D2).
8. Sessão de revisão e histórico.
9. UI: página Revisões com estado vazio honesto, fila, sessão.
10. Consertar leituras que hoje falham (KPI do Dashboard, replanejamento) e só então indicadores.

Testes previstos: criação, isolamento por usuário, agendamento/due, atraso, revisão antecipada, transições de estado, histórico reprodutível, ordenação da fila, suspensão, vazio, idempotência (mesma operação duas vezes), concorrência (duas abas).

## 19. Resumo por categoria

- **CONFIRMADO NO BANCO:** 4 tabelas de revisão vazias + estratégias de config; sem `review_sessions`/`review_settings`; FK de tópico para `question_topics`; RLS por usuário; sessões reais sem tópico.
- **ENCONTRADO NO CÓDIGO:** motor "FSRS" próprio e parcial; fila; sessão persistente; flashcards; integração com simulado antigo; KPI do Dashboard e replanejamento lendo colunas inexistentes.
- **FALTANTE:** qualquer fluxo vivo de criação de itens; colunas/tabelas do Sprint 14; FSRS fiel; checagem de dono no histórico; idempotência de resposta.
- **PROPOSTA:** seções 4–15.
- **DECISÃO NECESSÁRIA:** D1–D9.
- **NÃO IMPLEMENTADO nesta fase:** nada foi alterado (nem código, nem banco).
