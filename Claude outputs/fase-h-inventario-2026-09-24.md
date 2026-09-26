# NomeIA — Fase H — Inventário (antes de qualquer correção)

Método: busca ampla por literais, fallbacks (`?? n`, `|| n`), arrays estáticos, textos condicionais e palavras‑chave (mock, demo, sample, fake, exemplo, em breve, IA, score, retenção, energia, meta, ranking…) em `src/`, `docs/`, `scripts/`, `config`; leitura dos componentes e serviços de cada área; e verificação no banco de produção (somente leitura, só metadados e contagens agregadas — nenhuma linha de usuário) para confirmar colunas e se as fontes têm dados.

Banco (contagens agregadas, 24/09/2026): `review_items` = 0 · `review_history` = 0 · `question_attempts` = 0 · `adaptive_history` = 26 (1 usuário, todas da versão v1.0.0 do motor, 14/08 a 02/09) · `study_plan_replan_events` = 486 · `simulados` = 1. Não há nenhum trigger de banco que crie itens de revisão (só `updated_at` em `study_cycles`/`study_cycle_items`).

Classes: **A** dado real · **B** cálculo real · **C** configuração intencional · **D** placeholder explícito · **E** mock/demo indevido · **F** função incompleta · **G** histórico/doc · **H** código morto.

## E — valor/texto fabricado apresentado como real

| Local | Valor | Origem atual | Classe | Ação |
|---|---|---|---|---|
| `app/(protected)/dashboard/adaptive/page.tsx` — "Learning Health Score" + componentes + "Detecção de Risco" | score, Retenção 75%, Performance 70%, Energia, "Risco Baixo" | contexto montado com `performanceScore: 70`, `retentionRate: 75`, `averageEnergy: 3`, `totalBacklogReviews: 0`, `lapsesCount: 0` fixos para toda disciplina; só `streak_days` e `weekly_study_hours` vêm do perfil | E | ocultar a métrica (não há fonte real de retenção: `review_history` = 0) |
| `adaptive/page.tsx` — log vazio | "O motor executará adaptações conforme você estuda" | o motor, com o contexto atual, nunca gera decisão (ver próxima linha) | E | texto honesto |
| `application/study-plan/study-plan.service.ts:179‑236` (`mockContext`) | decisões do motor adaptativo gravadas em `adaptive_history` e aplicadas ao cronograma | energia 3 e sequência 5 fixas; desempenho 50 (sem dados) ou 60 (só minutos) por padrão; retenção = acerto | E | com a versão atual do motor esse contexto **nunca** produz decisão (1 janela só, energia 60) → remover o bloco (comportamento idêntico, provado em teste) |
| `adaptive_history` (banco) | 26 registros "Queda na retenção detectada (60%/50%/…)" | gerados pela v1.0.0 com o mesmo contexto: 50% e 60% são exatamente os valores padrão | E (histórico) | não apagar dados; explicar na tela o que "retenção" significou nesses registros |
| `features/mentor-ai/components/mentor-feed.tsx` (rota `/dashboard/mentor`) | "Índice Geral de Aprendizado: N" + "Estável" | `RuleEngine.calculateGlobalScore`: 3 dos 5 componentes vêm de `overallAccuracy`, fixo em `0` no `IntelligenceHub`; `trend: "STABLE"` fixo | E | ocultar o índice e a tendência |
| `dashboard-widget-catalog.tsx:553` (Constância, tamanho pequeno) | quadrados verdes de "Registro diário" | `minutes > 0 \|\| idx < streak` pinta os dias MAIS ANTIGOS | E | só `minutes > 0` |
| `dashboard-widget-catalog.tsx:188` (Tempo de estudo, grande) | barras DOM…SÁB | série = últimos 7 dias corridos; rótulos fixos Dom→Sáb | E | rótulo pela data real de cada ponto |
| `dashboard-widget-catalog.tsx:411‑430` (Desempenho, grande) | "Melhores desempenhos por matéria — 0%" | `item.accuracy \|\| item.percentage \|\| 0` — campos que não existem; lista ordenada por tempo | E | mostrar o que o dado é: matérias mais estudadas + tempo |
| `dashboard-widget-catalog.tsx:1268‑1279` (Conquistas & marcos) | "Primeiro Estudo", "Maratona" | minutos **da semana** — "trancam" de novo toda semana | E | usar o total real |
| `sticky-notes-widget.tsx:117, 340, 372` | "Salvo agora"; "Nova nota criada!"; "Nota excluída" | texto inicial fixo; toast sem conferir o resultado | E | refletir o resultado real |
| `dashboard-layout.action.ts` | "Home personalizada com sucesso!" | `{ success: true }` sem checar `error` do upsert | E | checar o erro |
| Desempenho / Questões (Dashboard), Histórico "Desempenho", Revisões "Retenção", Planos "Aderência" | "0%" | acerto/retenção/aderência inexistente → 0 | E | "—" quando não há base |
| Metas de Estudo "Horas" / Tempo de estudo "Progresso" | "0%" / "%" | meta não definida → 0 / `null` | E | "—" |
| `study-analytics.actions.ts:550` + `ranking-view.tsx:1381` | "Meta de Estudo 10h" / "/ 20h" | `weekly_study_hours \|\| 10`; fallback `"20h"` | E | sem meta → "Meta não definida" |
| `statistics-center-view.tsx:685` | "segunda → hoje" | texto fixo; a semana começa no dia configurado | E | texto pelo dia real |
| `statistics-center-view.tsx` Produtividade | pesos "30% / 20% / 10%" e acurácia "0%" | com < 5 questões o motor usa 40/45/15 e acurácia fica fora | E | rótulos com os pesos usados |
| `statistics-center-view.tsx` Períodos do dia | "maior acurácia com ≥ 5 questões" | cai para "mais minutos" quando nenhum período tem 5 questões | E | texto conforme o critério usado |
| `statistics-charts.tsx:250` | "N dias de atividade" | nº de dias do intervalo, não dias com estudo | E | contar dias com estudo |
| `statistics-charts.tsx:104` (Eu × Eu) | "igual" | `delta === null` (sem dado anterior) tratado como igual | E | "sem comparação" |
| `stats-engine.ts` insight "Acurácia em evolução" | "O padrão de revisão está dando resultado." | causa inventada (revisões não são consultadas) | E | remover a frase |
| `stats-engine.ts` insight "Foco sugerido" | motivo "não estudada há tempo" | fallback sem cálculo | E | não emitir sem motivo real |
| `conquistas-view.tsx` REPLAN_* | "Pendência recuperada sem quebrar o ritmo" | `replanRecoveredCount` nunca é calculado (sempre 0) → desbloqueia só por sequência ≥ 7 | E | calcular pela fonte real (`study_plan_replan_events`) |
| `conquistas-view.tsx` PLAN_MASTER_4_WEEKS | progresso 25% | aderência da semana atual vira "1 de 4 semanas" | E | ver seção de correções |
| `conquistas-view.tsx` COVERAGE_* | "Cobertura de X% do edital" | denominador fixo `max(tópicos, 40)` | E | ver seção de correções |
| `dashboard/reviews/page.tsx:129`, `review-tabs.tsx` | "24h · 7d · 15d · 30d · 60d"; badge "7 dias" | escada fixa; o motor é FSRS com intervalo contínuo | E | intervalo real |
| `review-tabs.tsx:187`; `app/(auth)/layout.tsx` (página pública) | "agendadas automaticamente a partir dos seus estudos" / "Revisões espaçadas agendadas automaticamente" | nenhum caminho vivo cria `review_items` (0 no banco; sem trigger) | E | texto factual |
| `ranking-view.tsx:1344`, `public-study-profile-modal.tsx:191` | "Global" / "Concurseiro" sob o nome | constantes do RPC/action, parecem o concurso do usuário | E | não exibir |
| `weekly-planning-view.tsx:253, 262` | data "02/08/2026" … "08/08/2026" no modal | string fixa | E | data real do dia clicado |
| `weekly-planning-view.tsx:241` | "Estudo concluído! Meta diária atualizada." | só marca na tela; nada é gravado | E | texto honesto |
| `weekly-planning-view.tsx:227` | tópico "Revisão e Questões" em todo bloco do plano | texto fixo | E | não inventar tópico |
| `onboarding-wizard.tsx:457` | "Isso ajudará a IA a montar um cronograma realista." | o cronograma é um algoritmo determinístico | E | sem "IA" |

## F — função com UI real mas backend incompleto/quebrado

| Local | Problema | Classe | Ação |
|---|---|---|---|
| `achievements.action.ts:73` | lê `question_attempts.is_correct` — a coluna é `correct` (confirmado no banco) → consulta falha em silêncio | F | corrigir a coluna |
| `achievements.action.ts:80` | lê `simulados.pontuacao, total_questoes` — colunas inexistentes (são `total_questions`, `score_percentage`) → simulados registrados nunca contam; PERFORMANCE_APPROVAL_RANGE impossível | F | corrigir as colunas |
| `statistics-center` / `stats-engine` | status `"EM_ESTUDO"` comparado, mas o real é `"STUDYING"` | F (cálculo quebrado) | corrigir |
| `statistics-center.action.ts:326` | `review_items` sem excluir suspensos/excluídos | F | filtrar |
| `stats-engine.ts` Atrasadas / Para hoje | dia em UTC | F | dia de São Paulo |
| `statistics-center-view.tsx` Progresso no edital | "33.333333333333336%" | F | arredondar |
| `study-analytics.actions.ts:636` `testGlobalRankingRpc` | Server Action de depuração exportada (chamável), sem uso | H | remover |
| `dashboard.service.ts:425` → `insights.ts` | "insights" com scores fixos (95/85/60/…) calculados a cada carga e nunca exibidos | H | remover a chamada |
| Lembretes (Dashboard) | só `localStorage`, chave sem usuário | F | FUTURO — exige fonte de dados |
| Modal "Data da prova" | nenhum widget abre | F | DEFERIDO |
| "Mensagem do Dia" em Personalizar Home | widget sempre filtrado | F | DEFERIDO |
| Dia de início da semana (modal de metas × preferências) | duas fontes; a do modal é ignorada quando a preferência existe | F | DEFERIDO |
| Tópicos marcados do Edital | só `localStorage` | F | FUTURO — exige fonte de dados |
| Agenda semanal: estudos criados no modal | só em memória (somem ao recarregar) | F | FUTURO |
| Conquistas não são persistidas (retrancam) | recalculadas a cada carga | F | FUTURO — exige tabela |
| Estatísticas: intervalo "Tudo" e intervalos curtos (7/30 d) | janelas de 30/90 d e comparações calculadas só com dias do intervalo | F (cálculo) | DEFERIDO — refatoração do motor de estatísticas |
| Simulados CEBRASPE | nota líquida calculada e salva, mas não exibida | F | DEFERIDO |

## C / D — configurações e placeholders legítimos (mantidos)

Limiares de cor (70/50, 85/75/60, 60/180/300 min), pesos documentados de prioridade/produtividade, tamanhos mínimos de amostra, 365 frases do dia (motivacionais, sem análise), padrões FSRS (`desired_retention 0.9`, `difficulty 4.93`), `weekly_study_hours ?? 20` como carga padrão do gerador de plano, nomes-placeholder ("Estudante", "Minha Prova", "Prova", "Local não informado"), `CEBRASPE_DEFAULT_PENALTY = 1`, faixas de desempenho de simulado.

## A / B — reais (resumo)

Dashboard: Tempo hoje/semana, sequência e recorde, calendário, desempenho por período (`question_attempts` + sessões, limites de São Paulo), metas Questões/Dias, Estudos de hoje, widget de Ciclo (tudo de `getActiveCycleAction`), Data da prova, Últimas atividades. Estatísticas: todas as séries vêm de `study_history`/`question_attempts`/`review_items`/plano, agrupadas em São Paulo, com estados vazios honestos. Ranking: RPC/fallback sobre `study_history`. Revisões: estágios e contagens de `review_items`, retenção = notas ≥ 2 em 365 dias. Simulados: registros do usuário e cálculos puros. Biblioteca: `library_materials` via actions. Disciplinas: acerto/tempo/tópicos reais com amostra mínima. Planos: carga e aderência reais (`study_plan_items` × `study_history`). Ciclos: tudo derivado do Cycle Engine (não alterado). Mentor: mensagens de energia reais (regra); não se apresenta como IA. Não há nenhuma chamada a modelo de IA no código; nenhum texto visível descreve como IA algo que não usa IA, exceto o do onboarding (acima).
