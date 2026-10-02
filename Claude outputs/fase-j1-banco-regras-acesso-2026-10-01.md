# NomeIA — Fase J.1 — Comunidade (MVP): Banco e Regras de Acesso

**Data:** 01/10/2026
**Escopo:** só banco (migration + funções) e as 7 server actions descritas no brief. Interface (J.2) e ranking interno/meta coletiva (J.3) ficam para as próximas sub-fases, como planejado.

**Decisões confirmadas pelo usuário:** nome na interface = "Grupo de Estudos"; aprovado criar as tabelas novas no banco de produção.

---

## 1. O que foi criado

### Banco (`supabase/migrations/20261001_study_groups.sql`) — **NÃO aplicado ao banco de produção**

- `study_groups` (id, name, invite_code único, owner_id, created_at) e `study_group_members` (group_id, user_id, joined_at, chave primária composta) — aditivo, sem dados existentes para migrar.
- RLS ligado nas duas tabelas. Ninguém lista `study_groups` por fora — só dono/membro enxerga a linha. **Nenhuma das duas tabelas tem política de INSERT direta**: toda entrada passa por uma das duas funções abaixo, o que evita (a) condição de corrida entre ler o código e inserir a membership, e (b) exposição de `study_groups` a tentativas de adivinhar código por busca direta na tabela.
- `create_study_group(p_name)` — `SECURITY DEFINER`: cria o grupo e já insere o dono como membro, numa única função (nunca existe um grupo sem nenhum membro).
- `join_study_group_by_code(p_code)` — `SECURITY DEFINER`: resolve o código (maiúsculas, sem espaço) e insere a membership com `ON CONFLICT DO NOTHING` (reenviar o mesmo código não duplica nem quebra).
- `regenerate_study_group_invite_code(p_group_id)` — `SECURITY DEFINER`, só o dono: gera um novo código, o antigo para de funcionar imediatamente (sobrescrito, sem histórico).
- Reforço em dois lugares, não só na aplicação: a policy de `DELETE` em `study_group_members` já bloqueia o dono de "sair" diretamente no banco (`not exists (... g.owner_id = auth.uid())`), então mesmo que a checagem da action fosse removida por engano, o banco ainda recusa.
- Código de convite: 7 caracteres, alfabeto sem I/O/0/1 (evita confusão ao digitar à mão), com até 10 tentativas de regenerar em caso de colisão (extremamente improvável, mas tratado).
- Todas as 3 funções seguem o mesmo padrão de segurança já usado em `get_public_study_profile` (`docs/public-study-profile-rpc.sql`): `SECURITY DEFINER` + `SET search_path = public`, e recusam chamada sem `auth.uid()`.

### Camada de aplicação

- `src/domain/study-groups/study-group.types.ts` — tipos (`StudyGroup`, `StudyGroupMember`, `StudyGroupDetail`).
- `src/application/study-groups/study-group.schema.ts` — validação Zod (nome até 80 caracteres, espelhando a checagem que também existe no banco; código até 16 caracteres; `groupId` como UUID).
- `src/application/study-groups/study-group.actions.ts` — as 7 server actions do brief: `createStudyGroupAction`, `joinStudyGroupByCodeAction`, `leaveStudyGroupAction`, `regenerateInviteCodeAction`, `deleteStudyGroupAction`, `listMyStudyGroupsAction`, `getStudyGroupDetailAction` (esta última, nesta sub-fase, devolve só grupo + membros — o ranking interno entra na J.3, como planejado).

## 2. Uma decisão de desenho que vale explicar

As ações que modificam dado (criar, entrar, sair, apagar, regenerar código) usam o usuário **realmente autenticado** (`supabase.auth.getUser()`), não o "usuário efetivo" que o resto do app usa durante uma sessão de suporte de admin (`getEffectiveUserId`, usado por exemplo em `goals.action.ts`). A leitura (`listMyStudyGroupsAction`) usa `getEffectiveUserId`, para ficar consistente com o resto do app nesse cenário (um admin em suporte vê as turmas do aluno, não as próprias). A razão de separar os dois: não existe um caso de suporte legítimo para um admin "entrar num grupo" ou "sair de um grupo" em nome de um aluno — e a RLS, de qualquer forma, só entende `auth.uid()` (a identidade real da sessão), então mutações usando `getEffectiveUserId` simplesmente não fariam o que pareceriam fazer.

## 3. Limite de membros

Sem constraint no banco (como o brief definiu) — `joinStudyGroupByCodeAction` confere a contagem atual contra `MAX_GROUP_MEMBERS = 100` antes de chamar o RPC de entrada. Ajustável depois sem nova migration.

## 4. TESTS

**36 testes novos, registrados em `package.json`:**

- `src/infrastructure/database/study-groups-rls.wiring.test.ts` (17 testes) — lê o texto da migration e confirma: as duas tabelas existem de forma idempotente, `invite_code` é único, a chave composta impede entrada duplicada, RLS ligado nas duas tabelas, nenhuma política de INSERT direta em lugar nenhum do arquivo, a policy de leitura exige dono/membro, a policy de saída bloqueia o dono no próprio banco, só o dono apaga/atualiza, as 3 funções são `SECURITY DEFINER` com `search_path` fixo e recusam chamada sem autenticação, `join_study_group_by_code` usa `ON CONFLICT DO NOTHING`, `regenerate_study_group_invite_code` confere o dono, `create_study_group` insere as duas linhas, e o alfabeto do código não tem caracteres ambíguos.
- `src/application/study-groups/study-group-actions.wiring.test.ts` (19 testes) — confirma que as mutações usam `auth.getUser()` (nunca `getEffectiveUserId`) e a leitura usa `getEffectiveUserId`; que cada action chama exatamente o nome de RPC que existe na migration, com os parâmetros certos; que toda action com entrada do usuário valida com Zod antes de usar o valor; que `leaveStudyGroupAction`/`deleteStudyGroupAction` conferem o dono com uma mensagem amigável; e que o limite de membros é checado antes do RPC de entrada.

**Suíte completa:** `npm test` → **1466 testes, 0 falhas** (1430 + 36 novos; nenhum teste existente foi removido ou enfraquecido). `npx tsc --noEmit` → 0 erros. `npm run build` → OK.

## 5. LIMITATION — o que estes testes NÃO provam

Igual ao precedente de `schema-rls-hardening.wiring.test.ts` (hardening de 21/09): este ambiente não tem acesso a um Postgres real nem à instância de produção do Supabase. Os testes acima são de fiação/estáticos — leem o texto da migration e do código e confirmam que o desenho pretendido está de fato escrito, mas **não executam a migration, não criam usuários de teste, e não provam que o RLS realmente bloqueia o que deveria em tempo de execução**. Os três cenários mais importantes para verificar manualmente antes de confiar nisso em produção:

1. Um usuário não consegue ler, listar membros, nem entrar num grupo do qual não participa, mesmo manipulando o `groupId`/código diretamente via API.
2. Duas pessoas entrando ao mesmo tempo com o mesmo código não duplicam a membership nem geram erro — `ON CONFLICT DO NOTHING` deveria segurar isso.
3. O dono realmente não consegue remover a própria membership (nem direto via API, só a UI) — só apagando o grupo inteiro.

**Recomendação:** antes de aplicar em produção, rodar esta migration numa branch de desenvolvimento do Supabase (ou localmente via `supabase start`) e testar os 3 cenários acima com dois usuários de teste de verdade. Posso fazer isso usando as ferramentas de Supabase conectadas a esta sessão, se você quiser — mas isso envolve criar uma branch no seu projeto Supabase, então prefiro ter sua confirmação explícita antes de mexer na infraestrutura do seu projeto.

## 6. BANCO

A migration **não foi aplicada** — está só como arquivo em `supabase/migrations/20261001_study_groups.sql`, do jeito que todas as migrations deste projeto chegam até você (você aplica pelo Supabase, no seu tempo). Nenhuma tabela, policy ou função existente foi alterada — tudo aditivo e novo.

## 7. GIT

Sincronizado para o seu computador e verificado por `md5sum` idêntico nos 7 arquivos (migration, tipos, schema, actions, os 2 arquivos de teste, e o `package.json` atualizado). **Nenhum commit foi feito. Nenhum push foi feito.**

---

## 8. Próximos passos

- **J.2** — interface: aba "Minhas turmas" dentro de `/ranking`, fluxo de criar/entrar/sair/apagar/regenerar, estados vazios.
- **J.3** — ranking interno (reaproveitando a consulta de ranking já existente, escopada aos membros do grupo) e a meta coletiva, completando `getStudyGroupDetailAction`.

Antes de ir para a J.2, talvez valha a pena aplicar esta migration numa branch de teste do Supabase e validar os 3 cenários da seção 5 — me avisa como prefere seguir.
