# NomeIA — Backlog de Produto (G1.18)

Origem: limitações e decisões descobertas nas auditorias G1.14–G1.17.
Regra: nada aqui é implementado sem contrato comprovado no próprio projeto.

## IMPLEMENTAR

Nenhum item pendente nesta fase (ver implementados em G2.1 abaixo).

## IMPLEMENTADO (G2.1–G2.2)

- Ritmo (Opção A): presets/personalizado moldam o fatiamento via
  `BlockRhythm` → algoritmo existente (sem planner-v2, sem migration, sem
  RPC nova). Reviews mantêm 20min; replan refatia genericamente.
- Filtro de período das reviews: client-side (Todas/Atrasadas/Hoje/
  Próximos 7 dias), sem backend novo, sem FSRS alterado.
- Som: `Silencioso` → off; `Melodia 1` → primeira ambiente se desligado
  (G2.1). `Sino` sem correspondente no código → removido da UI (G2.2);
  legado normaliza para "Melodia 1" na leitura, sem migration.

## DECISÃO DO USUÁRIO

### 1. Ritmo/min/max/style — RESOLVIDO (Opção A, G2.1)
- Estado: etapa 4 coleta duração mín/máx e estilo; o planner consome só
  {horas, pesos} (contrato pinado em `completeness-g1-17.test.ts`); P1.5
  proíbe persistir esses campos (teste-guarda existente).
- Pergunta: devem moldar os blocos gerados (opção A), virar preferência
  futura consumida pelo timer/replan (opção B), ou sair do wizard?
- Evidência contrária a A hoje: `GeneratePlanConfig` não tem os campos e
  o teste P1.5 trava qualquer persistência — mudar exige decisão explícita.

### 2. Filtro por período nas reviews
- Estado: chips removidos (G1.17); `reviews-view` não tem nenhum modelo
  de filtro; FSRS/due-dates intocados.
- Pergunta: o produto precisa filtrar (hoje/atrasadas/semana/mês)?
- Sem evidência de necessidade: BACKLOG até o usuário pedir.

### 3. Som do timer (`somTimer` × `useFocusSound`) — RESOLVIDO (G2.2)
- Inventário: só loops ambientes, nenhum sino/evento. "Sino" removido da UI;
  legado normaliza para "Melodia 1" na leitura (sem migration).
- Resta como decisão futura apenas um eventual sistema de som de evento.

## BACKLOG

- Reentrância residual em fluxos menores (inputs editáveis durante save).
- First-paint: skeleton/loading neutro em vez de cache imediato (UX pura).
- Mini-calendário da weekly view é painel estático (sem navegação).

## LIMITAÇÕES INTENCIONAIS

- First-paint cache-then-correct (offline-first; banco sempre vence).
- `study_source` restrito pelo CHECK (sem "CYCLE"; vínculo via metadata).
- Preview de importação = igualdade exata (igual à persistência).
- Edital e Ciclo desacoplados na remoção (decisão Fase 12→13).
- Etapa 4 declara que ritmo não altera blocos (nota G1.16).

## INFRAESTRUTURA

- G1.4.1: COMMIT concorrente isolado (staging/branch DB).
- Double-finalize vencedor real e skip concorrente: exigem 2 conexões.
- URL de produção real a definir (`app.nomeia.com` estacionada).
- Reconciliação filenames × migration registry (pós-release, sem `db push`).
