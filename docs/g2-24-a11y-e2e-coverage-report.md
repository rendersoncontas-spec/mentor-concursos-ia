# G2.24 — Conclusão da cobertura E2E e endurecimento de acessibilidade

Data: 2026-10-10/11. Escopo: somente local. Nenhum commit, push, deploy, workflow remoto, migration, APK ou LLM real. Nenhuma regra de ciclo, planejamento, revisão ou identidade canônica foi alterada.

## 1. Veredito

**VERDE** — todos os critérios abaixo foram atendidos *no que foi executado*. As validações que dependem do aparelho, do leitor de tela real e do GitHub (item 20) continuam manuais e estão listadas separadamente.

| critério | resultado |
|---|---|
| estado de erro do calendário do Histórico | feito e testado |
| exceção do axe para chips removida | feito (contraste calculado) |
| axe claro/escuro em Planejamento Dia e Semana | feito |
| harness + E2E + axe + 4 tamanhos: Estatísticas, Revisões, Edital | feito |
| segurança do harness verificada por teste | feito (14 testes) |
| procedimento de ativação do CI documentado | feito |
| `tsc`, `npm test`, `build`, `test:e2e` | todos executados (itens 15 e 16) |

## 2. Restrições respeitadas

Sem `git add/commit/push/pull`; sem upload ao GitHub; sem workflow remoto; sem deploy; sem migration (G2.12 e `20261010_ranking_top1_counts.sql` **não** aplicadas); sem APK, sem Capacitor; sem LLM real; sem exceções novas do axe; nenhum dado de teste em produção; nenhuma autenticação desativada; nenhum segredo em fixture. O `.github/workflows/ci.yml` **não** foi tocado pela sincronização (a ferramenta de sincronização não grava `.github`).

## 3. Calendário do Histórico — estado de erro

Antes: falha ao ler o mês aparecia como mês "sem estudos" (e o resumo dizia 0). Agora: aviso `role="alert"` ("Não foi possível carregar…") com o mês escolhido, botão "Tentar novamente", resumo "indisponível neste mês" (nunca 0), grade de dias escondida e navegação entre meses preservada. A lógica de carga mensal foi isolada em `src/features/history/lib/monthly-load.ts` (6 testes). Falhas repetidas não empilham avisos (1 toast, 1 alerta). Spec: `history-calendar.spec.ts` (estados, retry, troca de mês com erro, teclado, axe claro/escuro, 4 tamanhos).

## 4. Contraste dos chips de disciplina

`src/lib/a11y/contrast.ts` (puro, 15 testes): `parseHexColor`, `relativeLuminance`, `contrastRatio`, `compositeOver`, `readableTextOn` (escolhe branco ou grafite `#0f172a`, com fallback preto/branco) e `chipColors` (cor inválida → neutro `#64748b`). O chip do calendário de estudos usa `chipColors(disc.color || "#2563EB")`: a cor do usuário continua sendo o fundo, e o texto é o que atinge ≥ 4,5:1. A constante `USER_COLOR_CHIP` e o `AxeException` foram **removidos** de `tabs-keyboard.spec.ts`; a varredura roda sem nenhuma exceção.

## 5. Planejamento — Dia e Semana

Fronteira `PlanningActionsProvider` (`planning-actions.tsx`); padrão = Server Actions reais. Harness com `state=data|empty|error|retry`. Correções de produção: nomes acessíveis nos botões de adicionar/excluir da Semana; contraste (`emerald-700/800`, `rose-700`, sem `muted-foreground/40`, sem `opacity-80`); avisos de erro com `role="status"`/`amber-800`. Spec: `planning-views.spec.ts`.

## 6. Estatísticas

Fronteira `StatisticsActionsProvider`; fixtures em `src/lib/testing/statistics-fixtures.ts`; estados `data|empty|partial|error|retry`. Correções: `role=status/alert` nos painéis de carregamento/erro, rótulo "Ordenar disciplinas", contêineres rolláveis com `tabIndex=0` + `role=region` + `aria-label` (axe `scrollable-region-focusable` no mobile), cores de texto com contraste. Spec: `statistics.spec.ts`.

## 7. Revisões

Fronteira `ReviewActionsProvider`; fixtures com `nowIso` fixo vindo do servidor (evita divergência de hidratação); estados `data|empty|error|retry|catalog-error|session-error`. Correções: `<div>` no lugar de `<p>` com filhos de bloco (erro de hidratação), devolução do foco depois da sessão de revisão, contraste da prévia de nota. Spec: `reviews.spec.ts`.

## 8. Edital

Fronteira `EditalActionsProvider`; estados `data|progress-error|save-error`. Correções: nomes acessíveis, contraste, e **falha ao ler o progresso agora mostra aviso** (antes mostrava "0 de N" como se fosse verdade). Spec: `edital.spec.ts`.

## 9. Arquitetura do harness

Contexto com valor padrão = Server Actions reais; só o harness injeta o provedor sintético. `use…ActionsRef()` devolve um `useRef` do valor da montagem: as dependências dos efeitos e os nomes das chamadas (`xRef.current.someAction(...)`) não mudam, então os testes de ligação existentes continuam valendo. As rotas `page.e2e.tsx` só existem com `NOMEIA_E2E_HARNESS=1`.

## 10. Segurança do harness

`src/application/e2e-hardening-g2-24.test.ts` (14 testes) verifica: dependência da flag (extensão `e2e.tsx` em `next.config.ts`; recusada com `VERCEL_ENV=production`); ausência das rotas no build normal; nenhum arquivo de harness ou fixture contém `createClient|supabase|.from(|service_role|SERVICE_ROLE|process.env|cookies(|dangerouslySetInnerHTML|fetch(` nem URL `http(s)`; nenhum código de produção importa `@/lib/testing`; nenhum harness lê sessão nem cookies; fixtures sem segredo; sem chamada ao Mentor LLM; o bloqueio de rede externa do Playwright continua (toda requisição fora de `127.0.0.1` é abortada). Nenhum endpoint de produção foi criado para teste e nenhum campo/regra de cálculo foi inventado ou alterado. O build normal foi inspecionado: `.next/server/app` não contém `e2e-harness`.

## 11. Mudanças de produção (resumo)

Somente acessibilidade, estado de erro visível e a fronteira de ações (comportamento idêntico por padrão). Arquivos: `history-view.tsx`, `study-calendar.tsx`, `monthly-load.ts`; `daily-planning-view.tsx`, `weekly-planning-view.tsx`, `study-calendar-view.tsx`, `planning-view.tsx`, `planning-goals-progress-card.tsx`, `planning-actions.tsx`; `statistics-center-view.tsx`, `statistics-charts.tsx`, `statistics-actions.tsx`; `reviews-view.tsx`, `review-session-modal.tsx`, `add-to-review-modal.tsx`, `review-actions.tsx`; `edital-accordion.tsx`, `edital-actions.tsx`; `src/lib/a11y/contrast.ts`.

## 12. Testes ESCRITOS nesta fase

| tipo | arquivo | casos |
|---|---|---|
| unitário | `src/lib/a11y/contrast.test.ts` | 15 |
| unitário | `src/features/history/lib/monthly-load.test.ts` | 6 |
| unitário (segurança/estrutura) | `src/application/e2e-hardening-g2-24.test.ts` | 14 |
| E2E | `e2e/specs/history-calendar.spec.ts` | 12 definições |
| E2E | `e2e/specs/planning-views.spec.ts` | 13 definições |
| E2E | `e2e/specs/statistics.spec.ts` | 17 definições |
| E2E | `e2e/specs/reviews.spec.ts` | 23 definições |
| E2E | `e2e/specs/edital.spec.ts` | 17 definições |

("definições" inclui laços por tema e por tamanho; o número executado está no item 16: 172 casos novos de E2E passaram a mais que na G2.23, mais 24 pulados por desenho.) O script `npm test` ganhou os três arquivos unitários novos.

## 13. Testes EXECUTADOS

Ver itens 15 e 16 (números lidos das saídas reais, não estimados).

## 14. Testes NÃO executados / bloqueados

- **Android (3 testes + 1 grupo):** falham na nuvem por não existir a pasta `android/` (projeto Capacitor fica só na máquina do usuário). Esperado; **no computador do usuário passam** (item 15). A fase não mexeu em Capacitor.
- **CI no GitHub:** não executado (proibido executar workflow remoto). O `.github/workflows/ci.yml` não pôde ser gravado pela ferramenta de sincronização.
- **Projeto `authenticated/`:** não roda sem Supabase local e sem `E2E_AUTH`; fora de escopo.
- **Safari/Firefox, leitor de tela real, aparelho físico:** não automatizados (item 20).
- **Testes que se pulam por desenho** (matriz de tamanhos no projeto mobile): 55, todos por desenho (item 16).

## 15. Verificações gerais

| verificação | resultado |
|---|---|
| `npx tsc --noEmit` | limpo |
| `npm test` (nuvem) | 2609 testes, 2606 passam, 3 falham (Android, item 14) |
| `npm test` (computador do usuário, em 3 partes de ~1 min) | **2609/2609** passam (944 + 687 + 978), inclusive os testes de Android; linha de base G2.23: 2574, mais 35 novos |
| `npm run build` (variáveis públicas fictícias) | compilado, 32 páginas; sem `e2e-harness` no build |
| ESLint (`src`, `e2e`) vs. início da fase | sem erros novos; sem avisos novos (avisos de dependência dos hooks `*Ref` corrigidos; 1 erro `react-hooks/immutability` do Edital a menos) |

## 16. E2E (Playwright, Chromium, projetos desktop e mobile)

Execução final **limpa**, sem retentativas, os dois projetos juntos (`npm run test:e2e`, 21,3 min): **479 passaram, 0 falharam, 0 instáveis, 55 pulados por desenho** (testes de matriz de tamanho de tela rodam só no projeto desktop; o mobile os pula). Linha de base da G2.23: 307 passaram / 31 pulados / 0 falhas.

| spec | desktop | mobile |
|---|---|---|
| `history-calendar` (novo) | 14 | 10 (+4 pulados) |
| `planning-views` (novo) | 19 | 11 (+8 pulados) |
| `statistics` (novo) | 22 | 18 (+4 pulados) |
| `reviews` (novo) | 23 | 19 (+4 pulados) |
| `edital` (novo) | 20 | 16 (+4 pulados) |
| `tabs-keyboard` (G2.23, sem exceção do axe) | 41 | 33 (+8 pulados) |
| demais specs (G2.20–G2.23) | sem alteração de resultado | sem alteração de resultado |

**O que houve no caminho (registro honesto).** Uma primeira execução completa terminou com 475 passaram / 4 falharam. As quatro falhas eram de **teste/harness**, não de produção, e foram corrigidas e reexecutadas:

1. *Estatísticas (2 falhas, desktop):* divergência de hidratação do "atualizado às HH:MM" quando o minuto virava entre o HTML do servidor e o navegador — o harness gerava `loadedAt` no cliente. Corrigido: a página do harness fixa `nowIso` no servidor e o repassa (a produção já recebe `loadedAt` do servidor).
2. *Edital (1 falha, mobile):* `clickUntil` repetia o clique de uma ação **não idempotente** (marcar tópico) sob carga. Corrigido com `e2e/support/hydration.ts` (`whenHydrated`: espera o React assumir o nó antes do clique); aplicado também em Revisões.
3. *Histórico, axe no mobile (1 falha, ambos os temas):* com toque emulado o sonner pausa o aviso enquanto o "ponteiro" está sobre a lista (o `mouseleave` só vem ao tocar fora). O teste agora solta o ponteiro e espera o aviso sumir. **Não foi aberta exceção no axe.**

Depois dessas correções: as quatro specs afetadas + Revisões foram reexecutadas (140 passaram; as 2 falhas restantes eram a do item 3, depois corrigida: 24 passaram, 4 pulados) e, por fim, a suíte inteira foi executada de novo (resultado acima).

## 17. Regressão das telas

Verificação por execução (E2E) e por testes unitários de ligação, sem alterar nenhuma regra:

| tela | como foi verificada | resultado |
|---|---|---|
| Identidade canônica | `npm test` (testes G2.12–G2.14, estatísticas por identidade) | passam |
| Dashboard | `dashboard.spec.ts`, `dashboard-mobile-layout.spec.ts`, axe claro/escuro | passam |
| Central de estudos | `study-register.spec.ts`, axe | passam |
| Histórico (lista e calendário) | `history-calendar.spec.ts`, `tabs-keyboard.spec.ts` | passam |
| Planejamento | `planning-views.spec.ts`, `tabs-keyboard.spec.ts`; testes de ligação do módulo | passam |
| Estatísticas | `statistics.spec.ts`; testes de ligação (180 do módulo) | passam |
| Simulados | `simulados.spec.ts`, `simulado-result.spec.ts` | passam |
| Revisões | `reviews.spec.ts`; testes de ligação (129 do módulo) | passam |
| Edital | `edital.spec.ts`; testes de ligação (131 do módulo) | passam |
| Mentor | `mentor.spec.ts`, axe | passam |
| PWA | `pwa-install.spec.ts` (eventos simulados) | passam |

Os testes de ligação existentes (regex sobre os nomes das ações, por exemplo `planningRef.current.someAction(`) continuam válidos porque a fronteira preserva o nome da ação. A instalação real do PWA e o uso com dados reais continuam manuais (item 20).

## 18. Achados — NÃO alterados (fora do escopo)

1. **Semana (mini-calendário):** datas fixas ("hardcoded") no mini-calendário; é conteúdo de produto, não acessibilidade.
2. **Estatísticas, estado parcial:** o subtítulo estático "Sem plano ativo — crie um plano no concurso para acompanhar aqui" aparece ao lado de "Plano indisponível". Texto ligeiramente contraditório quando o plano existe mas a leitura falhou. Não foi alterado para não mexer em regra de planejamento.
3. **Edital, exclusão:** usa `confirm()` nativo do navegador (não é um diálogo da interface, não é estilizável nem testável da mesma forma). Candidato a modal próprio.
4. **Edital, Central de estudos embutida e seletor de alvo:** não exercitados no harness do Edital (a Central tem harness e specs próprios).
5. **Autocomplete de tópicos (`TopicAutocomplete`):** ainda chama suas ações reais; sem sessão devolve erro tratado. Poderia ganhar fronteira própria numa fase futura.

## 19. CI — como ativar

O workflow está pronto em `docs/ci/github-actions-ci.yml` (idêntico, por teste, ao que deve ficar em `.github/workflows/ci.yml`). Passos manuais, uma vez, no computador do usuário:

```powershell
New-Item -ItemType Directory -Force .github\workflows | Out-Null
Copy-Item docs\ci\github-actions-ci.yml .github\workflows\ci.yml
git add .github/workflows/ci.yml
```

Depois: commit e push como de costume; a aba *Actions* mostra `checks` (npm ci → test → tsc → build → ausência de `/e2e-harness`) e `e2e` (Playwright). Só `permissions: contents: read`, sem segredos e sem deploy. O CI testa o que estiver **commitado**: todos os arquivos novos desta fase (harnesses, fixtures, specs, docs) precisam entrar no commit. O lint não está no workflow (erros antigos).

## 20. Validações manuais restantes

1. Leitor de tela real (TalkBack/VoiceOver/NVDA) em Estatísticas, Revisões, Edital, Planejamento Dia/Semana e no calendário do Histórico (o erro do calendário deve ser anunciado).
2. Aparelho físico: toque e rolagem das regiões rolláveis de Estatísticas; teclado virtual no registro de nota das Revisões.
3. Conferir logado, com dados reais, o contraste dos chips das **próprias** disciplinas (cores livres do usuário) nos dois temas.
4. Simular uma falha de rede real no calendário do Histórico (modo avião) e confirmar o aviso e a nova tentativa.
5. Roteiro de PWA de 12 passos (`docs/pwa-install-experience.md`).
6. Ativar o CI e observar a primeira execução no GitHub.
7. Rodar `npm test` completo na máquina (inclui os testes de Android).

## 21. Arquivos desta fase

Novos: `src/lib/a11y/contrast.ts` e `.test.ts`; `src/features/history/lib/monthly-load.ts` e `.test.ts`; `src/features/{planejamento/planning-actions,statistics/statistics-actions,reviews/review-actions,edital/edital-actions}.tsx`; `src/lib/testing/{statistics,reviews,edital}-fixtures.ts`; `src/app/e2e-harness/{statistics,reviews,edital}/*` e `planning/planning-harness.tsx`; `src/application/e2e-hardening-g2-24.test.ts`; `e2e/specs/{history-calendar,planning-views,statistics,reviews,edital}.spec.ts`; este relatório.

Alterados: os componentes de produção do item 11; `src/lib/testing/history-planning-fixtures.ts`; `src/app/e2e-harness/{README.md,history/page.e2e.tsx,planning/page.e2e.tsx}`; `e2e/specs/tabs-keyboard.spec.ts`; `package.json` (script `test`); `docs/e2e-browser-testing.md`.
