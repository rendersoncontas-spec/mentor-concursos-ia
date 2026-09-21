# Fase 19 — Correção do "Adicionar Estudo" + Limpeza dos Dados de QA

**Data:** 2026-09-21 · **Branch:** local, sem commits (regra permanente respeitada) · **Base:** `eeca9b4` + diffs acumulados das Fases 13–18 (ainda não commitados)

---

## 1. Causa raiz do bug "Adicionar Estudo" (Dashboard)

Investigação feita **lendo o código real antes de qualquer suposição**, exatamente como pedido no brief.

Em `src/features/dashboard/components/dashboard-layout.tsx` o botão "Adicionar Estudo" tinha o seguinte `onClick`:

```tsx
onClick={() => {
  setIsRegisterModalOpen(true)
  window.dispatchEvent(new CustomEvent("study-center-opened"))
}}
```

Dois problemas, confirmados por leitura direta (`grep`/`read`), não por suposição:

1. **Estado órfão.** `isRegisterModalOpen` era declarado (`useState(false)`) e atualizado pelo botão, mas **nunca era lido em nenhum outro lugar do arquivo** — `StudyRegisterModal` não estava importado nem renderizado em `dashboard-layout.tsx`. Ou seja, o clique setava um estado que nenhum componente escutava. Resultado: nada abria.

2. **Efeito colateral que também travava o balão flutuante.** O `window.dispatchEvent(new CustomEvent("study-center-opened"))` é escutado apenas por `study-provider.tsx`:
   ```tsx
   const handleStudyCenterOpened = () => setIsCentralOpen(true)
   window.addEventListener("study-center-opened", handleStudyCenterOpened)
   ```
   Isso só seta `isCentralOpen = true` no contexto global — um valor que **nada usa para renderizar um modal de fato**, apenas como guarda contra reabertura dupla. Como `isCentralOpen` só volta a `false` via o evento `"close-study-session-modal"` (disparado de dentro do próprio `StudyRegisterModal` ao fechar/salvar), e nenhum modal real chegava a abrir a partir do botão do Dashboard, `isCentralOpen` ficava **travado em `true` pelo resto da sessão**. Isso explica por que, no smoke test manual da Fase 18/19, o balão flutuante "Registrar estudo" (`FloatingActionButton`) também parou de responder depois — seu `handleOpenCentral` tem `if (isCentralOpen) return`.

Mapeamento dos dois padrões já existentes no código para abrir o `StudyRegisterModal` (o único modal de registro de estudo do projeto — confirmado por busca, não existe um segundo):

- **Padrão A** ("a página é dona do seu próprio modal"): `history-view.tsx`, `discipline-detail-view.tsx`, `edital-accordion.tsx` e `planejamento/planning-view.tsx` — todos declaram estado local e renderizam `<StudyRegisterModal open={...} onOpenChange={...} />` diretamente.
- **Padrão B** ("delega para o FloatingActionButton global"): `study-dock.tsx`, `study-header-control.tsx`, `study-quick-access.tsx` e `dashboard/quick-start-bar.tsx` — todos apenas disparam `"open-study-session-modal"`, que só o `FloatingActionButton` escuta.

O Dashboard usava uma **terceira variante quebrada**, sem nenhum modal de fato ligado ao seu próprio estado.

---

## 2. Correção aplicada

Reaproveitado exatamente o **Padrão A**, o mesmo mecanismo já usado por Histórico (a referência citada no brief) — **nenhum modal novo foi criado**.

Diff real (`git diff -w`, ignorando fim de linha) de `src/features/dashboard/components/dashboard-layout.tsx`:

```diff
@@ -15,6 +15,7 @@ import { getDailyMessage } from "@/features/dashboard/components/daily-message-b
 import { TargetSelectorDropdown } from "@/features/dashboard/components/target-selector-dropdown"
 import { UserExamModal } from "@/features/dashboard/components/user-exam-modal"
 import { WeeklyGoalsModal } from "@/features/dashboard/components/weekly-goals-modal"
+import { StudyRegisterModal } from "@/features/study-session/components/study-register-modal"
 
 import { DashboardCustomizationModal } from "./dashboard-customization-modal"
 import { DashboardDndContext } from "./dashboard-dnd-context"
@@ -171,10 +172,7 @@ export function DashboardLayout({ snapshot, initialLayout, serverDate }: Dashboa
               </div>
               <div className="flex items-center gap-2 sm:gap-2.5 w-full md:w-auto shrink-0 pt-1 md:pt-0">
                 <Button
-                  onClick={() => {
-                    setIsRegisterModalOpen(true)
-                    window.dispatchEvent(new CustomEvent("study-center-opened"))
-                  }}
+                  onClick={() => setIsRegisterModalOpen(true)}
                   className="flex-1 md:flex-initial bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs sm:text-sm px-3.5 sm:px-4 shadow-sm hover:shadow-md active:scale-[0.98] transition-all cursor-pointer rounded-xl h-9 sm:h-10 shrink-0 whitespace-nowrap min-w-0"
                 >
                   <Plus className="w-4 h-4 mr-1.5 shrink-0 stroke-[2.5]" />
@@ -258,6 +256,7 @@ export function DashboardLayout({ snapshot, initialLayout, serverDate }: Dashboa
         onOpenChange={setIsGoalsModalOpen}
         profile={snapshot?.user}
       />
+      <StudyRegisterModal open={isRegisterModalOpen} onOpenChange={setIsRegisterModalOpen} />
     </div>
   )
 }
```

Três mudanças, e só isso:
1. Importa `StudyRegisterModal` (o mesmo componente do Histórico).
2. O `onClick` do botão passa a fazer só `setIsRegisterModalOpen(true)` — removido o `dispatchEvent("study-center-opened")` órfão que travava o `isCentralOpen`.
3. `<StudyRegisterModal open={isRegisterModalOpen} onOpenChange={setIsRegisterModalOpen} />` renderizado no final do JSX, no mesmo padrão dos 4 precedentes.

**Nenhum outro arquivo foi alterado para esta correção.** Nenhuma lógica de `src/application/study-cycle/**` ou `src/domain/study-cycle/**` foi tocada.

---

## 3. Teste real executado no navegador (não simulado)

Sessão do navegador do usuário (mesma aba usada nas Fases 17/18), servidor `npm run dev` já rodando, dashboard já autenticado como `renderson`.

1. **Antes da correção não foi testado de novo** (já estava comprovadamente quebrado desde a Fase 18) — o teste começou já com a correção aplicada.
2. Naveguei para `/dashboard`. Cliquei em "Adicionar Estudo" → **o modal "Centro Inteligente de Estudos" abriu** (confirmado por screenshot).
3. Cliquei na aba "Manual" → formulário de lançamento manual apareceu corretamente (confirmado por screenshot).
4. Fechei sem salvar e testei também o balão flutuante "Registrar estudo" (`FloatingActionButton`) — **também abriu o mesmo modal**, confirmando que o travamento de `isCentralOpen` foi corrigido de fato (e não apenas mascarado).
5. Prossegui para a limpeza dos dados de QA (seção 4) e, em seguida, recriei os 5 lançamentos controlados (seção 5) **usando o próprio botão "Adicionar Estudo" do Dashboard, já corrigido**, validando o fluxo completo pedido no brief: Dashboard → Adicionar Estudo → Manual → salvar → toast "Estudo salvo com sucesso!" → Histórico atualizado → Ciclo atualizado → Foco de Hoje atualizado (detalhes e evidências na seção 6).

---

## 4. Dados de QA identificados e removidos

Consulta direta ao banco real de produção (`snlwfnwjrcqtlilhwgfm`), tabela `study_history`, por `created_at >= 2026-09-21`, cruzando com `auth.users` para confirmar o dono de cada linha.

O brief mencionava "os 8 registros" em um trecho e listava 7 itens em outro. **Reconciliação feita consultando o banco, não assumida**: existiam de fato **8 registros de QA**, todos pertencentes à conta de teste real (`rendersonluan@gmail.com`, `user_id cd6d166e-8cf6-4fe4-b88d-1a32556ae624`) — a lista do brief (3 da Fase 17 + 5 da Fase 18) soma 8, não 7; a leitura de "7" era uma contagem equivocada do próprio resumo anterior, corrigida agora com a consulta real:

| # | id | Disciplina | Duração | Nota | Origem |
|---|----|-----------|---------|------|--------|
| 1 | `ed8f8642-17af-4c09-8407-05df15848e38` | Estatística | 2min | `[Fase 17 QA - smoke test automatizado]` | Fase 17 |
| 2 | `06ee803d-c6c9-47b3-a7c4-e408c5cf473b` | Estatística | 15min | `[Fase 17 QA - lancamento manual teste]` | Fase 17 |
| 3 | `b0034fef-28a6-4564-a4e0-da73d16e344f` | Direito Tributário | 20min | *(sem nota, mas horário 15:30 BRT e criação logo após os 2 acima confirmam origem)* | Fase 17 |
| 4 | `64fa31b2-1b6b-4086-bfe9-a3cd52be7533` | Raciocínio Lógico e Matemático | 30min | `[Fase 18 QA - RLM 30min #1]` | Fase 18 |
| 5 | `62907583-a770-4493-8dd8-d5533334476d` | Raciocínio Lógico e Matemático | 20min | `[Fase 18 QA - RLM 20min #2]` | Fase 18 |
| 6 | `45e3c9f6-3cb4-46b8-ade6-be6558991cec` | Língua Portuguesa | 40min | `[Fase 18 QA - Portugues 40min #3]` | Fase 18 |
| 7 | `355d1204-8e2d-44e9-a348-713281bc6d49` | Estatística | 50min | `[Fase 18 QA - Estatistica 50min #4]` | Fase 18 |
| 8 | `74a43c40-1e4a-4bfd-8604-46fdd5d809f4` | Raciocínio Lógico e Matemático | 15min | `[Fase 18 QA - RLM 15min #5]` | Fase 18 |

**Confirmação antes de apagar:** consultei **todos** os registros de `renderson` (`cd6d166e...`) com `created_at >= 2026-09-21 00:00 UTC` — exatamente esses 8 apareceram, nenhum outro. Também conferi que existia uma 9ª linha na mesma janela de tempo (`2a211256-67ff-414d-a4cd-05aa170adc47`, Direito Administrativo, 142min, sem nota QA) — mas pertence a **outro usuário real** (`lays.bernardo045@gmail.com`), de 2026-09-20, sem qualquer marca de teste. **Essa linha não foi tocada.**

**Remoção:** `DELETE FROM study_history WHERE id IN (<os 8 ids acima>) AND user_id = 'cd6d166e-...'` — os 8 ids retornados pelo `RETURNING id` confirmam a remoção exata, nem um a mais nem a menos.

**Efeito em cascata (schema pré-existente, não alterado por mim):** `study_cycle_sessions.study_history_id` tem `ON DELETE CASCADE` para `study_history.id`. As 8 sessões de ciclo geradas por esses lançamentos de QA foram removidas automaticamente junto — confirmado por consulta pós-delete (`0` sessões órfãs). Nenhuma linha em `study_materials` referenciava esses ids.

**Resultado:** `study_history` de `renderson` foi de **2789 → 2781** linhas reais (exatamente −8).

---

## 5. Confirmação: nenhum dado real de usuário foi removido

- O único filtro usado no `DELETE` foi por **8 IDs exatos**, nunca por data/usuário em massa.
- O registro do outro usuário real (`lays.bernardo045@gmail.com`, Direito Administrativo 142min) permanece intacto — verificado por `SELECT` antes e depois.
- As **2781 linhas restantes** de `renderson` (histórico real de estudo, incluindo importações e lançamentos manuais anteriores a esta fase) não foram tocadas.
- Nenhum `UPDATE` foi feito em `study_cycles` — o realinhamento do cursor do ciclo (seção 6) veio inteiramente do motor de reconciliação já existente e congelado (`rebuildActiveCycleProgress`), nunca de SQL manual.

---

## 6. Ciclo: por que ele se realinhou sozinho (sem eu tocar em código de ciclo)

Antes de apagar, o ciclo ativo (`Receita Federal`) estava em: `current_round=3`, `current_item_index=7` (Etapa 8/9, Tecnologia da Informação), `current_item_progress_min=49` — estado inflado pelas 8 sessões de QA.

Encontrei (só leitura, nenhuma alteração) que `registerStudyToCycle()` — chamado a cada lançamento manual ou de cronômetro real — simplesmente delega para `rebuildActiveCycleProgress()`, que **recalcula do zero** `current_round`/`total_rounds_done`/`current_item_index`/`current_item_progress_seconds` a partir das sessões de ciclo realmente existentes no banco (via `reconcileCycleFromStudies`), e persiste o resultado. Ou seja: **o próprio sistema já se autocorrige a cada estudo real salvo** — não era preciso (nem seria seguro) eu escrever SQL manual para "consertar" os contadores do ciclo.

Confirmação real, sem nenhuma alteração de código:
- Logo após apagar os 8 registros de QA e salvar o 1º lançamento controlado (RLM 30min), o Dashboard passou de `Etapa 8/9 — Tecnologia da Informação — 49/60min — 82%` para `Etapa 7/9 — Estatística — 0/60min — 0%` — o cursor **voltou** para a posição real, sem a inflação da Fase 18.
- Depois dos 5 lançamentos controlados, o Ciclo mostrou `Etapa 7/9 — Estatística — 50/60min — 83%`, refletindo exatamente o lançamento real de Estatística 50min.

---

## 7. Recriação controlada (5 lançamentos, via o botão "Adicionar Estudo" já corrigido)

Todos criados pelo Dashboard → Adicionar Estudo → Manual, na ordem pedida:

| Disciplina | Duração | id | Horário salvo |
|---|---|---|---|
| Raciocínio Lógico e Matemático | 30min | `15d5defc-6cc2-4785-acf1-ea38f6b904d6` | 12:52 |
| Raciocínio Lógico e Matemático | 20min | `f919c04a-81f4-4fac-a6a0-227aa47a77df` | 12:54 |
| Língua Portuguesa | 40min | `c6d58db7-382f-4c47-8cbc-f5de3ea7909f` | 12:55 |
| Estatística | 50min | `90bb942c-23f2-4884-8ec4-d1e96605ad43` | 12:56 |
| Raciocínio Lógico e Matemático | 15min | `c1df7162-b072-4f58-8eb5-1e94dff88b93` | 12:57 |

Confirmado por consulta direta ao banco: **5 linhas distintas**, nenhum bloqueio, nenhuma sobrescrita (as 3 entradas de RLM no mesmo dia coexistem normalmente) — a regra de lançamentos manuais ilimitados da Fase 18 permanece intacta.

**Confirmações pós-lançamento, sem navegação manual:**
- **Histórico** (`/dashboard/history`): "21/09/2026 · 5 atividades · Total: 2h35m" com as 5 sessões listadas, na ordem correta, sem nenhum registro `[Fase 17/18 QA]` remanescente.
- **Dashboard → Tempo de Estudo**: HOJE `2h35m` / SEMANA `2h35m` (30+20+40+50+15 = 155min = 2h35m exatos).
- **Dashboard → Foco de Hoje (Ciclo)**: atualizou automaticamente após cada salvamento, sem navegação manual, sem polling, sem novo timer — usando o `STUDY_SESSION_SAVED_EVENT` já implementado na Fase 18 (`intelligent-cycle-widget.tsx`). Confirmado visualmente entre cada um dos 5 salvamentos.
- **SESSÕES** no Histórico: `2.786` = 2781 (real, pós-limpeza) + 5 (novos) — bate exatamente.

---

## 8. Teste de regressão criado

Como houve uma correção real no botão "Adicionar Estudo", foi criado (conforme exigido pelo brief) um novo teste:

`src/features/dashboard/components/dashboard-add-study-button.wiring.test.ts` — trava, lendo o código-fonte real de `dashboard-layout.tsx` (mesmo padrão dos demais `*.wiring.test.ts` do projeto, sem infraestrutura de renderização React), que:
1. `StudyRegisterModal` está importado (reaproveitando o modal do Histórico);
2. o botão chama apenas `setIsRegisterModalOpen(true)`, e o dispatch órfão `"study-center-opened"` foi removido do arquivo;
3. `<StudyRegisterModal open={isRegisterModalOpen} onOpenChange={setIsRegisterModalOpen} />` está de fato renderizado.

Registrado em `package.json` (script `test`), ao final da lista existente.

---

## 9. Resultado de `npx tsc --noEmit`

**0 erros.** Saída vazia, executado após a correção e após a criação do teste.

---

## 10. Resultado de `npm test`

Suíte completa executada em 7 lotes (por causa do limite de ~180s por chamada do shell remoto — dois arquivos são lentos por natureza, não travados: `get-disciplines.test.ts` e `get-study-discipline-suggestions.test.ts`, ~79–113s cada, confirmado pelo `duration_ms` real do próprio test runner). **60 arquivos de teste, todos executados, nenhum pulado:**

| Lote | Arquivos | Testes | Resultado |
|---|---|---|---|
| 1 | 10 | 91 | ✅ 91/91 |
| 2a | 9 | 156 | ✅ 156/156 |
| 2b (arquivo lento isolado) | 1 | 9 | ✅ 9/9 |
| 3 | 10 | 113 | ✅ 113/113 |
| 4 | 10 | 112 | ✅ 112/112 |
| 5 | 10 | 178 | ✅ 178/178 |
| 6 (inclui o novo teste) | 10 | 121 | ✅ 121/121 |

**Total: 780 testes, 780 aprovados, 0 falhas.**

---

## 11. Git status

Nenhum comando de escrita do git foi executado (sem `add`/`commit`/`push`/`pull`/`merge`/`reset`/`checkout`), conforme regra permanente. Tudo permanece como alterações locais não commitadas, em cima de `eeca9b4` + os diffs acumulados das Fases 13–18 (também não commitados, por essa mesma regra).

Arquivos efetivamente alterados por esta Fase 19 (confirmado por `git diff -w`, ignorando fim de linha):
- `src/features/dashboard/components/dashboard-layout.tsx` — a correção (seção 2).
- `package.json` — uma linha adicionada ao script `test`, registrando o novo arquivo de teste.
- `src/features/dashboard/components/dashboard-add-study-button.wiring.test.ts` (novo arquivo) — o teste de regressão (seção 8).

Nenhum arquivo de `src/application/study-cycle/**` ou `src/domain/study-cycle/**` foi alterado nesta fase (os que aparecem como modificados no `git status` geral são heranças não commitadas das Fases 13/14, anteriores a esta sessão — confirmado comparando datas/conteúdo, não tocados por mim aqui). A regra de lançamentos manuais ilimitados, a migration que removeu o índice único diário, a funcionalidade de importação e o índice de importação (`study_history_import_fingerprint_idx`) permanecem exatamente como a Fase 18 os deixou.

---

## Resumo final

| Item do brief | Status |
|---|---|
| Causa do bug "Adicionar Estudo" identificada por leitura real do código | ✅ Seção 1 |
| Correção reaproveitando o modal existente (sem modal paralelo) | ✅ Seção 2 |
| Teste real no navegador (Dashboard → Adicionar Estudo → Manual → salvar → Histórico/Ciclo/Foco de Hoje) | ✅ Seção 3 e 7 |
| Regra de lançamentos ilimitados, migration, importação e Ciclo preservados | ✅ Seção 11 |
| Registros de QA identificados e reconciliados com o banco real (8, não 7) | ✅ Seção 4 |
| Registros de QA removidos (só os 8 confirmados) | ✅ Seção 4 |
| Confirmação de que nenhum dado real foi removido | ✅ Seção 5 |
| Ciclo, Histórico, Estatísticas e Dashboard refletindo a limpeza | ✅ Seções 4, 6, 7 |
| 5 lançamentos controlados recriados, sem bloqueio/sobrescrita | ✅ Seção 7 |
| Foco de Hoje atualiza sozinho, sem polling/timer novo | ✅ Seção 7 |
| Teste de regressão criado (pois houve correção) | ✅ Seção 8 |
| `npx tsc --noEmit`: 0 erros | ✅ Seção 9 |
| `npm test`: 780/780 aprovados | ✅ Seção 10 |
| Nenhum comando git de escrita executado | ✅ Seção 11 |
| Diff real apresentado | ✅ Seções 2 e 11 |
| Nenhuma outra funcionalidade alterada | ✅ Confirmado — único arquivo de produção tocado foi `dashboard-layout.tsx`, com exatamente as 3 mudanças mínimas descritas |
