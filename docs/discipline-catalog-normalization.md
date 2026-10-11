# Catálogo de disciplinas — identidade canônica (G2.12)

Data do levantamento: 2026-10-06 (produção, somente leitura).
Migration: `supabase/migrations/20261006_g2_12_discipline_canonical_identity.sql` — **criada, não aplicada**.

## 1. Como o catálogo funciona hoje

- `disciplines` é **global** (sem dono): `id`, `name` (exibição), `name_key` (chave de comparação), `area`, `color_hex`.
- `user_disciplines` é o vínculo **pessoal**: `custom_name` e `custom_color_hex` (G1.1) — NULL/"" = segue o global. Regra única em `resolveUserDisciplineDisplay`.
- 16 tabelas referenciam (16 FKs; corrigido na G2.14 — antes dizia 19) `disciplines(id)`: `study_history`, `simulado_disciplines` (SET NULL), `user_disciplines`, `topics`, `question_topics`, `questions`, `review_items`, `study_cycle_items`, `study_cycle_sessions` (SET NULL), `study_plan_items`, `study_plan_daily_blocks`, `exam_disciplines`, `exam_subjects`, `subjects`, `adaptive_history`, `study_sessions` (SET NULL) — as demais com `ON DELETE CASCADE`. **Apagar uma disciplina apagaria histórico de estudo, ciclos, planos e questões.** Por isso nada é apagado nem fundido.
- `edital_topic_progress` não referencia `disciplines` diretamente (vai por tópico).
- Estudo e simulado se encontram por `discipline_id` (mesmo catálogo).

### Números (produção)

| item | valor |
|---|---|
| disciplinas no catálogo | 123 |
| com algum uso (estudo, simulado, vínculo, tópico, ciclo, plano, questão…) | 67 |
| sem uso nenhum | 56 |
| `name_key` divergente da chave do código | **68** (toda linha com acento) |
| colisões de chave canônica (mesmo nome normalizado) | 0 |
| `custom_name`/`custom_color_hex` preenchidos | 0 |
| `study_history` | 5.413 sessões, 35 disciplinas |
| `simulado_disciplines` | 7 linhas, 7 disciplinas |

### Problema 1 — `name_key` corrompida (comprovado)

O backfill da G1.1 usou `regexp_replace(name, '[^a-zA-Z0-9 ]', ' ')` sem tirar acentos: "Língua Portuguesa" virou `l ngua portuguesa`, enquanto o código procura `lingua portuguesa`. Consequências:
- a busca indexada por `name_key` **nunca acha** nome com acento; o código cai no caminho legado (ilike exato + varredura de até 500 linhas em memória) — funciona hoje (123 linhas), deixa de funcionar acima de 500;
- o índice UNIQUE de `name_key` **não protege** contra duplicata de nome acentuado: um insert de "Lingua Portuguesa" (chave `lingua portuguesa`) não colide com `l ngua portuguesa`;
- a busca de disciplinas (`searchDisciplinesAction`) por `name_key` não encontra nomes acentuados digitados sem acento;
- 3 caminhos inserem disciplina **sem** `name_key` (`import-history.actions`, 2 em `study-cycle.actions`) → linha nova com chave NULL.

### Problema 2 — mesma matéria em linhas diferentes

Encontrado com normalização determinística (minúsculas, sem acento, espaços, hífen, pontuação, conectivos "e/de/da/do", prefixo "Noções de") e conferido com **uso real** (quem estudou, quando, em quê). Nada foi decidido só por texto.

## 2. Diagnóstico das disciplinas em uso

⚠ = `name_key` gravada diferente da chave canônica do código (a migration corrige).

| id | nome | name_key gravada | uso (estudo · simulado) | relações |
|---|---|---|---|---|
| `541130b3` | Administração | `administra o` ⚠ | — | tópicos 18 |
| `dde02333` | Administração de Recursos Materiais | `administra o de recursos materiais` ⚠ | — | itens de ciclo 1 |
| `15ae218b` | Administração Geral e Pública | `administra o geral e p blica` ⚠ | 49 sessões (2 usuários) | vínculos pessoais 2 |
| `9420e37e` | AFO | `afo` | — | tópicos 11 |
| `f4a6a154` | AFO, Direito Financeiro e Contabilidade Pública | `afo direito financeiro e contabilidade p blica` ⚠ | — | vínculos pessoais 1 |
| `6650217b` | Análise das Demonstrações Contábeis | `an lise das demonstra es cont beis` ⚠ | — | itens de ciclo 1 |
| `817d3226` | Antropologia | `antropologia` | — | itens de ciclo 1, itens de plano 43 |
| `50390dfc` | Arquivologia | `arquivologia` | — | itens de plano 27 |
| `e1f3e6c1` | Atualidades e Conhecimentos Gerais | `atualidades e conhecimentos gerais` | 1 sessão (1 usuário) | — |
| `2a9154eb` | Audio Book | `audio book` | 10 sessões (2 usuários) | vínculos pessoais 2 |
| `384377f6` | Auditoria | `auditoria` | 116 sessões (2 usuários) | vínculos pessoais 2, tópicos 10, itens de plano 6, blocos de plano 18, adaptive_history 2 |
| `a60d2d4f` | Auditoria Governamental e Controle | `auditoria governamental e controle` | — | vínculos pessoais 1 |
| `111f769f` | Baralho Anki | `baralho anki` | 395 sessões (3 usuários) | vínculos pessoais 2 |
| `784c3da9` | Comércio Internacional | `com rcio internacional` ⚠ | 17 sessões (2 usuários) | vínculos pessoais 2, itens de ciclo 1 |
| `ce7772fc` | Conhecimentos Bancários | `conhecimentos banc rios` ⚠ | — | tópicos 9 |
| `fc9e6b37` | Contabilidade | `contabilidade` | 208 sessões (2 usuários) | vínculos pessoais 2 |
| `a4ab4c39` | Contabilidade de Custos | `contabilidade de custos` | — | itens de ciclo 1 |
| `17813c5d` | Contabilidade Geral | `contabilidade geral` | 42 sessões (1 usuário) | vínculos pessoais 4, tópicos 11, itens de ciclo 1, sessões de ciclo 42, itens de plano 123, blocos de plano 96, adaptive_history 2 |
| `83b36b41` | Contabilidade Pública | `contabilidade p blica` ⚠ | — | tópicos 8 |
| `e8324127` | Criminalística | `criminal stica` ⚠ | — | tópicos 5 |
| `b1fab663` | Criminologia | `criminologia` | — | tópicos 4 |
| `d8ecf8ed` | CTB | `ctb` | 38 sessões (2 usuários) | vínculos pessoais 2 |
| `a7eae543` | Direito Administrativo | `direito administrativo` | 226 sessões (3 usuários) | vínculos pessoais 5, tópicos 19, itens de ciclo 2, sessões de ciclo 137, itens de plano 106, blocos de plano 84, questões 12, exam_disciplines 1, exam_subjects 3, subjects 3, adaptive_history 4, question_topics 3 |
| `3aea78ce` | Direito Civil | `direito civil` | — | tópicos 7 |
| `5ad2134f` | Direito Constitucional | `direito constitucional` | 277 sessões (3 usuários) | vínculos pessoais 4, tópicos 16, itens de ciclo 2, sessões de ciclo 172, itens de plano 93, blocos de plano 70, questões 15, exam_disciplines 1, exam_subjects 3, subjects 3, question_topics 3 |
| `690c63a6` | Direito Eleitoral | `direito eleitoral` | — | itens de ciclo 1 |
| `8eee7405` | Direito Internacional | `direito internacional` | — | itens de ciclo 1 |
| `0c4841e8` | Direito Penal | `direito penal` | 66 sessões (2 usuários) | vínculos pessoais 2, tópicos 15 |
| `3a8bda81` | Direito Previdenciário | `direito previdenci rio` ⚠ | 39 sessões (3 usuários) | vínculos pessoais 3, itens de ciclo 1, sessões de ciclo 10, itens de plano 5, blocos de plano 28, adaptive_history 2 |
| `dad6f1f2` | Direito Processual Penal | `direito processual penal` | — | tópicos 13 |
| `a290624d` | Direito Tributário | `direito tribut rio` ⚠ | 361 sessões (2 usuários) | vínculos pessoais 6, tópicos 10, itens de ciclo 1, sessões de ciclo 212, itens de plano 128, blocos de plano 79, adaptive_history 2 |
| `476fc0e6` | Discursiva | `discursiva` | 4 sessões (2 usuários) | vínculos pessoais 2, itens de ciclo 1 |
| `85646b19` | Economia | `economia` | — | vínculos pessoais 1, tópicos 4 |
| `a0fb9f9c` | Educação | `educa o` ⚠ | — | tópicos 10, itens de ciclo 1 |
| `6bf2e9b6` | Enfermagem | `enfermagem` | — | itens de ciclo 1 |
| `ae940d46` | Estatística | `estat stica` ⚠ | 61 sessões (2 usuários) | vínculos pessoais 2, tópicos 7, itens de ciclo 1, sessões de ciclo 36, itens de plano 2, blocos de plano 9, adaptive_history 2 |
| `e7c63a6b` | Ética | ` tica` ⚠ | 11 sessões (3 usuários) | vínculos pessoais 2, itens de ciclo 1, sessões de ciclo 1 |
| `08b7a09b` | Ética no Serviço Público | ` tica no servi o p blico` ⚠ | 1 simulado | — |
| `bd81f6e1` | Física | `f sica` ⚠ | 32 sessões (2 usuários) | vínculos pessoais 2 |
| `9a49c8e8` | Fluência em Dados | `flu ncia em dados` ⚠ | — | vínculos pessoais 2, itens de plano 20, blocos de plano 13, adaptive_history 2 |
| `be875808` | Geopolítica | `geopol tica` ⚠ | 20 sessões (2 usuários) | vínculos pessoais 2 |
| `d0b87e03` | Informática | `inform tica` ⚠ | 33 sessões (3 usuários) | vínculos pessoais 3, tópicos 9, itens de ciclo 1, sessões de ciclo 7, itens de plano 2, blocos de plano 29, questões 12, question_topics 2 |
| `8ff3c25e` | Inteligência e Equilíbrio Emocional | `intelig ncia e equil brio emocional` ⚠ | 2 sessões (2 usuários) | vínculos pessoais 2 |
| `99386d10` | Legislação de Trânsito | `legisla o de tr nsito` ⚠ | 100 sessões (2 usuários) | vínculos pessoais 2 |
| `43329e92` | Legislação Municipal | `legisla o municipal` ⚠ | 2 sessões (1 usuário) | — |
| `f085ae9a` | Legislação Penal Especial | `legisla o penal especial` ⚠ | — | tópicos 8 |
| `d4ecb8b1` | Legislação Tributária | `legisla o tribut ria` ⚠ | 6 sessões (2 usuários) | vínculos pessoais 2, itens de plano 3, blocos de plano 9, adaptive_history 1 |
| `f1bc427e` | Língua Inglesa | `l ngua inglesa` ⚠ | 40 sessões (2 usuários) | vínculos pessoais 2, itens de ciclo 1, sessões de ciclo 34, itens de plano 52 |
| `62478b9a` | Língua Portuguesa | `l ngua portuguesa` ⚠ | 371 sessões (3 usuários) · 1 simulado | vínculos pessoais 5, tópicos 20, itens de ciclo 2, sessões de ciclo 217, itens de plano 100, blocos de plano 92, questões 15, exam_disciplines 1, exam_subjects 4, subjects 4, adaptive_history 3, question_topics 3 |
| `78a52019` | Matemática | `matem tica` ⚠ | — | tópicos 16 |
| `309eb871` | Medicina Legal | `medicina legal` | — | tópicos 4 |
| `264fa036` | Memorex Receita | `memorex receita` | 18 sessões (2 usuários) | vínculos pessoais 2 |
| `f44bb805` | Noções de Direito Administrativo | `no es de direito administrativo` ⚠ | 1 simulado | — |
| `cda018d6` | Noções de Direito Constitucional | `no es de direito constitucional` ⚠ | 1 simulado | — |
| `1f45f64d` | Noções de Informática | `no es de inform tica` ⚠ | 1 simulado | — |
| `e82b7224` | Polícia Penal | `pol cia penal` ⚠ | 268 sessões (2 usuários) | vínculos pessoais 2 |
| `a1e89de7` | Raciocínio Lógico | `racioc nio l gico` ⚠ | 54 sessões (2 usuários) | vínculos pessoais 4, tópicos 13, itens de ciclo 1, sessões de ciclo 54, itens de plano 92, blocos de plano 61, questões 13, adaptive_history 4, question_topics 2 |
| `a999929b` | Raciocínio Lógico e Matemático | `racioc nio l gico e matem tico` ⚠ | 62 sessões (2 usuários) · 1 simulado | vínculos pessoais 2, itens de ciclo 1, sessões de ciclo 17 |
| `6514acc4` | Raciocínio Lógico-Matemático | `racioc nio l gico matem tico` ⚠ | 6 sessões (1 usuário) | vínculos pessoais 1, sessões de ciclo 6 |
| `26f147ce` | Redação | `reda o` ⚠ | 30 sessões (2 usuários) | vínculos pessoais 2 |
| `b8ea8346` | Revisão e Questões | `revis o e quest es` ⚠ | 2164 sessões (2 usuários) | vínculos pessoais 2 |
| `eaafc3d2` | Saúde Pública | `sa de p blica` ⚠ | — | tópicos 6 |
| `2adcb896` | Segurança Pública | `seguran a p blica` ⚠ | — | tópicos 4 |
| `78f477eb` | Serviço Social | `servi o social` ⚠ | 1 simulado | — |
| `3fee1092` | Simulado | `simulado` | 94 sessões (3 usuários) | vínculos pessoais 2 |
| `90a1c53e` | Tecnologia da Informação | `tecnologia da informa o` ⚠ | — | tópicos 11 |
| `b518ed3a` | Tecnologia da Informação (TI) | `tecnologia da informa o ti ` ⚠ | 190 sessões (2 usuários) | vínculos pessoais 2, itens de ciclo 1, sessões de ciclo 109, itens de plano 6, blocos de plano 18, adaptive_history 2 |

Sem uso nenhum (56): Arqueologia, Arquitetura, Artes e Música, Auditoria Privada, Bancos - Atendimento, Vendas, História, etc., Biblioteconomia, Biologia e Biomedicina, Ciências Atuariais (Atuária), Ciências Políticas, Ciências Sociais, Comunicação Social, Contabilidade de Instituições Financeiras e Atuariais, Criminalística e Medicina Legal, Defesa Civil, Desenho Técnico e Modelagem da Construção, Design e Artes Gráficas, Direito Agrário, Direito Ambiental, Direito Constitucional (CF/1988 e Doutrina) (`05a08d3e`), Direito do Consumidor, Direito do Trabalho, Direito Empresarial, Direito Financeiro, Direito Militar, Direito Penal Militar, Direito Processual Civil, Direito Processual do Trabalho, Direito Processual Penal Militar, Direitos Humanos, Educação Física, Engenharia Agronômica, Engenharia Ambiental, Engenharia Civil, Engenharia de Segurança do Trabalho, Engenharia Elétrica, Engenharia Mecânica, Farmácia, Filosofia, Fisioterapia, Fonoaudiologia, Geografia, História, Legislação Estadual, Legislação Federal, Língua Espanhola, Língua Francesa, Matemática Financeira, Medicina, Medicina Veterinária, Nutrição, Odontologia, Psicologia, Química, Seguridade Social, Sociologia, Teologia. Ficam como estão (catálogo de escolha; não atrapalham nenhuma análise).

## 3. Candidatos a duplicata — classificação

Critério de **equivalência comprovada**: (a) a diferença de nome é puramente formal e determinística (conector × hífen; sigla entre parênteses que é a sigla do próprio nome) **e** (b) o uso real não contradiz (nenhum aluno usa as duas como coisas diferentes; ou o mesmo aluno migrou de uma para a outra).

### 3.1 Canônicas e aliases — comprovados (vinculados pela migration)

| alias (continua existindo) | canônica | por que é a mesma matéria | uso real |
|---|---|---|---|
| Raciocínio Lógico-Matemático `6514acc4` | Raciocínio Lógico e Matemático `a999929b` | Mesmos dois termos; só muda "-" por " e ". Em editais as duas grafias nomeiam a mesma matéria. | O mesmo aluno estudou na canônica até 24/09 (17 sessões, 228 min em 8 semanas) e passou para a alias em 28/09 (6 sessões, 59 min). Nenhum outro aluno usa a alias. Canônica = a de mais uso e a usada no simulado. |
| Tecnologia da Informação `90a1c53e` | Tecnologia da Informação (TI) `b518ed3a` | "(TI)" é a sigla do próprio nome. | A alias não tem estudo, simulado, ciclo, plano nem vínculo pessoal (só 11 tópicos de catálogo); a canônica tem 190 sessões de 2 alunos. |

### 3.2 Ambíguos — pendentes de decisão de produto (SQL pronto, comentado)

| candidato | possível canônica | por que não foi vinculado |
|---|---|---|
| Noções de Direito Administrativo `f44bb805` | Direito Administrativo `a7eae543` | "Noções de" é escopo **reduzido** no edital. Para o aluno é a mesma matéria; para comparação de desempenho pode ser outra régua. Só aparece em 1 simulado. |
| Noções de Direito Constitucional `cda018d6` | Direito Constitucional `5ad2134f` | Idem. |
| Noções de Informática `1f45f64d` | Informática `d0b87e03` | Idem. |
| Direito Constitucional (CF/1988 e Doutrina) `05a08d3e` | Direito Constitucional `5ad2134f` | Qualificador descritivo, não sigla. Sem uso nenhum — vincular é inofensivo, mas não é "prova". |

Impacto medido se a decisão for "Noções de X = X": no simulado registrado, as matérias com horas atribuíveis passam de 2 de 7 para 4 de 7 (Direito Administrativo: 1.297 min em 8 semanas; Direito Constitucional: 3.896 min).

### 3.3 Manter separadas (parecidas, mas outra matéria ou outro escopo)

| par | motivo |
|---|---|
| Raciocínio Lógico × Raciocínio Lógico e Matemático | Regra explícita da fase: não equivalentes. RL não inclui matemática; ambas têm estudo do mesmo aluno em paralelo (13/08–01/09 e 20/08–24/09). |
| Ética × Ética no Serviço Público | Ética geral × recorte de ética pública (Decreto 1.171 etc.). |
| Informática × Tecnologia da Informação (TI) | Básico (usuário) × área técnica (cargos de TI). |
| Contabilidade × Contabilidade Geral | "Contabilidade" (importada de planilha, 208 sessões até 08/08) pode ser guarda-chuva de Geral/Pública/Custos. Ambíguo: decidir com o aluno, não no catálogo. |
| Administração × Administração Geral e Pública | Mesmo raciocínio: guarda-chuva × recorte. |
| CTB × Legislação de Trânsito | CTB é parte da legislação de trânsito, não o todo. |
| AFO × "AFO, Direito Financeiro e Contabilidade Pública"; Criminalística × "Criminalística e Medicina Legal" | Bloco composto × uma das partes. |
| Direito Previdenciário × Seguridade Social; Direito Militar × Direito Penal Militar; Matemática × Matemática Financeira | Matérias diferentes. |

### 3.4 Categorias que não são matéria

"Revisão e Questões" (2.164 sessões), "Baralho Anki", "Simulado", "Audio Book", "Memorex Receita", "Discursiva", "Polícia Penal", "Inteligência e Equilíbrio Emocional" vieram de planilhas importadas, onde a coluna "matéria" era usada também para **tipo de atividade**. Não são aliases de nada. Ficam como estão; o Mentor IA deve tratá-las como "atividade sem matéria definida" (ver §8), nunca como disciplina para comparar desempenho.

## 4. Nome canônico × nome exibido × nome pessoal

| conceito | onde mora | quem muda | uso |
|---|---|---|---|
| **identidade** | `disciplines.id` + `canonical_discipline_id` | admin (trigger + RLS) | agrupar dados de fontes diferentes |
| **chave de nome** | `disciplines.name_key` = `discipline_name_key(name)` | derivada (trigger) | deduplicar/achar no catálogo; nunca para análise |
| **nome global** | `disciplines.name` | admin | exibição padrão |
| **nome pessoal** | `user_disciplines.custom_name` / `custom_color_hex` | o próprio aluno | exibição para ele; **nunca** alterado por esta fase |

Nas análises (Simulados, Estudo × desempenho) o nome mostrado de uma identidade é: `custom_name` do aluno **na canônica** → senão o nome global da canônica. As linhas-alias somadas aparecem como "Inclui também: …" no detalhe.

## 5. Estratégias avaliadas

| estratégia | resultado |
|---|---|
| **A. Consolidar** (repontar FKs e apagar a duplicata) | Rejeitada. 16 FKs, 13 com CASCADE; `user_disciplines` tem UNIQUE (user, target, discipline) → colisões; o catálogo é global (afetaria todos os alunos); irreversível; reescreve histórico. |
| **B. Manter ids + `canonical_discipline_id`** | **Escolhida.** Uma coluna, relação explícita, reversível com um UPDATE; histórico intocado; resolução O(1) por id. |
| C. Manter tudo separado | Rejeitada: é o estado atual — estudo e simulado da mesma matéria não se encontram (G2.11). |
| D. Tabela `discipline_aliases` (texto → id) | Desnecessária agora: os aliases já são linhas do catálogo; a resolução de nome para id continua por `name_key` exata. Fica como opção se um dia houver sinônimos sem linha própria. |

## 6. Implementação (código)

- `src/domain/disciplines/discipline-identity.ts` — regra única, pura: `resolveCanonicalIds` (cadeia/ciclo seguros), `buildDisciplineIdentity`, `canonicalIdOf`, `identityDisplayName`, `canonicalizeDisciplineIds`, `subjectIdentityKey`. Identidade nunca vem de texto.
- `src/application/disciplines/discipline-identity.loader.ts` — `loadDisciplineIdentity(supabase, userId, ids)`: catálogo por `in(id)` em lotes de 100, +1 leitura para canônicas ausentes, +1 para `custom_name` **do próprio usuário**. Compatível com banco sem a migration (coluna ausente → cada id é ele mesmo).
- `src/application/simulados/simulado-identity.ts` — `canonicalizeSimuladoRecords`: cópia dos registros na identidade canônica; alias + canônica no mesmo simulado são somadas (totais não mudam). Registros originais intocados.
- `getSimuladoRecordsAction` devolve `identity`; a tela de Simulados usa a cópia canônica **só nas análises** (evolução por matéria, gargalos, filtro de matéria). Lista, detalhe e edição usam o que foi gravado — editar um simulado nunca troca o id salvo.
- `buildStudyPerformance` recebe `identity`; estudo e simulado passam pela mesma resolução antes de se encontrarem. Nova coluna `mergedNames` na linha.
- `buildSubjectAnalysis` agrupa por `subjectIdentityKey` (id; sem id, chave canônica do nome). `subjectKey` da validação de simulado agora é `canonicalDisciplineKey` (uma regra só).
- Importação (`suggestDisciplines`): igualdade exata do nome normalizado vence empate; sem igualdade exata, só pré-seleciona com vencedor claro (margem ≥ 0,1 sobre a 2ª). Caso ambíguo fica sem pré-seleção. `similarity()` não mudou (o ciclo também a usa).

Não alterado: Estatísticas (motor e loaders), ciclo, planejamento, timer, revisões, Capacitor, segurança G2.6.

## 7. Migration — impacto antes de aplicar

| bloco | linhas afetadas (produção) | dados de histórico tocados |
|---|---|---|
| `discipline_name_key()` | — | — |
| correção de `name_key` | 68 linhas de `disciplines` (só a coluna derivada) | nenhum |
| trigger de `name_key` | inserts/updates futuros | nenhum |
| `canonical_discipline_id` + FK + CHECK + índice + guarda | 123 linhas ganham a coluna (NULL) | nenhum |
| RLS UPDATE só admin | policy "Usuários autenticados podem atualizar disciplinas" substituída | nenhum |
| vínculos comprovados | 2 linhas: `6514acc4…` → `a999929b…`; `90a1c53e…` → `b518ed3a…` | nenhum (FKs continuam apontando para os mesmos ids) |

Backfill destrutivo: **não há**. Rollback: no fim do arquivo SQL (desfaz vínculos, triggers, coluna e devolve a policy antiga).

Validação: a migration foi executada **duas vezes** numa instância PGlite (Postgres em memória) com as 123 linhas reais do catálogo e as policies atuais — 26/26 verificações (sem perda de linha, nenhum `name` alterado, `name_key` = chave do código em 100% das linhas e em 10 casos-limite, só 2 vínculos, usuário comum barrado pela RLS e pela guarda, cadeia/auto-referência barradas, admin atualiza, apagar a canônica só desfaz o vínculo). Script: `docs/g2-12-migration-check.mjs`.

### Segurança

- Achado: a policy de UPDATE de `disciplines` permitia a **qualquer conta logada** renomear/recolorir uma disciplina de todos pela API (o código só faz isso para admin, mas a API aceitava). A migration restringe a admin. SELECT e INSERT não mudam (a criação de matéria por importação continua).
- `canonical_discipline_id` só muda por admin (ou migration/service role); usuário comum recebe erro 42501 mesmo se a RLS mudar no futuro.
- `custom_name`/`custom_color_hex` seguem só do dono (RLS de `user_disciplines` intocada); o loader filtra `user_id` do usuário efetivo.

## 8. Mentor IA — contrato `discipline_identity`

Toda informação por matéria entregue ao Mentor deve carregar:

```ts
{
  disciplineId: string            // id gravado no dado (histórico intacto)
  canonicalDisciplineId: string   // identidade para agrupar e comparar
  displayName: string             // custom_name do aluno na canônica, senão nome global
  mergedNames: string[]           // outras entradas do catálogo somadas nesta identidade
}
```

Regras: comparar e agregar sempre por `canonicalDisciplineId`; citar a matéria por `displayName`; nunca inferir equivalência por nome; categorias de atividade (§3.4) não são matéria. Função a usar: `loadDisciplineIdentity` + `canonicalIdOf`/`identityDisplayName`.

## 9. Próximos passos

1. Aplicar a migration em staging, conferir o NOTICE de `name_key` (esperado: 68 corrigidas, 0 bloqueadas) e os 2 vínculos; depois produção.
2. Decidir "Noções de X" (§3.2) e, se aprovado, descomentar o bloco 7 da migration (ou rodar como migration nova).
3. Estatísticas por matéria pela mesma identidade (precisa mexer nos loaders de estatística — fase própria).
4. Listas de seleção de matéria (simulado, sessão, importação) poderiam esconder linhas-alias para não criar novos dados nelas.
5. Tela admin para declarar/desfazer vínculo (hoje: SQL).
6. Ciclo: `cycle-study-registration.service` ainda casa estudo com item de ciclo por **similaridade ≥ 0,8** quando o id não bate (ex.: "Noções de Direito Administrativo" contaria em "Direito Administrativo"). Não alterado aqui (ciclo fora do escopo); recomendado trocar por identidade canônica.
