# NomeIA — Preparação para o Mentor IA (G2.8, Fase 13)

**Data:** 2026-10-03
**Escopo:** só análise e documentação. Nenhum chatbot, LLM ou funcionalidade de IA generativa foi implementado nesta fase — este documento mapeia o terreno para quando isso for decidido.

Hoje o "Mentor IA" (`src/application/mentor-ai/`) é **100% algorítmico/determinístico** — não há chamada a nenhum modelo de linguagem em lugar nenhum do código. O nome "IA" se refere a um motor de regras (capabilities + prioritizer + explanation-engine), não a um LLM. Este documento responde às 7 perguntas da Fase 13 do sprint G2.8.

---

## 1. Quais dados já existem

O app já registra, por usuário, um volume real e estruturado de dados de estudo:

- **Sessões de estudo** (`study_history`): disciplina, duração planejada/ativa/pausada, tipo de estudo, `energy_level`, `difficulty`, `focus_score`, `origin_source` (de onde veio: ciclo, plano, manual, Mentor IA), questões respondidas/corretas, flashcards revisados, página lida — tudo por sessão individual, com timestamp.
- **Ciclo de estudo** (`study_cycles`/`study_cycle_items`): disciplinas no ciclo, peso, ordem, blocos planejados vs. estudados, status de conclusão por rodada.
- **Planejamento** (`study_plans`): modo (CRONOGRAMA_SEMANAL ou CICLO_ROTATIVO), meta semanal, distribuição por dia, histórico de replanejamento (`study_plan_replan_events`, idempotente, com log de auditoria).
- **Revisões espaçadas** (FSRS — `src/domain/reviews/review-scheduler.ts`): estabilidade e dificuldade antes/depois de cada revisão, grade (nota dada pelo usuário), previsão de performance por grade (`ReviewGradeForecast`) — ou seja, o sistema já calcula, por item, "se eu responder X, a próxima revisão cai em Y dias".
- **Edital verticalizado**: progresso por tópico, estrutura hierárquica (disciplina → tópico → subtópico).
- **Simulados**: resultado por disciplina e por tópico (`SimuladoDisciplineResult`, `SimuladoTopicResult` — acertos/erros), não só nota final.
- **Metas semanais** e contagem de sequência de dias estudados (streak).
- **Motor adaptativo (ALE)** já calcula, por disciplina, uma `retentionRate` com histórico cronológico (`retentionHistory: number[]`) — ou seja, já existe uma série temporal de retenção por disciplina, não só o valor atual.
- **Achievements/conquistas**: condições e progresso já computados.

Em resumo: o app já tem os três ingredientes que qualquer "mentor" precisa — **o que o aluno fez** (sessões), **o que ele deveria fazer** (ciclo/plano/edital) e **como ele está indo** (revisões, simulados, retenção) — tudo already ligado por `user_id` e `discipline_id`/`topic_id`.

## 2. Quais dados faltam

- **Dados no nível de questão individual são escassos em produção.** O inventário da Fase H (24/09) encontrou `question_attempts = 0` e `review_items = 0` no banco real — ou seja, a infraestrutura para rastrear "o aluno errou esta questão específica, deste tópico específico" existe no schema, mas está vazia hoje. Qualquer recomendação de IA baseada em "pontos fracos por questão" não tem dado real ainda — só os simulados têm resultado por disciplina/tópico, não por questão.
- **Nenhum texto livre do aluno é capturado hoje** (não há campo de "dúvida", "anotação" ou "pergunta" associado a uma sessão ou revisão) — um Mentor IA conversacional não teria histórico de interação prévia para se basear além dos números.
- **Não há feedback explícito do aluno sobre as sugestões do motor adaptativo** (ex.: "essa recomendação foi útil?") — o `AdaptiveDecision` é gerado e aplicado, mas não há loop de confirmação/rejeição registrado para aprender com o tempo.
- **Dados de concorrência/edital público** (conteúdo cobrado historicamente por banca, por exemplo) não fazem parte do schema do usuário — ficariam de fora de qualquer IA que precisasse desse contexto.

## 3. Quais métricas já podem ser calculadas (sem IA nova)

Estas já existem ou são triviais de derivar do que já está gravado:

- **Learning Health Score** (`calculateLearningHealthScore`, já implementado): combina retenção (40%), performance (30%), consistência de hábito (20%) e energia (10%) num score único 0-100, com classificação de risco de burnout (`HIGH`/`MEDIUM`/`LOW` conforme energia baixa + carga semanal alta).
- **Tendência de retenção por disciplina** — já há `retentionHistory`, então "está melhorando ou piorando" é um cálculo de inclinação sobre uma série já existente, não uma métrica nova.
- **Previsão de resultado de revisão por nota** (`ReviewGradeForecast`) — já calculado pelo FSRS antes mesmo do aluno responder.
- **Aderência ao plano** — planejado vs. estudado já é comparado pelo motor de replanejamento; dá pra expor isso como "% de aderência" por semana/disciplina sem nova coleta de dado.
- **Desempenho por disciplina em simulados** — já segmentado, só falta agregação ao longo do tempo (hoje é por simulado individual).

## 4. Quais recomendações já podem ser geradas (hoje, sem LLM)

O motor de `capabilities` (`burnout.capability.ts`, `mentor.capability.ts`) e o `prioritizer`/`explanation-engine` já são o lugar certo para isso — são determinísticos por design. Com os dados do item 1, já dá pra gerar, sem IA generativa:

- Alerta de burnout (energia baixa + carga alta) — **já existe**.
- "Sua retenção em [disciplina] caiu nas últimas N semanas, considere revisar antes de avançar" — cálculo direto sobre `retentionHistory`.
- "Você está Z% atrás da meta semanal, faltam N dias" — já é possível com os dados do planejamento/replanejamento.
- "Esta disciplina tem mais revisões atrasadas que as outras" — já é uma contagem sobre o motor FSRS.
- Priorização de qual disciplina estudar hoje combinando urgência de revisão + peso no edital + retenção — o `prioritizer` já existe para compor esse tipo de regra.

Nenhum destes precisa de um modelo de linguagem — são regras sobre números que já são calculados ou são triviais de calcular. Isso é importante: a maior parte do valor de um "mentor" já é alcançável sem IA generativa nenhuma, só com melhor orquestração do que já existe (ponto que a Fase 3 deste mesmo sprint, sobre a Central, já trata separadamente).

## 5. Onde a IA (LLM) pode entrar

Onde um modelo de linguagem adicionaria valor que regras determinísticas não conseguem:

- **Explicação em linguagem natural** das métricas acima — hoje o `explanation-engine` provavelmente monta texto por template; um LLM poderia variar o tom/fraseado e responder perguntas de acompanhamento ("por que minha retenção caiu?").
- **Resumo de desempenho em linguagem natural** ao final de um período (semana/mês), lendo os números já calculados (Learning Health Score, aderência, simulados) e narrando — não decidindo números, só comunicando os que já existem.
- **Chat de dúvidas sobre o próprio progresso** ("como estou indo em Direito Administrativo?") — um LLM com acesso de leitura aos dados do item 1, sem poder de decisão sobre o ciclo/plano.
- **Geração de plano de estudo em linguagem natural a partir de uma meta solta do aluno** ("quero focar mais em exatas essa semana") — traduzindo intenção em parâmetros que o motor de replanejamento determinístico já existente consome, nunca substituindo esse motor.

## 6. Quais operações devem continuar determinísticas (nunca depender de IA generativa)

- **O ciclo de estudo** (cursor, ordem, conclusão de rodada) — regra de negócio crítica, já protegida por "Regra Máxima de Preservação" neste próprio sprint.
- **O agendamento de revisões (FSRS)** — já é matemática determinística (estabilidade/dificuldade), não deve virar "o LLM decide quando revisar".
- **O replanejamento semanal** — idempotente e auditado hoje; introduzir não-determinismo aqui quebraria a auditoria (`study_plan_replan_events`).
- **Qualquer cálculo que vire número exibido ao usuário** (tempo estudado, % de aderência, score) — um LLM pode narrar o número, nunca inventá-lo ou arredondá-lo "na conversa".
- **RLS/autenticação/autorização** — óbvio, mas vale registrar: nenhuma decisão de acesso a dado deve passar por um LLM.

## 7. Quais partes NÃO devem depender da IA

- O produto já funciona hoje inteiramente sem LLM (ciclo, plano, revisões, estatísticas) — isso deve continuar verdadeiro mesmo depois de um Mentor IA conversacional existir. Se a API do provedor de LLM cair, o app não pode parar de funcionar — o Mentor IA deve ser uma camada estritamente aditiva sobre o que já existe, nunca um caminho obrigatório para usar o produto.
- A entrada de dados de estudo (registrar sessão, responder revisão) não deve exigir passar por um LLM — são formulários/ações determinísticas hoje e devem continuar assim por confiabilidade e custo.

---

## Observação sobre prioridade

Dado o estado real dos dados (item 2 — `question_attempts`/`review_items` vazios em produção), o maior ganho de curto prazo não é um chatbot, e sim **aumentar a cobertura de dados estruturados já calculáveis sem LLM** (item 3/4) e expô-los melhor na Central — o que é exatamente o escopo da Fase 3 deste sprint (G2.8), tratada separadamente. Um Mentor IA conversacional terá muito mais dado útil para trabalhar depois disso do que teria hoje.
