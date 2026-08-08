# 🔄 Módulo 04 — Motor de Revisões Espaçadas

## 🎯 Objetivo
Automatizar o agendamento e a execução de revisões periódicas baseadas em algoritmos de repetição espaçada (FSRS e SM2+), garantindo a retenção do conhecimento de longo prazo e impedindo a ação da Curva do Esquecimento.

---

## 🔄 Fluxo do Usuário
1. Sempre que o usuário estuda um tópico no Edital ou finaliza uma sessão, um `review_item` é criado ou atualizado.
2. O sistema calcula a data da próxima revisão (`next_review_at`) de acordo com a nota/desempenho obtido.
3. Ao acessar a aba de Revisões (`/dashboard/reviews`), o usuário visualiza as revisões Vencidas (Atrasadas), Hoje e Próximas.
4. O usuário clica em "Iniciar Revisões do Dia".
5. Uma interface interativa estilo Flashcard/Resumo apresenta o tópico a ser revisado.
6. O aluno responde com seu grau de facilidade (ex: 1 = Errei/Péssimo, 2 = Difícil, 3 = Bom, 4 = Fácil, 5 = Muito Fácil).
7. O algoritmo recalcula o intervalo (ex: +3 dias, +7 dias, +21 dias) e avança para o próximo item da fila.

---

## 🧱 Componentes
- `ReviewTabs`: Abas de navegação entre Revisões de Hoje, Fila Geral, Histórico e Configurações de Algoritmo.
- `ReviewQueueCard`: Lista de itens pendentes ordenados por prioridade calculada.
- `FlashcardReviewRunner`: Interface cheia de tela para execução da rodada de revisões.
- `AlgorithmSelector`: Componente para o usuário alternar entre FSRS e SM-2+.

---

## 📝 Campos
- `review_item_id`: UUID
- `source_type`: ENUM ('TOPIC', 'QUESTION', 'FLASHCARD', 'STUDY_SESSION')
- `review_stage`: ENUM ('NEW', 'LEARNING', 'REVIEW', 'MASTERED', 'LAPSED')
- `ease_factor`: decimal (ex: 2.5)
- `stability_score`: decimal (para FSRS)
- `memory_strength`: inteiro (0 a 100%)
- `next_review_at`: timestamp
- `due_date`: date
- `grade`: inteiro (1 a 5)

---

## 🔘 Botões
- `[Iniciar Revisões Hoje]` -> Abre o executor de revisões em sequência.
- `[Errei / Difícil / Bom / Fácil]` -> Botões de feedback durante a revisão de cada card.
- `[Adiar Revisão]` -> Move o item 1 dia para a frente em caso de acúmulo de fila.
- `[Marcar como Dominado]` -> Transfere o item direto para a fase `MASTERED`.

---

## 🔍 Filtros
- Filtrar fila por Disciplina.
- Filtrar por Status: Vencidas / Hoje / Futuras.

---

## ⚙️ Regras de Negócio
- A fila diária (`review_queue`) deve ser populada para todo item cuja `next_review_at <= NOW()`.
- Se um item estiver atrasado por mais de 5 dias, sua prioridade calculada aumenta para ser exibido no topo da fila.
- Se o aluno errar uma revisão (Nota 1), o item volta para a fase `LAPSED` e deve ser revisado novamente no dia seguinte (intervalo de 1 dia).
- O algoritmo padrão ativo é o **FSRS** (Free Spaced Repetition Scheduler), podendo ser alterado pelo aluno para **SM-2+**.

---

## 🔗 Dependências
- Módulo de Disciplinas e Edital (`disciplines`, `question_topics`)
- Estratégias de Revisão (`fsrs.strategy.ts`, `sm2-plus.strategy.ts`)
- Review Engine Service (`review-engine.service.ts`)

---

## 🗄️ Banco de Dados Utilizado
- `review_strategies`
- `review_items`
- `review_queue`
- `review_history`
- `review_statistics`

---

## 🌐 APIs Utilizadas
- `generateDailyQueue(supabase, userId)` -> Popula a tabela `review_queue` com os vencimentos de hoje.
- `processReviewAnswer(...)` -> Executa o cálculo da estratégia e salva em `review_history`.

---

## 📈 Status Atual no Projeto
- ✅ Tabela e algoritmos FSRS e SM-2+ 100% desenvolvidos no backend.
- ✅ Estrutura de banco com `review_items`, `review_queue` e `review_history`.
- ✅ Services `review-engine.service.ts` e `review-analytics.service.ts` criados.
- 🔴 FALTANTE: Componente de interface interativa estilo Flashcard para execução da revisão pelo aluno.
- 🔴 FALTANTE: Trigger/Cron autônomo para geração diária automática da fila (`review_queue`).

---

## 🚧 O que falta implementar
1. Desenvolver o componente `FlashcardReviewRunner.tsx` (UI de revisão).
2. Criar cron job no Supabase / Next API Route para execução de `generateDailyQueue` à meia-noite.
3. Conectar a aba de Revisões no menu lateral diretamente à fila do dia.

---

## 🎯 Prioridade
**P0 (Crítico para equivalência com o Estudei)**

---

## ✅ Critérios de Aceite
- O aluno vê a contagem exata de revisões pendentes para o dia.
- Ao clicar em iniciar revisões, os tópicos aparecem um a um.
- Ao selecionar uma nota de 1 a 5, o sistema aplica a fórmula e reagenda o tópico para a data correta no futuro.
- A contagem de pendências diminui em tempo real.

---

## 📋 Checklist
- [x] Schema do Banco de Dados para Motor de Revisões
- [x] Estratégia SM-2+ implementada
- [x] Estratégia FSRS implementada
- [x] Service de cálculo e reagendamento
- [ ] Runner visual de Flashcard/Tópico (UI frontend)
- [ ] Automação diária da fila `review_queue` (Cron/Trigger)
