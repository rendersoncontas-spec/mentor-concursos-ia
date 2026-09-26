# NomeIA — Fase H — Dados reais, valores fixos, placeholders e funcionalidades falsas

Data: 24/09/2026 · Escopo: auditoria e correção de valores exibidos como se fossem do aluno. Sem redesign, sem funcionalidade nova, sem schema/RPC/migration, sem mexer no Cycle Engine, offline, sync, idempotência ou autenticação.

**Resultado: 1158/1158 testes passando** (eram 1128; +30 novos) · `tsc --noEmit` 0 erros · `npm ci --ignore-scripts` OK · `npm run build` OK · ESLint inalterado (93 erros / 43 avisos, os mesmos da Fase G — nenhum novo) · paridade md5 nuvem ↔ seu computador confirmada.

O inventário completo (antes das correções, com classificação A–H) está em `fase-h-inventario-2026-09-24.md`.

## Como foi feita a auditoria

Busca ampla em `src/`, `docs/`, `scripts/` por literais, fallbacks (`?? n`, `|| n`), arrays estáticos, textos condicionais e palavras-chave (mock, demo, exemplo, em breve, IA, score, retenção, energia, meta…), leitura de cada área, e **checagem no banco de produção só de metadados e contagens agregadas** (nenhuma linha de usuário foi lida):

| Tabela | Registros | O que isso mostrou |
|---|---|---|
| `review_items` / `review_history` | 0 / 0 | não existe retenção medida para ninguém; nenhum fluxo atual cria revisões |
| `question_attempts` | 0 | acurácia por questão só vem das sessões |
| `adaptive_history` | 26 (1 usuário, motor v1.0.0) | 15 deles citam "retenção 50%/60%" — exatamente os valores padrão do contexto fixo |
| `study_plan_replan_events` | 486 | todos são redistribuições; nada registra se o bloco foi estudado depois |
| colunas | — | `question_attempts.correct` (não `is_correct`); `simulados.total_questions/score_percentage` (não `pontuacao/total_questoes`); `review_items` **sem** `card_front`, `is_suspended`, `deleted_at`, `last_interval_days` |
| triggers | — | nenhum trigger cria itens de revisão |

Não há nenhuma chamada a modelo de IA no código.

## Tabela de resultados

### DADOS FALSOS / DEMO → CORRIGIDO

| Local | Valor antes | Origem | Problema | Ação |
|---|---|---|---|---|
| `/dashboard/adaptive` — "Learning Health Score" + "Detecção de Risco" | score, Retenção 75%, Performance 70%, Energia, "Risco Baixo" | constantes: desempenho 70 e retenção 75 para toda disciplina, energia 3, backlog e lapsos 0 | número parecia personalizado; não existe fonte real de retenção | **ocultado**; aviso "Saúde de aprendizado — indisponível"; as consultas que só alimentavam o índice saíram |
| `/dashboard/adaptive` — log | "O motor executará adaptações conforme você estuda" | promessa | o gerador não produz mais intervenções | texto honesto + nota explicando o que "retenção" significou nos registros antigos (acerto das sessões; 50%/60% padrão sem questões). Os registros **não** foram apagados |
| `study-plan.service.ts` (`mockContext`) | decisões adaptativas | energia 3, sequência 5, desempenho 50/60 padrão | com o motor atual esse contexto **nunca** gerava decisão; só custava 1 leitura paginada de 90 dias | **removido**; teste prova que o cronograma gerado é idêntico (o motor devolve `[]` para qualquer desempenho nesse formato de contexto) |
| `/dashboard/mentor` | "Índice Geral de Aprendizado: N" + "Estável" | 3 de 5 componentes = `overallAccuracy` fixo em 0; tendência sempre "STABLE" | índice fabricado | **ocultado**; subtítulo real ("observações das suas sessões dos últimos 30 dias") e estado vazio |
| Dashboard — Constância (pequeno) | quadradinhos verdes | `minutes > 0 \|\| idx < streak` | pintava os dias **mais antigos** | verde só no dia com estudo |
| Dashboard — Tempo de estudo (grande) | barras DOM…SÁB | rótulos fixos sobre "últimos 7 dias corridos" | rótulo errado exceto aos sábados; escala travada em 2h | rótulo = dia real de cada barra; escala pelo maior dia (mín. 2h) |
| Dashboard — Desempenho (grande) | "Melhores desempenhos por matéria — 0%" | campos inexistentes; lista ordenada por tempo | sempre 0% e título falso | "Matérias mais estudadas (tempo total)" com o tempo real |
| Dashboard — Conquistas & marcos | "Primeiro Estudo", "Maratona" | minutos **da semana** | trancavam de novo toda semana | sobre o total do histórico (novo `stats.totalMinutes`, calculado já existente) |
| Dashboard — Ranking das matérias | "N pts" ("30 dias") | minutos de todo o histórico | unidade e período errados | tempo formatado; comentário corrigido |
| Dashboard — Revisões | "agendadas para hoje" | conta atrasadas + hoje | rótulo errado | "pendentes (para hoje e atrasadas)" |
| Dashboard — Questões | "resolvidas esta semana" com fallback no total; acertos/erros/aprov. sem rótulo | total de todo o histórico ao lado do número semanal | mistura de períodos | fallback 0; rótulos "(total)"; sem questões → "—" |
| Dashboard — Desempenho, Metas "Horas", Tempo "Progresso" | "0%" / "%" | sem questões / sem meta | percentual inexistente mostrado | "—" (`goals.ts` passa a devolver `null` sem meta) |
| Notas rápidas | "Salvo agora"; "Nova nota criada!"; "Nota excluída" | texto inicial fixo; toast sem conferir | afirmava salvamento não confirmado | status vazio até salvar; toasts só após resposta do servidor |
| Personalizar Home | "Home personalizada com sucesso!" | ação sempre `success: true` | não conferia `error` do banco | sucesso só se ao menos um destino gravou |
| Metas semanais (modal) | 20 h / 100 / 5 / 6 / Segunda preenchidos | padrões | pareciam metas do aluno; semana mostrada ≠ semana usada | aviso "valores sugeridos"; dia padrão = Domingo, como no cálculo |
| Ranking — Meta de Estudo | "/ 10h" ou "/ 20h" | `weekly_study_hours \|\| 10`; fallback `"20h"` | meta inventada | sem meta → "Meta semanal não definida"; início da semana pela mesma regra do app |
| Ranking / perfil público | "Global" / "Concurseiro Focado" sob o nome | constantes | pareciam o concurso do aluno | removido (lista) / "Perfil de estudo" (modal) |
| Perfil público (falha de leitura) | "Perfil Privado — mantém seu desempenho privado" | fallback | afirmação falsa | "Não foi possível carregar este perfil agora." |
| Estatísticas — card Semana | "segunda → hoje" | texto fixo | semana começa no dia configurado | rótulo pelo dia real |
| Estatísticas — Produtividade | "30% / 20% / 10%", acurácia/foco "0%" | rótulos fixos | com < 5 questões o índice usa 40/45/15 | rótulos com os pesos usados; "—" quando o componente não tem dado |
| Estatísticas — Períodos do dia | "Melhor rendimento… maior acurácia" | texto fixo | às vezes o critério era "mais minutos" | texto conforme o critério usado |
| Estatísticas — Calendário | "90 dias de atividade" | nº de dias do intervalo | não eram dias com estudo | "X de 90 dias com estudo" |
| Estatísticas — Eu × Eu | "igual" | `delta = null` | sem dado ≠ igual | "sem comparação" |
| Estatísticas — insights | "O padrão de revisão está dando resultado."; motivo "não estudada há tempo" | textos sem cálculo | causa/motivo inventados | frase removida; insight só com motivo calculado |
| Histórico — Desempenho; Disciplinas — Acerto; Planos — Aderência; Revisões — Retenção | "0%" | sem base | percentual inexistente | "—" |
| Revisões — cabeçalho e cartões | "24h · 7d · 15d · 30d · 60d"; "7 dias" | escada fixa | o motor é FSRS contínuo | texto correto; intervalo real do cartão |
| Revisões (vazio) e **página pública de login** | "agendadas automaticamente a partir dos seus estudos" / "Revisões espaçadas agendadas automaticamente" | promessa | nenhum fluxo atual cria revisões | texto factual; na página de login o item virou "Histórico completo, com filtros e importação" |
| Agenda semanal | data "02/08/2026…"; "Meta diária atualizada"; tópico "Revisão e Questões" | fixos | data fixa, meta não é atualizada, tópico inventado | data real do dia clicado; "marcado nesta visualização"; sem tópico inventado |
| Onboarding | "Isso ajudará a IA a montar um cronograma" | — | o cronograma é algoritmo determinístico | "Isso ajuda a montar um cronograma realista." |

### FUNCIONALIDADES INCOMPLETAS / CÁLCULOS QUEBRADOS → CORRIGIDO

| Local | Problema | Correção |
|---|---|---|
| Conquistas — questões | consulta `question_attempts.is_correct` (coluna inexistente) falhava em silêncio | coluna `correct` |
| Conquistas — simulados | `pontuacao, total_questoes` inexistentes → simulados registrados nunca contavam; "Faixa de aprovação" impossível | `total_questions, total_correct, score_percentage` |
| Conquistas — REPLAN_* | desbloqueavam com sequência ≥ 7 dizendo "Pendência recuperada" | bloqueadas até existir medição; texto explica por quê |
| Conquistas — PLAN_MASTER_4_WEEKS | progresso "1 de 4" pela aderência da semana atual | progresso = semanas completas de estudo diário (critério verificável) |
| Conquistas — COVERAGE_* | denominador fixo `max(tópicos digitados, 40)` | tópicos do edital ativo × domínio — **mesma regra da página Disciplinas** (função compartilhada `topicsStudiedFromMastery`/`getEditalTopicCoverage`); sem edital → "sem edital para medir" |
| Estatísticas — prioridades | status real `STUDYING` não era reconhecido (só `EM_ESTUDO`) | aceita os dois |
| Estatísticas — revisões | "atrasada/para hoje" pelo dia UTC | dia de São Paulo |
| Estatísticas — edital | "33.333333333333336%" | arredondado |

### CÓDIGO MORTO → REMOVIDO

| Item | Motivo |
|---|---|
| `src/application/study-analytics/insights.ts` + `AnalyticsEngine.ai` + `analytics.insights` | calculado a cada carga do Dashboard com scores fixos ("85% de chance de burnout", 95, 60…), sem IA, nunca exibido |
| `testGlobalRankingRpc` (Server Action exportada) | função de depuração chamável, sem uso |

### DADOS REAIS / CÁLCULOS REAIS (confirmados, sem mudança)

Tempo hoje/semana, sequência e recorde, calendário, desempenho por período (São Paulo), metas Questões/Dias, Estudos de hoje, widget de Ciclo (tudo do Cycle Engine), data da prova, últimas atividades; todas as séries de Estatísticas (`study_history`, `question_attempts`, plano, fuso de São Paulo, estados vazios honestos); ranking via RPC; estágios/contagens de revisões; simulados registrados; biblioteca; disciplinas (amostra mínima respeitada); planos (carga e aderência reais); histórico (totais batem com a lista filtrada, testado).

### CONFIGURAÇÕES INTENCIONAIS e PLACEHOLDERS LEGÍTIMOS (mantidos)

Limiares de cor e classificação, pesos documentados, amostras mínimas, padrões FSRS, 365 frases do dia (motivacionais, sem análise), carga padrão de 20 h/semana do gerador de plano, nomes de placeholder ("Estudante", "Prova", "Local não informado").

## DEFERIDO / FUTURO

| Item | Classe | Por que não agora |
|---|---|---|
| **Revisões: o schema de produção não tem as colunas que o código usa** (`card_front`, `is_suspended`, `deleted_at`, `last_interval_days` em `review_items`) — a lista da página Revisões falha em silêncio e flashcards não podem ser criados | FUTURO — exige migration | fora do escopo (sem schema) |
| Nenhum fluxo atual cria `review_items` a partir dos estudos (flashcards e o antigo gerador de simulados estão desligados) | FUTURO — exige decisão de produto | página Revisões fica vazia para todos |
| **Privacidade: caches locais sem usuário** — notas rápidas (`mentor_quick_notes_list_cache`) e lembretes (`mentor_user_reminders`) ficam no navegador sem vínculo com a conta; outra conta no mesmo navegador vê o conteúdo anterior | DEFERIDO — recomendo fase própria | a correção envolve logout/autenticação |
| Lembretes, tópicos marcados do Edital e estudos criados na Agenda semanal existem só no navegador (ou só em memória) | FUTURO — exige fonte de dados | sem tabela |
| Conquistas não são gravadas (retrancam se a sequência cai) | FUTURO — exige tabela | |
| REPLAN_* ficaram bloqueadas | FUTURO | exige registrar quando um bloco redistribuído é estudado |
| Estatísticas: intervalo "Tudo" (usa só dias com atividade) e intervalos curtos (7/30 d cortam janelas de 30/90 d e comparações); semana atual parcial comparada com 7 dias cheios; taxa de conclusão de revisões mistura eventos e itens; filtro por disciplina conta tentativas sem disciplina; Histórico soma `imported_seconds` numa visão e `duration_minutes` noutra | DEFERIDO — refatoração do motor de estatísticas | mudanças de cálculo amplas, pedem fase própria com testes dedicados |
| Mensagem do Dia (opção sem efeito), modal "Data da prova" inalcançável, dia de início da semana em dois lugares | DEFERIDO — UI | |
| Simulados CEBRASPE: nota líquida calculada e salva mas não exibida; contagem inclui status legados | DEFERIDO | |
| `target_role: "Concurseiro"` / "Minha Prova" gravados no banco ao criar concurso | DEFERIDO | muda criação de concurso |
| `getRankingPersonalContextAction` usa o usuário logado, não o efetivo (modo suporte) | DEFERIDO | fora do tema desta fase |
| `question-analytics/{ai-insights,accuracy,radar,performance}.ts` sem uso (ai-insights tem confianças fixas) | DEFERIDO (módulo de questões mantido na Fase G) | nada disso é exibido |

## Testes

- **Novo `src/application/fase-h-dados-reais.test.ts` (23)**: regras de exibição do Dashboard (dia real das barras, pontos da constância, marcos sobre o total, "—" sem base); metas `null` sem meta e percentual que muda com os minutos; STUDYING na atenção; revisões no dia de São Paulo (casos às 22h30); pesos da produtividade; guardas contra a volta de cada valor fixo removido (Adaptive, gerador de plano, Mentor, insights, ranking, revisões, página de login, agenda, onboarding, layout, notas). **Contraprova**: com `goals.ts` e `stats-engine.ts` da versão anterior, 5 desses testes falham.
- **Novo `src/features/conquistas/components/conquistas-evaluate.test.ts` (6)**: REPLAN não desbloqueia por sequência; cobertura com denominador real e que muda com a entrada; PLAN_MASTER sem progresso inventado; colunas reais nas consultas.
- **`adaptive-learning.test.ts` (+1)**: o contexto antigo do gerador de plano nunca produz decisão (prova de que a remoção é neutra).
- Ajustados: `dashboard-analytics-metadata.test.ts` (tirou `insights` da lista de arquivos do motor) e `ranking-timezone.wiring.test.ts` (o import agora também traz `resolveWeekStartDay`).
- `evaluateAchievement` passou a ser exportada para teste.

## Validação

| Comando | Resultado |
|---|---|
| `npm ci --ignore-scripts` | OK |
| `npm test` | 1158 / 1158 |
| `npx tsc --noEmit` | 0 erros |
| `npm run build` | OK |
| ESLint (repo inteiro) | 93 E / 43 W — igual à Fase G |
| Fins de linha | preservados em todos os arquivos alterados |

Nenhum `git add`, `commit`, `push`, `pull`, `merge`, `reset` ou `checkout`.
