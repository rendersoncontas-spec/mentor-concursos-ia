# Estudo × desempenho em simulados

Última revisão: 2026-10-03 (G2.11). Código: `src/application/simulados/study-performance.ts` (cálculo puro), `study-performance.action.ts` (leitura), `src/features/simulados/components/study-performance-section.tsx` (tela).

## 1. Fontes

| Dado | Fonte | Regra |
|---|---|---|
| Tempo estudado | `study_history` | Fato realizado. `duration_minutes` (senão `active_minutes`), a mesma regra do motor de Estatísticas. Nunca tempo planejado, meta ou disponibilidade. |
| Desempenho | simulados externos (`simulados` com `mode` nulo e `FINISHED` + `simulado_disciplines`) | Calculado pelas funções da G2.10 (`buildSubjectAnalysis`): não há segunda implementação de média, evolução ou tendência. |
| Nome da matéria | `disciplines` | Uma consulta `in (...)` com os ids envolvidos. |

As duas fontes se ligam por `discipline_id`, que aponta para o mesmo catálogo `disciplines` nos dois lados. A ligação é **exata por id**: não há aproximação por nome. `user_disciplines` não participa (não é necessário para o cruzamento). Nenhuma tabela foi criada.

`question_attempts` está **fora do escopo** desta análise: a tabela continua vazia em produção (decisão G2.9) e nada aqui depende dela.

## 2. Período

Na tela: **4 semanas**, **8 semanas** (padrão) ou **todo o período**. A janela termina hoje (São Paulo) e inclui o dia inicial — 4 semanas = 28 dias. O mesmo intervalo vale para as horas e para os simulados, e a tela mostra as datas de início e fim. Não há período personalizado: a tela de Simulados não tem seletor de datas, e criar um só para isto seria filtro a mais.

## 3. Métricas por matéria

Tempo estudado, nº de sessões, nº de simulados, média (acertos ÷ questões somados), primeiro, último, melhor, pior, evolução (último − primeiro, em p.p.), tendência (da G2.10) e distribuição das horas por semana (somente 4/8 semanas).

## 4. Tratamento dos dados

- Sessão com o mesmo `id` repetido conta uma vez.
- Duração ≤ 0, acima de 24 h ou data ilegível → fora da soma; a tela informa quantas foram descartadas.
- Sessão sem disciplina → "estudo sem matéria", mostrado à parte, **nunca** atribuído a uma matéria.
- Matéria com estudo e sem simulado → aparece com as horas e "Sem simulado / dados insuficientes".
- Matéria com simulado e sem nenhuma sessão no período → **0 h** (é um fato: nada foi registrado).
- Matéria de simulado sem id do catálogo (nome livre) → horas **"—"** (desconhecidas, não zero).

## 5. Situações e limites

Constantes em `study-performance.ts`; não se ajustam sozinhas.

| Constante | Valor | Uso |
|---|---|---|
| `MIN_SIMULADOS_FOR_EVOLUTION` | 2 | abaixo disso não há evolução |
| `GROWTH_PP` | +3 p.p. | crescimento |
| `HIGH_GROWTH_PP` | +8 p.p. | alta evolução |
| `DROP_PP` | −3 p.p. | queda |
| `HIGH_STUDY_MINUTES_PER_WEEK` | 180 (3 h/sem.) | "muito estudo" |
| `LOW_STUDY_MINUTES_PER_WEEK` | 60 (1 h/sem.) | "pouco estudo" |
| `MAX_SESSION_MINUTES` | 1440 | sessão inválida acima disso |
| tendência (G2.10) | 3+ simulados, ±2 p.p. | — |

"Por semana" = minutos ÷ semanas do período (4 ou 8; em "todo o período", do primeiro registro até hoje).

Ordem das regras (vale a primeira):

1. menos de 2 simulados: **Pouco estudo** (< 1 h/sem.) ou **Sem simulado** (0) / **Dados insuficientes** (1);
2. evolução ≤ −3 p.p. → **Em queda**;
3. ≥ 3 h/sem. e evolução < +3 p.p. → **Muito estudo, pouca evolução**;
4. evolução ≥ +8 p.p. → **Alta evolução**;
5. evolução ≥ +3 p.p. → **Evoluindo**;
6. senão → **Estável**.

Sem horas atribuíveis (matéria sem id), as regras de horas ficam desligadas.

## 6. Volume mínimo

- 1 simulado: mostra o resultado, sem evolução nem tendência ("Ainda não dá para medir evolução").
- 2 simulados: comparação primeiro → último, sem tendência.
- 3+ simulados: tendência.
- "Muito estudo, pouca evolução" exige 2+ simulados da matéria no período.
- Sem simulado: "Dados insuficientes para analisar o desempenho desta matéria." Nenhum valor é preenchido com zero.

## 7. Frases (insights)

Montadas só com números calculados, por exemplo:

- "Você estudou 14h 20min de Contabilidade Geral nas últimas 8 semanas."
- "Seu resultado nos simulados passou de 61% para 63% (+2 p.p.)."
- "Há dados suficientes para acompanhar a tendência."
- "Contabilidade Geral teve 14h 20min de estudo, mas +2 p.p. de evolução nos simulados. Vale olhar a qualidade do estudo, não apenas o tempo."

## 8. Interpretação correta

A análise coloca **lado a lado** o que foi estudado e o que mudou nos simulados no mesmo período. Ela **não** afirma que um causou o outro (um teste trava que nenhuma frase use "causou", "porque", "graças a"). A tela repete isso abaixo da tabela. Diferenças de banca, dificuldade do simulado e tipo de estudo também mudam o resultado e não são medidas aqui.

## 9. Limitação encontrada nos dados reais

O catálogo tem matérias quase iguais como entradas diferentes (ex.: "Raciocínio Lógico", "Raciocínio Lógico e Matemático" e "Raciocínio Lógico-Matemático"; "Direito Administrativo" × "Noções de Direito Administrativo"). Como a ligação é por id, horas estudadas numa entrada não aparecem ao lado do simulado registrado na outra. No único simulado em produção, 2 das 7 matérias têm sessões no mesmo id nas últimas 8 semanas. Unificar entradas do catálogo é uma decisão de produto/dados (fora desta fase); adivinhar pelo nome seria atribuir horas sem prova.

## 10. Desempenho e atualização

Três leituras por cálculo (simulados, sessões do período paginadas com 4 colunas, nomes das matérias em lote) — nenhuma por matéria. Sem cache: a tela recalcula ao abrir, ao trocar o período e depois de registrar/editar/excluir um simulado; um estudo registrado em outra tela aparece na próxima abertura de Simulados.

## 11. Futuro: Mentor IA

O relatório (`StudyPerformanceReport`) já é uma estrutura determinística e explicável — horas, evolução, situação e frases por matéria. Um Mentor IA deveria **ler** esses números e conversar sobre eles, nunca recalcular ou inventar relação causal. Quando `question_attempts` tiver dados, a mesma estrutura pode ganhar acertos por tópico como coluna adicional.
