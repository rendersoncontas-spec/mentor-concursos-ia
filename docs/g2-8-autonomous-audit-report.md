# NomeIA — G2.8 Sprint Autônomo de Melhoria (Relatório Final)

**Data:** 2026-10-03
**Modo:** execução autônoma conforme diretiva G2.8. Nenhuma operação de git foi realizada (commit/push/pull) — trabalho só local, conforme regra obrigatória.

## 0. Contexto encontrado ao iniciar

Antes de procurar problemas novos, verifiquei o que as ~20 fases anteriores documentadas no projeto (A a J.1, F a F.6, G2.5 a G2.6.2) já cobriram, para não duplicar trabalho nem "inventar problema" em área já auditada:

- **Fase G** (24/09) já fez uma varredura completa de código morto: removeu 27 arquivos sem uso, 7 dependências não usadas, padronizou `import type`. 
- **Fase H** (24/09) já fez um inventário amplo de dado mock/placeholder/fake em todo o `src/`.
- **Fase G.1** já resolveu a pendência do painel `/dashboard/homologation` (hoje restrito a admin, 404 para os demais — verifiquei e confirmei que continua assim).
- **G2.6.1** já tratou segurança (P0/P1) e **G2.6.2** já corrigiu a geração de XLSX.
- As Fases E/G já identificaram e investigaram o "ruído" de CRLF que aparece no `git status` (ver item 1).

Dado esse histórico, a varredura ampla da Fase 1/15 da diretiva (TODO/FIXME, código morto, href="#", mocks) tendia a não encontrar muita coisa nova — e foi exatamente o que aconteceu, o que considero um resultado legítimo (não um sprint "vazio"): confirma que o código está num estado saudável, em vez de forçar uma correção cosmética só para preencher o relatório.

## 1. Problemas encontrados

### 1.1 — Ruído de CRLF no `git status`/`git diff` (confirmado, não é problema novo)

`git status` mostra ~155 arquivos como "modificados" em todo o repositório. Investiguei e confirmei que isso é **100% ruído de fim de linha** (CRLF vs. LF), sem nenhuma mudança real de conteúdo:

- `git diff --stat` normal: 155 arquivos, +16100/−16100 linhas (inserções == deleções em todo arquivo — assinatura clássica de conversão de fim de linha).
- `git diff --stat --ignore-cr-at-eol` (ignora só o `\r` final, mantém qualquer mudança de conteúdo real): **0 arquivos, 0 mudanças.**
- Isso confirma que a árvore de trabalho está semanticamente idêntica ao último commit — o "trabalho sujo" que o `git status` mostra não existe de verdade.

Isso já tinha sido notado nas Fases E/G ("ruído de quebra de linha que já existia", confirmado linha a linha contra o commit). Não é uma regressão desta sessão. Provável causa: sincronização OneDrive/Windows reescrevendo os arquivos com CRLF depois do checkout.

**Severidade:** P3 (cosmético/higiene — não afeta funcionamento, só dificulta revisar diffs reais no dia a dia).
**Correção:** NÃO ALTEREI — duas fases anteriores já passaram por essa mesma decisão e optaram por só documentar, sem mexer (risco de um `.gitattributes` novo gerar uma renormalização ruidosa, e a causa é do ambiente de sincronização, não do repositório). Registro aqui só para manter o histórico consistente; se quiser, a correção seria um `.gitattributes` com `* text=auto eol=lf` + `git add --renormalize .` uma única vez.

### 1.2 — Comunidade/Grupos de Estudo (J.1) sem nenhuma tela que os use

Confirmei que `src/application/study-groups/study-group.actions.ts` (as 7 server actions criadas na Fase J.1) **não têm nenhum chamador em `src/features` ou `src/app`** — busquei `StudyGroup`/`createStudyGroupAction`/etc. em todos os componentes e não há nenhuma ocorrência fora da própria camada de aplicação e dos testes de fiação.

**Isso não é um bug** — a própria Fase J.1 já deixava isso explícito como próximo passo planejado ("J.2 — interface"), e a migration nem foi aplicada ao banco ainda. Só confirmo que o estado é exatamente o documentado: nenhuma tela nova "esqueceu" de usar essas actions, elas genuinamente ainda não têm uma UI, por decisão sequencial do próprio roadmap.

**Severidade:** não aplicável (trabalho planejado, não concluído, não é regressão).
**Ação:** nenhuma — mencionado aqui só para registrar que seguem exatamente no estado que a J.1 deixou.

### 1.3 — Um `TODO` real no código (não urgente)

Busquei `TODO|FIXME|HACK` em todo `src/` (fora de testes): de 10 ocorrências, 9 eram falsos positivos (a palavra "TODO" em português, significando "todo/toda", dentro de comentários e strings — ex.: "TODOS os ciclos do usuário"). A única ocorrência real:

```
src/application/adaptive-learning/adaptive-learning.service.ts:11
// TODO(BACKLOG): Alerta de retenção crítica em janela única (caminho rápido).
```

Já está marcada pelo próprio autor como item de backlog não urgente.

**Severidade:** P3.
**Ação:** nenhuma — não há evidência de que seja necessário agora, e o próprio comentário já o classifica como backlog.

### 1.4 — Verificações que vieram limpas (sem achado)

Para que o relatório reflita o esforço real de investigação, registro também o que foi checado e **não** encontrou problema:

- **`console.log` em código de produção** (4 arquivos: `get-disciplines.action.ts`, `email.action.ts`, `weekly-planner.service.ts`, `email.service.ts`): todos são logs operacionais estruturados e intencionais (com timestamp, categoria, e-mail mascarado — `maskEmail`), um deles já condicionado a `NODE_ENV !== "production"`. Não são sobras de debug — são a infraestrutura de observabilidade do projeto. Nenhuma mudança feita.
- **Links mortos (`href="#"`)**: nenhuma ocorrência em todo `src/`.
- **Botões só-ícone sem nome acessível**: busquei todo `size="icon"` sem `aria-label`/`title`/`sr-only` próximo; os 2 candidatos encontrados por uma primeira varredura automática eram falsos positivos — abri os dois e ambos já têm `aria-label` correto (só caiu fora da janela de linhas do grep automático).
- **Estado vazio do ciclo na Central** (`IntelligentCycleWidget`, caso "nenhum ciclo ativo"): já existe um estado vazio claro, com texto explicativo e botão "Criar ciclo" — não é uma tela em branco nem confusa.
- **Painel de homologação** (`/dashboard/homologation`): confirmado que continua restrito a administradores (404 para os demais), como a Fase G.1 deixou.
- **`npm audit --omit=dev`**: **0 vulnerabilidades** nas dependências de produção.

## 2. `npm audit` (dependências de desenvolvimento)

`npm audit --omit=dev` → **0 vulnerabilidades** (nada que vá para produção).

`npm audit` (incluindo dev) → **7 vulnerabilidades (4 high, 3 moderate)**, todas em duas cadeias de dependência de ferramentas de desenvolvimento:

| Pacote raiz vulnerável | Usado por | Risco real | Correção disponível |
|---|---|---|---|
| `braces` (via `micromatch` → `fast-glob`) | `@next/eslint-plugin-next` (lint) | Nenhum em produção — só roda durante `npm run lint`/build local | `npm audit fix --force` instalaria `@next/eslint-plugin-next@14.2.35` (mudança de major/breaking) |
| `uuid` (via `xcode`) | `@capacitor/cli` (build do app Android/iOS) | Nenhum em produção — só roda ao gerar o app nativo localmente | `npm audit fix --force` instalaria `@capacitor/cli@8.4.3` (mudança de major/breaking) |

**Não executei `npm audit fix --force`** (proibido pela diretiva). Nenhuma das duas cadeias afeta o site em produção — são ferramentas de build/lint que rodam só na sua máquina. Recomendo avaliar a atualização dessas duas devDependencies quando for conveniente, testando o lint e o build do Capacitor depois, já que são mudanças de major version.

## 3. Arquivos modificados nesta sessão

Só os dois documentos abaixo (ambos novos, nenhum arquivo de código alterado):

- `docs/ai-mentor-readiness.md` (novo) — Fase 13 da diretiva.
- `docs/g2-8-autonomous-audit-report.md` (este arquivo, novo).

Nenhum arquivo de `src/`, migration, configuração ou dependência foi alterado nesta sessão.

## 4. Testes adicionados / executados

Nenhum teste novo foi necessário — nenhuma mudança de comportamento foi feita.

Suíte completa executada ao final: **1615/1615 passando** (mesmo total de antes da sessão — confirma que nada quebrou e nada foi removido).

## 5. Melhorias de UX / performance / acessibilidade

Nenhuma implementada nesta sessão — os pontos verificados nessas três frentes (itens 1.4) já estavam corretos, e a diretiva pede para não alterar sem evidência real de problema.

## 6. Documentação criada

- `docs/ai-mentor-readiness.md` — mapeia dados existentes, dados faltantes, métricas já calculáveis sem IA generativa, onde um LLM agregaria valor, e o que deve permanecer determinístico. Responde às 7 perguntas pedidas pela Fase 13.

## 7. Problemas encontrados mas NÃO corrigidos (e por quê)

| Item | Por que não corrigi |
|---|---|
| Ruído de CRLF no git (1.1) | Já avaliado duas vezes antes (Fases E/G) e decidido não mexer; causa é do ambiente de sincronização, não do código |
| `study-groups` sem UI (1.2) | Trabalho planejado para J.2, não é bug; implementar UI está fora do escopo "não inventar funcionalidade" desta diretiva |
| `TODO(BACKLOG)` em adaptive-learning (1.3) | O próprio autor já marcou como não urgente; não há evidência de necessidade agora |
| Vulnerabilidades de dev-dependencies (seção 2) | Correção exige mudança de major version (`--force`, proibido); zero risco em produção |

## 8. Riscos restantes

- O ruído de CRLF pode, com o tempo, mascarar uma mudança real de conteúdo dentro de um arquivo também afetado por ele (fica mais difícil revisar um `git diff` de um arquivo que já está "sujo" por quebra de linha). Recomendo considerar `.gitattributes` em algum momento, fora deste sprint.
- `study_groups`/`study_group_members` (migration da J.1) continua não aplicada ao banco de produção — não é um risco ativo (não está em uso), mas é um lembrete de que a J.2 depende dessa aplicação manual antes de poder ser construída.

## 9. Sugestões para G2.9/G2.10

Dado que a varredura ampla (Fases 1, 2, 6, 11, 15 da diretiva G2.8) não encontrou pendências novas de peso — o código já passou por auditorias recentes e específicas nessas frentes — sugiro que os próximos sprints autônomos sejam **verticais** em vez de **horizontais**, focando em uma única área por vez com mais profundidade do que uma varredura ampla permite:

1. **G2.9 — Completar J.2** (interface de "Grupos de Estudos"): aplicar a migration numa branch de teste do Supabase, validar os 3 cenários de concorrência que a J.1 deixou pendentes, e só então construir a aba "Minhas turmas" em `/ranking`.
2. **G2.10 — Dados no nível de questão**: `question_attempts`/`review_items` estão vazios em produção (achado da Fase H, confirmado ainda válido) — investigar por que essas tabelas não estão sendo populadas pelo fluxo de uso real é provavelmente mais valioso do que qualquer nova varredura de código morto.

## 10. Comandos executados (resultado final)

```
npm test        → 1615 testes, 1615 passando, 0 falhas
npx tsc --noEmit → 0 erros
npm run build    → sucesso (exit 0)
npm audit --omit=dev → 0 vulnerabilidades
npm audit        → 7 vulnerabilidades (4 high, 3 moderate), só em devDependencies (ESLint/Capacitor CLI), sem impacto em produção
```

`git status`/`git diff --stat`: ver seção 1.1 — o repositório está semanticamente limpo (`git diff --stat --ignore-cr-at-eol` = 0 arquivos); o `git status` padrão mostra ruído de CRLF pré-existente, não trabalho desta sessão.

Nenhum commit, push ou pull foi feito.
