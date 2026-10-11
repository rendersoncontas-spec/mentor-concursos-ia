# G2.12 — Canonicalização do catálogo de disciplinas — relatório

Data: 2026-10-06. Produção consultada só com SELECT. Migration criada e **não aplicada**. Sem commit/push/deploy.
Detalhe técnico, tabela de diagnóstico completa e contrato do Mentor: `docs/discipline-catalog-normalization.md`.

**Veredito: VERDE para o mecanismo e os 2 vínculos comprovados; 4 vínculos ficam AMARELOS por dependerem de decisão de produto ("Noções de X").**

## 1. Tamanho do catálogo
123 disciplinas globais; 67 com algum uso; 56 sem uso. 16 tabelas referenciam `disciplines(id)` (16 FKs, 13 com CASCADE e 3 SET NULL; corrigido na G2.14 — antes dizia 19). `study_history`: 5.413 sessões em 35 disciplinas; `simulado_disciplines`: 7 linhas. Nenhum `custom_name`/`custom_color_hex` preenchido hoje.

## 2. Duplicatas
- Por chave canônica (caixa/acento/espaço/hífen): **0** colisões.
- Semânticas (conector, sigla, "Noções de", qualificador): 6 pares candidatos, conferidos com uso real.

## 3. Aliases (comprovados, vinculados na migration)
- Raciocínio Lógico-Matemático `6514acc4` → Raciocínio Lógico e Matemático `a999929b` (mesmos termos; o mesmo aluno migrou de uma para a outra em 28/09).
- Tecnologia da Informação `90a1c53e` → Tecnologia da Informação (TI) `b518ed3a` (sigla do próprio nome; a alias não tem uso).

## 4. Ambiguidades (pendentes de decisão)
Noções de Direito Administrativo, Noções de Direito Constitucional, Noções de Informática (escopo reduzido de DA/DC/Informática; só em 1 simulado) e Direito Constitucional (CF/1988 e Doutrina) (sem uso). SQL pronto e comentado no bloco 7 da migration. Se aprovado: o simulado registrado passa de 2 para 4 matérias (de 7) com horas atribuíveis.

## 5. Manter separadas
Raciocínio Lógico × RL e Matemático (regra explícita + uso paralelo do mesmo aluno), Ética × Ética no Serviço Público, Informática × TI, Contabilidade × Contabilidade Geral, Administração × Administração Geral e Pública, CTB × Legislação de Trânsito, blocos compostos × partes. Categorias de atividade importadas ("Revisão e Questões", "Baralho Anki", "Simulado"…) não são matéria.

## 6. Arquitetura atual (antes)
Catálogo global + aparência pessoal em `user_disciplines` (G1.1). Estudo e simulado se encontram só por `discipline_id` exato. **Achados:** (a) `name_key` corrompida em 68 linhas (acento virou espaço) → busca indexada não acha nomes acentuados e o UNIQUE não protege contra "Lingua Portuguesa" sem acento; 3 caminhos inserem sem `name_key`; (b) a RLS deixava qualquer conta logada fazer UPDATE no catálogo global; (c) a importação podia pré-selecionar o candidato errado num empate de score (desempate por id passava na frente da igualdade exata); (d) o registro de estudo no ciclo casa por similaridade ≥ 0,8 quando o id não bate (não alterado — ciclo fora do escopo).

## 7. Solução recomendada
Estratégia B: manter todos os ids e declarar `disciplines.canonical_discipline_id` (alias → canônica), curado por admin, nunca inferido por texto. Análises resolvem identidade por uma regra única (`discipline-identity.ts`).

## 8. Implementação
- Domínio: `src/domain/disciplines/discipline-identity.ts` (resolução com guarda de ciclo/cadeia, nome exibido = `custom_name` da canônica ou global, `subjectIdentityKey`).
- Loader: `src/application/disciplines/discipline-identity.loader.ts` (lotes de 100 ids, custom_name só do próprio usuário, compatível sem a migration).
- Simulados: `simulado-identity.ts` (`canonicalizeSimuladoRecords`, soma alias+canônica no mesmo simulado); `getSimuladoRecordsAction` devolve `identity`; `simulados-view` usa a cópia canônica só nas análises e filtro de matéria — lista e edição seguem com os ids gravados.
- Estudo × desempenho: `buildStudyPerformance({ identity })`, `mergedNames` na linha, "Inclui também: …" no detalhe; a action usa o loader (substitui a consulta de nomes) e pula a leitura duplicada.
- Regra única de nome: `buildSubjectAnalysis` agrupa por `subjectIdentityKey`; `subjectKey` da validação = `canonicalDisciplineKey`.
- Importação: igualdade exata vence empate; pré-seleção só com vencedor claro (margem ≥ 0,1); ambíguo fica para escolha explícita.

## 9. Migrations
`supabase/migrations/20261006_g2_12_discipline_canonical_identity.sql` (não aplicada): `discipline_name_key()`; correção de `name_key` (68 linhas, com guarda de colisão); trigger que mantém `name_key` derivada; `canonical_discipline_id` (FK SET NULL, CHECK ≠ id, índice parcial); trigger de guarda (só admin, sem cadeia); policy de UPDATE só admin; 2 vínculos conferindo id **e** nome; bloco pendente comentado; rollback documentado. Validada 2× em PGlite com o catálogo real: 26/26 (`docs/g2-12-migration-check.mjs`).

## 10. Impacto no histórico
Nenhum. Nenhuma linha apagada, nenhum `name` alterado, nenhuma FK repontada. `study_history`, `simulado_disciplines`, `user_disciplines`, ciclos, planos, revisões e questões não são tocados (teste de wiring garante que o SQL executável nem cita essas tabelas).

## 11. Impacto em simulados
Simulado antigo numa alias e novo na canônica viram uma evolução só; gargalos e filtro por matéria idem. Totais do simulado nunca mudam. Editar um simulado não troca o id gravado.

## 12. Impacto em estatísticas
Estudo × desempenho: identidade canônica (após a migration, o aluno do simulado passa de 228 para 287 min em "Raciocínio Lógico e Matemático" nas últimas 8 semanas). A página Estatísticas **não** foi alterada (motor/loaders próprios ligados a plano, status do edital e revisões) — próximo passo.

## 13. Impacto no Mentor IA
Contrato `discipline_identity` = `{ disciplineId, canonicalDisciplineId, displayName, mergedNames }`; comparar sempre pela canônica, nunca inferir por nome, categorias de atividade não são matéria (doc §8).

## 14. Testes
+44 testes (2141 → 2185), 5 arquivos novos registrados no `package.json`:
- `discipline-identity.test.ts` — nomes idênticos, acento (inclusive NFD), hífen, caixa, matérias diferentes que não colidem, alias, cadeia/ciclo, custom_name, cópia sem mutação.
- `discipline-identity.loader.test.ts` — canônica carregada sob demanda, custom_name só do próprio usuário (A × B), banco sem a migration, erro real, lotes (250 ids = 3 leituras).
- `discipline-canonical-analysis.test.ts` — **Estudo em A + Simulado em B (aliases de X) aparecem juntos em X**, simulado antigo + novo, soma no mesmo simulado, gargalos, RL × RL e M separadas, nome pessoal, comportamento anterior sem identidade, wiring da tela/actions.
- `subject-matcher-g2-12.test.ts` — exata vence empate, ambíguo sem pré-seleção, vencedor claro mantido.
- `discipline-canonical-migration.wiring.test.ts` — sem DELETE/TRUNCATE/DROP de tabela, sem tocar histórico, sem renomear, guarda admin, RLS, só 2 vínculos executados, rollback.
- `simulado-record-validation.test.ts` (+2) — hífen = mesma matéria; parecidas continuam aceitas.

## 15. Limitações
- Migration não aplicada: até lá, o código funciona igual ao de antes (identidade = id).
- RLS real verificada em PGlite com as policies reproduzidas, não no Supabase.
- Estatísticas, listas de seleção e o casamento por similaridade do ciclo ainda não usam a identidade.
- Vínculos são por SQL (sem tela admin).

## 16. Próximos passos
1. Aplicar em staging → produção (esperado: 68 `name_key` corrigidas, 0 bloqueadas, 2 vínculos).
2. Decidir "Noções de X".
3. Estatísticas pela identidade canônica.
4. Esconder aliases nas listas de seleção.
5. Tela admin de vínculos.
6. Ciclo: trocar similaridade por identidade canônica.

## Comandos

```
npm test            → # tests 2185 · # pass 2185 · # fail 0
npx tsc --noEmit    → exit 0
npm run build       → OK
eslint (arquivos tocados) → só os 6 erros pré-existentes (mesmos do arquivo original: non-null assertions em simulado-stats.service, set-state-in-effect e nested-ternary em simulados-view)
PGlite (migration 2×) → 26/26 PASS
npm audit           → não executado (nenhuma dependência mudou)
```
