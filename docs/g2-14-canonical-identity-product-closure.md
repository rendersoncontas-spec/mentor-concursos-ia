# Identidade canônica de disciplinas — fechamento no produto (G2.14)

Regra única: `src/domain/disciplines/discipline-identity.ts` (alias → canônica pelo vínculo gravado no catálogo; nunca por texto). Leitura única: `loadDisciplineIdentity` (lotes de 100 ids + `custom_name` do próprio aluno). Sem a migration G2.12 aplicada, tudo continua idêntico (cada id é a própria identidade).

## Matriz por área

| Área | Usa discipline_id | Usa canônica | Usa nome | Usa similaridade | Situação |
|---|---|---|---|---|---|
| Estatísticas | sim | sim (G2.13) | exibição | não | OK |
| Simulados (análises) | sim | sim (G2.12) | exibição | não | OK |
| Estudo × desempenho | sim | sim (G2.12) | exibição | não | OK |
| Dashboard — ranking por matéria | sim | **sim (G2.14)** | exibição | não | adaptado |
| Dashboard — desempenho por matéria / cobertura do edital / contexto plano-ciclo | sim | **sim (G2.14)** | exibição | não | adaptado |
| Estudos de Hoje | sim | **sim (G2.14)** — só o id alinhado | não | não | adaptado |
| Ciclo — estudo → item | sim | **sim (G2.14)**, antes de nome/similaridade | sim (legado) | sim (legado ≥ 0,8) | adaptado; similaridade preservada |
| Planejamento (geração/blocos) | sim | não | resolução por `name_key` | não | auditado, sem impacto hoje — não alterado (fora do escopo) |
| Revisões | sim | não | não | não | auditado, 0 itens em alias — não alterado |
| Edital (import/progresso) | sim | não | igualdade exata normalizada | não | auditado — não alterado |
| Listas de seleção do catálogo (simulado, importação, seletor da sessão, busca) | sim | **alias escondido (G2.14)** | — | não | adaptado |
| Importação (sugestão) | sim | via lista | sim | sim (só sugestão visível, G2.12) | OK |
| Tela "Disciplinas" (gestão dos vínculos) | sim | não | `custom_name` | não | mantida: mostra cada vínculo real |
| Admin | — | SQL (migration) | — | — | tela não criada (ver abaixo) |

## Dashboard

`getDashboardData` carrega a identidade de todas as disciplinas da carga (histórico, questões, vínculos, plano de hoje, blocos do ciclo) numa leitura e aplica `dashboard-identity.ts`: sessões e questões com id canônico e nome da identidade; vínculos do aluno mesclados (uma entrada por identidade, status do vínculo da canônica); contexto plano/ciclo/30 dias por identidade. O motor do ranking (`rankings.ts`) não mudou. Resultado: alias + canônica = uma linha, com o `custom_name` do aluno.

## Estudos de Hoje

Não há nova leitura: o widget usa `snapshot.disciplineIdentity` e `alignHistoryToBlocks` troca só o `disciplineId` da entrada para o do bloco da mesma identidade. Hoje, fuso, duração, distribuição entre blocos e estudo livre continuam sendo os do componente do plano (`daily-planning-view.tsx`, intocado).

## Ciclo

Por que existe a similaridade: casar histórico importado (outros nomes) com os itens do ciclo. Casamento extraído para `cycle-item-matcher.ts`, com a ordem: **id → identidade → nome → similaridade**. Classificação com dados reais (3 ciclos ativos):

| classe | caso real | antes | depois |
|---|---|---|---|
| A — mesmo id | maioria | id | id |
| B — alias → canônica | "Raciocínio Lógico-Matemático" → item "Raciocínio Lógico e Matemático" (6 sessões, 52 min) | similaridade 1,00 | **identidade** (mesmo resultado, sem depender de texto) |
| C — nomes parecidos, matérias diferentes | "Raciocínio Lógico" → item "Raciocínio Lógico e Matemático" (**50 sessões, 80 min** no ciclo de 1 aluno) | similaridade 0,80 | **inalterado** — decisão de produto |
| D — diferentes | demais | sem casamento | sem casamento |

A classe C contraria a regra de produto (RL ≠ RL e M), mas corrigi-la muda o progresso de um ciclo real; o fallback foi preservado e o caso está documentado para decisão.

## Planejamento, Revisões, Edital

- **Planejamento:** gera blocos a partir dos vínculos do aluno; se alias e canônica estiverem vinculados, ambos podem virar matérias do plano. Hoje: 0 itens de plano em alias. Não alterado (motor de planejamento fora do escopo); as listas de escolha sem alias evitam novos vínculos duplicados.
- **Revisões:** 0 `review_items` em alias. O catálogo "Adicionar à revisão" filtra tópicos por `discipline_id`: a canônica "Tecnologia da Informação (TI)" tem 0 tópicos e o alias "Tecnologia da Informação" tem 11 — decisão de dados/produto (mover ou copiar tópicos), não feita.
- **Edital:** importação por igualdade normalizada exata (G1.14); progresso por tópico. Sem alias envolvido. Não alterado.

## Listas de seleção

`discipline-aliases.ts`: `loadCatalogAliasIds` (1 consulta pequena, em paralelo com a lista) + `hideCatalogAliases`. Aplicado em: formulário de simulado, mapeamento da importação, catálogo do seletor da sessão de estudo (alias do plano do aluno continua visível) e busca de disciplina. Fail-open: sem a coluna ou com erro, a lista volta completa. Matérias já gravadas não dependem dessas listas. RL e "RL e Matemático" continuam separados.

## Nome exibido

1. `custom_name` do aluno na canônica; 2. nome global da canônica. "Inclui também: …" só onde ajuda (detalhe de Estatísticas e de Estudo × desempenho).

## Admin

Não foi criada tela. Motivos: 2 vínculos comprovados (já na migration), 4 pendentes de decisão, e a escrita já é admin-only no banco (trigger + RLS). Uma tela útil precisaria de ação server-side com `requireAdmin`, prévia de impacto (contagens por FK) e auditoria — fase própria quando houver volume.

## name_key

- Escrita com a chave do código: `discipline-actions` (criar/renomear), `edital.action`, `edital-importer/persist`, `generate-study-plan`, `study-cycle.actions` (um caminho).
- Escrita **sem** chave (fica NULL): `import-history.actions` (criar matéria) e 2 caminhos de `study-cycle.actions`.
- Leitura por `name_key`: os mesmos resolvedores + `searchDisciplinesAction`.
- Risco latente até a migration: com as 68 chaves corrompidas, um nome sem acento ("Lingua Portuguesa") não é achado por `name_key`; `edital.action`, `study-cycle.actions` e `generate-study-plan` caem num `ilike`/`in` exato e acentuado — podem criar uma linha nova (o UNIQUE não barra porque as chaves diferem). Nenhuma duplicata existe hoje (0 colisões). Correção: a própria migration G2.12 (recalcula as 68 e o trigger mantém a chave em todo insert/rename). Sem novo backfill nesta fase.

## Cache

| tela | mecanismo | após estudo | após simulado | após nome pessoal / vínculo | após rename global | após vínculo de alias (SQL) |
|---|---|---|---|---|---|---|
| Dashboard | renderização dinâmica por requisição | `revalidatePath` existente | — | `revalidatePath("/dashboard")` | idem | próxima carga |
| Estudos de Hoje | `useCachedServerAction` 5 min + evento de estudo salvo | refresh imediato | — | identidade vem do snapshot (próxima carga) | idem | próxima carga |
| Estatísticas | memória 5 min + invalidação (G2.13) | invalida | invalida | invalida | invalida todos | até 5 min |
| Simulados / Estudo × desempenho | sem cache | — | — | — | — | imediato |

## Performance

Uma leitura de identidade por tela (lotes de 100 ids, +1 para canônicas faltantes, +1 para `custom_name`), em paralelo quando possível; tradução O(n) com mapas; nenhum N+1 nem consulta por alias. Testes: 50.000 sessões (Estatísticas) e 30.000 (Dashboard) com soma exata em tempo linear. Ciclo: a identidade é carregada uma vez por reconstrução e reaproveitada entre ciclos ativos.

## Limitações

- Efeito real só depois da migration G2.12.
- Classe C do ciclo (RL → RL e M) e "Noções de …" dependem de decisão de produto.
- Tópicos de catálogo da TI estão no alias.
- Planejamento pode duplicar matéria se o aluno vincular alias e canônica (hoje não acontece).
