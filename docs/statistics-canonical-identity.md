# Estatísticas pela identidade canônica (G2.13)

Base: G2.12 (`disciplines.canonical_discipline_id` + `src/domain/disciplines/discipline-identity.ts`).
A migration G2.12 continua **não aplicada**; enquanto isso, cada id é a própria identidade e as Estatísticas ficam exatamente como antes.

## 1. Regra de identidade

- Identidade = `canonical_discipline_id` declarado no catálogo (alias → canônica), senão o próprio `discipline_id`. Nunca texto, nunca similaridade.
- Uma única implementação: `resolveCanonicalIds`/`buildDisciplineIdentity`/`canonicalIdOf`/`identityDisplayName` (`discipline-identity.ts`), carregada por `loadDisciplineIdentity` (lotes de 100 ids + `custom_name` do próprio aluno).
- As Estatísticas aplicam essa regra num único ponto: `canonicalizeStatisticsInput` (`src/application/study-analytics/statistics-identity.ts`), chamado por `getStatisticsCenterAction` antes de devolver o payload.

## 2. Fonte dos dados (payload da Central de Estatísticas)

| dado | tabela | campo de disciplina | tratamento G2.13 |
|---|---|---|---|
| sessões | `study_history` | `discipline_id` | id → canônica; nome → nome da identidade; dedupe por `id` |
| questões avulsas | `question_attempts` → `questions` | `questions.discipline_id` | id → canônica; dedupe por `id` |
| vínculos/edital | `user_disciplines` (+ `disciplines`) | `discipline_id` | uma entrada por identidade (status do vínculo da canônica vence) |
| revisões ativas | `review_items` | `discipline_id` | id → canônica; dedupe por `id` |
| plano ativo | `study_plan_items` | `discipline_id` | id → canônica (o cálculo de planejamento não usa disciplina; só consistência) |
| simulados (novo) | `simulados` + `simulado_disciplines` | `discipline_id` | `canonicalizeSimuladoRecords` (G2.12) |

## 3. Estudo

O motor (`stats-engine.ts`) agrupa por `disciplineId`. Como as sessões já chegam com o id canônico, `computeDisciplineStats`, tópicos, prioridades, insights, relatórios semanal/mensal e cobertura do edital somam alias + canônica sem nenhuma mudança no motor. Exemplo real (aluno anonimizado U3, todo o histórico, simulando a migration aplicada): "Raciocínio Lógico e Matemático" 228 min → **287 min** (+59 min estudados no alias); 33 → 32 disciplinas; total de minutos e de sessões inalterado (2.871 sessões, 2.871 ids distintos).

## 4. Simulados

O payload passa a trazer os simulados externos (mesma leitura da tela de Simulados — `readSimuladoRecords`, agora fora do arquivo de actions) já na identidade canônica. A tela filtra por período/matéria (`filterSimuladosForStatistics`) e calcula com o **mesmo** `buildSubjectAnalysis` da G2.10 (`simuladoAnalysisByDiscipline`). No detalhe de cada disciplina aparecem: simulados, média nos simulados e evolução (p.p.).

## 5. Agregação

- Cada `study_history.id`, `question_attempts.id`, `review_items.id` e cada simulado entram uma vez (dedupe pelo id real).
- Alias e canônica no mesmo simulado viram UMA matéria (soma de questões/acertos; totais do simulado intactos).
- Registro já ligado à canônica não é recontado pelo alias: a tradução é por linha, não por soma de grupos.
- Sem vínculo → a identidade é o próprio id (comportamento anterior).

## 6. Filtros

- Opções de disciplina vêm do payload já canônico → não existe opção de alias.
- Se o filtro chegar com um id de alias, a tela o resolve com `canonicalIdOf(payload.identity, id)` antes de filtrar sessões, questões e simulados.
- Período: igual para sessões, questões e simulados (data do simulado). O filtro de **tipo de estudo** não se aplica a simulados externos (não são sessões).

## 7. Gráficos e seções

Nenhum gráfico das Estatísticas cria série por disciplina a partir de nome; todos usam o `disciplineId` do payload. Resultado: "Desempenho por disciplina", tópicos, pontos fracos, cobertura do edital, revisões por disciplina e prioridades têm uma linha por identidade. Os gráficos de evolução/horas/mapa de calor são por dia (sem disciplina) e não mudam.

## 8. Customização

`custom_name` e `custom_color_hex` não são alterados. O nome mostrado de uma identidade é o `custom_name` do aluno **na disciplina canônica**, senão o nome global da canônica (antes as Estatísticas ignoravam o `custom_name`). Internamente o id é sempre o canônico. As Estatísticas não usam cor de disciplina.

## 9. Casos ambíguos

"Noções de Direito Administrativo", "Noções de Direito Constitucional", "Noções de Informática" e "Direito Constitucional (CF/1988 e Doutrina)" não têm vínculo e por isso continuam como identidades próprias. Só mudam se o vínculo for gravado no catálogo (decisão de produto, bloco 7 da migration G2.12).

## 10. Limitações

- O efeito real depende de aplicar a migration G2.12 (sem a coluna, a identidade é o próprio id).
- Cache em memória de 5 min por aluno: um vínculo novo gravado direto no banco (SQL) aparece em até 5 min ou no próximo invalidar (estudo/simulado/disciplina salvos).
- O ranking por disciplina do **Dashboard** e o widget "Estudos de Hoje" ficaram fora da G2.13 e foram adaptados na G2.14 (`docs/g2-14-canonical-identity-product-closure.md`).
- Simulados: teto de 300 por aluno (o mesmo da tela de Simulados).

## 11. Mentor IA

O payload das Estatísticas já é a forma que o Mentor deve consumir: todo `disciplineId` é o canônico, o nome é o da identidade e `payload.identity.memberNames` diz o que foi somado. Contrato `discipline_identity` em `docs/discipline-catalog-normalization.md` §8.
