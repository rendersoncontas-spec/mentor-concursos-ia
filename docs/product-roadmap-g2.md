# G2 — Roadmap do NomeIA

Fase de especificação (G2.0). Nada aqui está decidido nem implementado.
Regra de implementação futura: decisão explícita + comportamento + contrato
+ source of truth + critérios de aceite.

## Decisões abertas

### Planejamento — ritmo (min/max/style)

Contrato atual (pinado em `completeness-g1-17.test.ts`): planner consome
{horas, pesos}; dias/escala/âncora vivem em `profiles` (disponibilidade);
min/max/style são memória-only por decisão P1.5 test-guardada.
Fatiamento atual: blocos 30–60min (`study-plan.algorithm.ts:31-32`),
reviews 20min (`:33`), resto <30min incorporado, `diffMins` com piso 30;
ciclo usa regra própria (90/90). Leitores a jusante consomem
`duration_minutes` genericamente (ciclo, daily, runner, weekly).

#### Opção A — ritmo molda a geração dos blocos
- Usuário: presets/durações da etapa 4 passam a limitar o tamanho dos
  blocos gerados (ex.: blocos de 45–90min).
- UI: nenhuma mudança (controles já existem); manter nota honesta até vigorar.
- Planner: parametrizar `MIN/MAX_BLOCK_MINUTES` (e decidir `REVIEW_BLOCK_MINUTES=20`
  vs mínimo do usuário), refazer fold de resto e piso de `diffMins`,
  `recommendedSessions = ceil(duration/60)`; escopo semanal e/ou ciclo (dois fatiadores).
- Payload: estender `GeneratePlanConfig` + `ComputeStudyPlanDraftOptions` +
  `AlgorithmInput`; `buildPlanningPayload` passa a incluir ritmo.
- Banco: nenhuma migration estrita (durações fluem em `items[].duration_minutes`);
  persistir a preferência exige colunas novas + extensão da RPC + CHECKs.
- RPC: inalterada para só-durações; com preferência persistida, estender payload.
- Calendário/ciclo/replan/offline: valores fluem genericamente; replan e
  reconcile refatiam sem noção de min/max (ritmo decai) salvo se também
  parametrizados; stats (`study_history`) e offline (tempo real) inalterados.
- Testes: matriz min/max × resto × reviews; invariantes de soma semanal;
  replan preservando limites; contrato payload→itens.
- Riscos: combos inviáveis (min > cota diária), reviews violando mínimo,
  deriva semântica de `recommendedSessions`, divergência semanal×ciclo.
- Complexidade: ALTA (algoritmo + replan + decisão de persistência).

#### Opção B — ritmo como preferência futura
- Usuário: etapa 4 vira preferência declarada (ex.: default do timer),
  sem prometer moldar blocos; copy já honesta (G1.16).
- UI/RPC/banco/planner: inalterados; consumo futuro pelo timer/replan.
- Testes: persistência/leitura da preferência (quando definida).
- Riscos: BAIXO hoje; expectativa frustrada se nunca consumida.
- Complexidade: BAIXA (guardar + ler depois).

#### Opção C — ritmo sai do wizard
- Usuário: etapa 4 some ou vira etapa informativa; wizard com 3 etapas.
- UI: remover controles + chaves LS + nota G1.16; atualizar testes P1.5/wiring.
- Planner/payload/banco/RPC: inalterados (já ignoram).
- Testes: remover/atualizar guards de não-persistência.
- Riscos: remover capacidade que usuários possam usar como referência.
- Complexidade: BAIXA.

### Reviews — filtro por período

Estado: `getReviewsOverview` sem parâmetro de janela; ordenação no servidor
(atrasadas→hoje→novas; upcoming por `next_review_at`); caps 50/20/20;
sem URL params, sem estado de filtro; empty de falha vs vazio existem,
filtrado-vazio não.
- Filtro client-side (Hoje/Atrasadas/Próximos 7d/Todas): viável com arrays
  já carregados (`due`+`upcoming`, `dueAt`, `reps`, `reviewBucketOf`,
  `orderReviewQueue`); correto só dentro dos caps (contagens globais vs
  listas truncadas); sem backend, sem paginação nova; precisa estado local
  (+ URL opcional) e empty "nenhum neste período".
- Filtro server-side (além dos caps): nova query com predicado de data +
  extensão de `countBuckets`, parâmetro em service→action→page.
- FSRS/due-dates: intocados em ambas.
- Complexidade: BAIXA (client, dentro dos caps) / MÉDIA (server, além dos caps).

### Som

- `somTimer`: salvo em `preferences.timerSound`, nenhum leitor.
- Sistema real: `useFocusSound` (WebAudio sintetizado, 9 ids, prefópria em
  `mentor-focus-sound-pref`, player no `StudyProvider`, UI em
  `FocusSoundControl` no runner e no register-modal).
- Opção A (mapear opções atuais → ids): sem migration; preview no gesto de
  clique; testes do mapa (puro) + persistência.
- Opção B (opções = `FOCUS_SOUND_OPTIONS`): sem migration; exige migração
  dos valores legados na leitura; testes de round-trip + render.
- Opção C (remover select): UI-only; chave legada inerte; atualizar 2 testes.
- Mobile: AudioContext exige gesto (já é o caso nos chamadores); sem
  tratamento de silent-switch no código.
- Complexidade: BAIXA (qualquer opção).

## Funcionalidades futuras

Somente as acima, quando decididas. Nada além do descoberto em G1.14–G1.18.

## Dependências

- Opção A do ritmo depende de: decisão de persistência da preferência,
  regra reviews × mínimo, escopo semanal×ciclo.
- Filtro server-side depende de: decisão de necessidade além dos caps.
- Som (A/B) depende de: mapeamento ou troca de opções (usuário).

## Infraestrutura

G1.4.1 (COMMIT concorrente), double-finalize vencedor, skip concorrente,
URL real de produção, reconciliação filenames × registry (sem `db push`).

## Fora de escopo

Mudar Cycle Engine, FSRS, RLS, auth, offline, statistics engine, registry,
single-active, paginação, timezone, error architecture — salvo contrato
comprovado ligado a uma decisão acima.
