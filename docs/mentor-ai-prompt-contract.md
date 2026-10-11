# Mentor IA — contrato com um modelo de linguagem (futuro)

Status: **implementado na G2.16** (desligado por padrão; ver `docs/mentor-ai-llm-architecture.md`). O modelo recebe o `MentorLLMInput` — uma versão mínima do `StudentMentorContext` com referências curtas — e devolve o `MentorAIResponse` validado no servidor. Versão do prompt: `mentor-v1`.

## 1. Entrada

Um único JSON: o `StudentMentorContext` (`src/domain/mentor/student-mentor-context.ts`, versão `g2.15-v1`), produzido por `getStudentMentorContextAction()` para o aluno autenticado. O modelo **não** recebe acesso ao banco, a outras APIs nem a dados de outro aluno.

Campos principais:

| campo | conteúdo |
|---|---|
| `version`, `generatedAt`, `timezone`, `todayKey` | metadados (fuso America/Sao_Paulo) |
| `contextQuality` | `level` (EMPTY/LOW/MEDIUM/HIGH), `signals`, `reasons` |
| `study` | minutos/sessões 7, 14, 28 dias e total; semana; sequência; último estudo |
| `simulations` | contagem, média, primeiro, último, melhor, pior, variação, tendência, matéria-gargalo |
| `disciplines[]` | por identidade canônica: `disciplineId`, `name`, `mergedNames`, horas 28 d/total, simulados, média, primeiro/último, variação, tendência, classificação G2.11, status no edital, revisões vencidas |
| `reviews`, `cycle`, `planning`, `goals`, `edital`, `target` | estado determinístico de cada módulo |
| `insights[]` | `{ id, type, priority, disciplineId?, period, evidence, message }` |
| `recommendations[]` | `{ id, type, priority, disciplineId?, period, evidence, reason }` — candidatas |
| `sources[]` | leituras que alimentaram o contexto |

Convenções que o modelo deve respeitar:
- `null` = não há dado. `status: "NO_DATA"` = o aluno não registrou; `"UNAVAILABLE"` = falha de leitura. Nenhum dos dois pode ser narrado como zero ou como desempenho ruim.
- Minutos são inteiros; percentuais de acerto estão em 0–100; variações em pontos percentuais (p.p.).
- `disciplineId` é a identidade canônica; `name` é o nome a ser usado (pode ser o nome pessoal do aluno); `mergedNames` lista entradas do catálogo já somadas.

## 2. O que a IA poderá fazer

- Explicar os números em linguagem natural.
- Resumir a semana/mês a partir de `study`, `simulations`, `goals`.
- Identificar padrões **presentes nas evidências** (ex.: duas matérias em queda).
- Interpretar `insights` e `recommendations`, priorizando pelo campo `priority`.
- Sugerir estratégias de estudo genéricas, sempre como sugestão ao aluno.

## 3. O que a IA NÃO poderá fazer

- Inventar dados, percentuais, horas, datas ou simulados que não estão no JSON.
- Recalcular métricas (horas, médias, variações, ciclo, revisões, FSRS) ou "corrigir" os números.
- Alterar banco, ciclo (cursor, volta), revisões, planejamento, metas, histórico ou permissões — o modelo não terá ferramentas de escrita.
- Decidir identidade de disciplina ou juntar matérias pelo nome (ex.: tratar "Noções de X" como "X").
- Afirmar causalidade ("caiu porque estudou pouco") ou fazer diagnóstico psicológico/médico.
- Esconder incerteza: com `contextQuality.level` EMPTY/LOW ou seção `NO_DATA`, a resposta deve dizer que os dados são insuficientes.
- Falar de outro aluno ou de dados administrativos.

## 4. Regras de resposta

1. Toda afirmação numérica deve vir de um campo do JSON (citar o valor como está).
2. Quando `contextQuality.level` for `EMPTY`, a resposta é: "Dados insuficientes para avaliar sua evolução." mais o que registrar para começar.
3. Seções `NO_DATA`/`UNAVAILABLE` são mencionadas como ausência de dado, nunca como zero.
4. Recomendações saem só de `recommendations[]` (ou são explicitamente marcadas como sugestão geral, sem número).
5. Linguagem: português, tom de mentor, frases curtas, sem jargão técnico do sistema (sem "UNAVAILABLE", "canonical").
6. Datas no formato dd/mm/aaaa; percentuais com vírgula decimal.

## 5. Formato de saída (G2.16 — validado, schema estrito)

```json
{
  "summary": "interpretação geral, sem números (≤ 600)",
  "highlights": [{ "insightRef": "I1", "kind": "INTERPRETATION", "text": "≤ 280" }],
  "attentionPoints": [{ "insightRef": "I3", "disciplineRef": "D2", "text": "≤ 280" }],
  "recommendations": [{ "id": "rec-1", "candidateId": "R1", "title": "≤ 80", "explanation": "≤ 400", "evidenceIds": ["R1", "I3"] }],
  "confidence": "high | medium | low",
  "insufficientData": false
}
```
Referências ("I…", "R…", "D…") existem só neste pedido; qualquer referência fora do conjunto, campo extra, número no texto, afirmação causal, ação fingida ou confiança acima do permitido pela qualidade invalida a resposta inteira. A tela mostra os FATOS (com números) a partir do contexto e o texto do modelo como INTERPRETAÇÃO/SUGESTÃO.

### 5.1 G2.18 — contrato `mentor-v2` (ativo)

Diferenças em relação ao formato acima:

- `summaryRefs`: 1–6 referências `I…`/`R…` que apoiam o resumo (obrigatório);
- `evidenceIds`: 1–8, sem repetir, da mesma disciplina da candidata;
- referências sem zero à esquerda (`I1`, nunca `I01`); nada repetido na mesma lista;
- **texto pode citar referências** ("D2 merece atenção"): o validador as separa antes de checar números e a tela troca "D…" pela denominação oficial. Uma referência usada como valor ("D2%", "+D2", "D2 pontos") é rejeitada;
- confiança: EMPTY/LOW → `low` + `insufficientData: true`; MEDIUM → nunca `high`; `insufficientData: true` → `low`;
- a mensagem do usuário traz os dados entre `<dados>` e `</dados>`, com `<`/`>` escapados no JSON.

Regras completas e motivos: [mentor-v2-evaluation.md](./mentor-v2-evaluation.md). Bateria: [mentor-ai-adversarial-tests.md](./mentor-ai-adversarial-tests.md).

## 6. Falha do provedor

Se o modelo estiver indisponível, a tela continua mostrando a visão determinística (`/mentor`). O produto nunca depende do LLM para funcionar.
