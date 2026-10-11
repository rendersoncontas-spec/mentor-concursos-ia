# G2.18 — Mentor IA v2 + qualidade e testes adversariais — relatório

**Status: VERDE** para o escopo da fase (pré-piloto real, sem provedor real).

| critério | situação |
|---|---|
| v2 com justificativa técnica | promovida |
| prompt injection | tratada |
| números e causalidade | protegidos |
| referências e evidências | validadas |
| contexto vazio | funciona |
| respostas genéricas | identificadas e descartadas |
| Fake Provider | cobre os 14 cenários |
| fallback | ok |
| cache por versão de prompt | ok |
| UI separa fatos de interpretação | ok |
| testes, tsc e build | passam |

Não há decisão técnica pendente para a primeira chamada real. O que falta é **medir** (v1 × v2 com modelo real), não decidir.

Docs: [mentor-v2-evaluation.md](./mentor-v2-evaluation.md) · [mentor-ai-adversarial-tests.md](./mentor-ai-adversarial-tests.md)

## 1. v1
Prompt da G2.16. Cobria 5 das 25 regras que o validador aplica. Continha a contradição "cite disciplinas por D…" × "não escreva números". Segue disponível para comparação (`--prompt=both`).

## 2. v2
Ativa (`MENTOR_PROMPT_VERSION = "mentor-v2"`). Reescrita a partir da candidata da G2.17, que nunca tinha sido usada com provedor real. Cobre 25/25 regras. Seções:
- segurança da entrada;
- referências;
- números e fatos;
- causalidade e ações;
- qualidade;
- confiança;
- formato.

## 3. Mudanças
- **Prompt:** reescrito (ver 5).
- **Contrato:** `summaryRefs` e evidência obrigatória.
- **Validador:** referência ≠ número, grounding por bloco, contradição, seção sem dados, conteúdo suspeito, invisíveis, confiança por nível, teto bruto.
- **Qualidade:** `mentor-ai-quality.ts` (genérico, repetição, ação, 8 dimensões).
- **Entrada:** saneamento (invisíveis, bidi, NFC, tetos de 80 caracteres para nome e 300 para frase).
- **Mensagem:** `<dados>` com `<`/`>` escapados.
- **Fake Provider:** 14 cenários.
- **UI:**
  - "Dado do sistema" × "Mentor (IA)";
  - nomes de disciplina renderizados pelo sistema;
  - "Fatos do sistema" no topo.
- **Script de piloto:** pontuação, tamanhos, repetição entre contextos e bateria de falhas por cenário.

## 4. Motivo
A v1 punia o modelo por regras que não lhe eram ditas: quem obedecia a ela ao pé da letra era rejeitado (confiança `high` em MEDIUM, `insufficientData: false` em LOW). Também não declarava os dados como não-instrução. Detalhe e tabela: [mentor-v2-evaluation.md](./mentor-v2-evaluation.md).

## 5. Prompt
`mentor-ai.prompt.ts`, versionado. 4.028 caracteres (v1: 2.041). Explica:
- referências como etiquetas e como citar uma disciplina ("D2 merece atenção");
- proibição de números, datas, meses e quantidades;
- direção sem quantificar;
- não contradizer os fatos e não afirmar nada sobre seções sem dados;
- não usar conhecimento externo;
- não afirmar causa nem fingir ação;
- evitar texto genérico e repetição;
- confiança por nível de qualidade;
- formato com todos os campos obrigatórios.

## 6. Validator
Rejeição por códigos fixos (`MentorRejectionCode`), que vão para o log:
- **formato e referências:** `SCHEMA`, `REF_UNKNOWN`, `REF_DUPLICATE`, `REF_MALFORMED`, `REF_AS_NUMBER`, `REF_OUT_OF_BLOCK`, `EVIDENCE_MISMATCH`, `DISCIPLINE_MISMATCH`;
- **números:** `NUMBER`, `DATE`, `QUANTITY`;
- **conteúdo:** `CAUSALITY`, `PRETEND_ACTION`, `SUSPICIOUS_CONTENT`, `INVISIBLE_CHARS`;
- **fidelidade:** `CONTRADICTS_FACT`, `NO_DATA_CLAIM`, `CONFIDENCE`.

Nada foi relaxado. A única mudança de permissividade é deliberada e restrita: **token de referência válido** e **nome oficial enviado** deixam de contar como "número do modelo". "D2%", "+D2" e "D02" continuam rejeitados.

## 7. Segurança
Os casos abaixo são bloqueados ou rejeitados, falhando fechado:
- aluno A × contexto de B (action sem parâmetro; cache por aluno; ids não vão ao provedor);
- injeção por nome, insight ou candidata;
- injeção de referência, candidata, evidência e id;
- modo suporte;
- aluno fora da allowlist.

Pedido ao provedor sem chave, `Bearer` ou id. Bundle: 0 ocorrências de `MENTOR_AI_`, endpoint, prompt ou `summaryRefs` em `.next/static`.

## 8. Adversarial testing
`mentor-v2-g2-18.test.ts`, com 138 testes:
- matriz de 56 casos (4 contextos × 14 cenários do Fake Provider);
- bateria por categoria (números, datas, quantidades, causalidade, referências, evidências, contradição, seção sem dados, confiança, injeção, genérico, template);
- fuzz com semente fixa (150 nomes, 300 respostas mutadas).

Detalhe: [mentor-ai-adversarial-tests.md](./mentor-ai-adversarial-tests.md).

## 9. Qualidade
- **`GENERIC_LOW_VALUE`:** resposta sem ligação com os fatos é descartada (`low_value` no log; métrica `lowValue`).
- **`REPETITIVE` e `LOW_ACTIONABILITY`:** só sinalizam.
- **Pontuação de 8 dimensões:** heurística determinística. USEFULNESS é sempre humano. Não se usa LLM para avaliar LLM.

## 10. Fake provider
`FakeMentorLLMProvider.scenario(...)` cobre os cenários:
- `VALID_RESPONSE`;
- `INVALID_JSON`, `INVALID_SCHEMA`;
- `INVENTED_REFERENCE`, `INVENTED_NUMBER`;
- `CAUSALITY`, `PROMPT_INJECTION`, `GENERIC_LOW_VALUE`;
- `HUGE_OUTPUT`, `EMPTY_OUTPUT`, `TRUNCATED`;
- `TIMEOUT`, `HTTP_429`, `HTTP_500`.

A resposta válida é montada do próprio pedido (v1 ou v2) e passa no contrato em todos os cenários do piloto.

## 11. Fallback
Todos os erros, nos 4 contextos, viram `FAILED` (sem exceção). Nenhum entra no cache. A tela mantém o Mentor determinístico, com o vigia de 75 s da G2.17 no cliente.

## 12. Cache
- A versão do prompt faz parte da chave: v1 e v2 nunca se misturam, e a promoção invalida respostas antigas.
- Mesmo contexto dá cache hit; contexto alterado (estudo, simulado, revisão, meta) dá miss.
- O cache é por aluno.

## 13. UI
Três blocos visualmente distintos:
1. **Fatos do sistema:** "Seu momento atual".
2. **Análise do Mentor, interpretação por IA:**
   - "Dado do sistema" separado de "Mentor (IA)", com barra lateral;
   - nomes de disciplina em negrito, vindos do sistema;
   - marcador "(ver dado)" para referências a fatos;
   - selo "Dados limitados".
3. **Próximos passos:** sugestões da IA ("Sugestão (IA)") e lista do sistema ("Calculados pelo sistema… (sem IA)").

O rodapé diz que números, datas e nomes vêm sempre do sistema.

## 14. Performance
Medido pelo script em modo ensaio, sem rede:

| cenário | entrada (caracteres) | mensagem v2 | montar | validar |
|---|---|---|---|---|
| empty | 884 | 991 | < 1 ms | < 1 ms |
| low | 1.703 | 1.810 | < 1 ms | < 1 ms |
| medium | 1.354 | 1.461 | < 1 ms | < 1 ms |
| high | 3.765 | 3.872 | < 1 ms | ~1,4 ms |
| reviews-overdue | 4.127 | 4.234 | < 1 ms | ~1,2 ms |
| adv-injection-in-name | 4.159 | 4.266 | ~3 ms | ~2,5 ms |

O prompt do sistema v2 tem 4.028 caracteres. A entrada não leva `generatedAt`, `timezone`, `sources`, uuids nem dados do concurso.

**Custo futuro (estimativa, não é contagem do fornecedor):** com ~4 caracteres por token, uma chamada típica (HIGH) tem cerca de 2 mil tokens de entrada (prompt ~1.000 + dados ~970) e no máximo 900 de saída (teto configurado). Custo em dinheiro: **não calculado**, porque não há preço configurado (`MENTOR_AI_PRICE_*`).

## 15. Testes

| comando | resultado |
|---|---|
| `npm test` | **2459 pass, 0 fail** (436 suítes; G2.17: 2321 → +138) |
| `npx tsc --noEmit` | 0 erros |
| `npm run build` | OK (`/mentor` e `/dashboard/mentor` dinâmicas) |
| `npx eslint` (arquivos da fase) | 0 problemas |
| `npm audit --omit=dev` | 3 moderate (mammoth → argparse → sprintf-js; sem correção; risco residual) |
| `npm audit` | 10 (6 moderate, 4 high; inclui dev só corrigível com versão major). `npm audit fix --force` **não** executado |

Lockfile inalterado.

## 16. Problemas encontrados
1. Contradição de números na v1, e o validador tratava "D2" como algarismo.
2. Nome de disciplina com algarismo derrubava respostas.
3. Sem defesa explícita contra instrução nos dados. Um nome com `</dados>` poderia "fechar" o bloco num formato delimitado. Caracteres invisíveis e bidi passavam para o modelo.
4. Resumo sem referência; recomendação sem evidência; evidência de outra disciplina aceita.
5. Referência duplicada e com zero à esquerda aceitas; `I01` passava no regex.
6. Confiança `high` aceita em MEDIUM; LOW sem `insufficientData` aceito.
7. Sem verificação de contradição com o fato nem de afirmação sobre seção sem dados.
8. Sem verificação de links, credenciais e "ignore as instruções" na saída.
9. Sem teto para resposta bruta: uma saída enorme era interpretada inteira.
10. Causalidade com "à" ("Graças à…") escapava. Achado pelo próprio teste: `\b` do JS não funciona depois de letra acentuada.
11. Texto genérico era aceito como análise.
12. No ambiente de trabalho, sequências `\uXXXX` digitadas viravam caracteres reais. Achado ao compilar; corrigido gerando os escapes por código, e há uma varredura que garante que não sobrou caractere invisível no código.

## 17. Problemas corrigidos
1–11: todos, com teste correspondente (ver 3, 6, 8 e 9). 12: corrigido e verificado.

## 18. Problemas pendentes
- **Comparação v1 × v2 com modelo real:** taxa de rejeição, rubrica e falsos positivos das heurísticas. Primeiro passo do piloto.
- Heurísticas de linguagem por lista de padrões. Pode haver falso positivo (custa uma chamada e cai no fallback) e paráfrase não detectada (coberta pela rubrica humana).
- Conhecimento externo sem número ou referência não é detectável deterministicamente.
- Herdado da G2.17: cache, limites e métricas em memória por instância.
- `mentor_history` preservada; migration G2.12 não aplicada.

## 19. Próximos passos
1. Operador: chave e modelo em `.env.local`, depois `npx tsx --env-file=.env.local scripts/mentor-ai-pilot.ts --real --prompt=both --max-calls=20`.
2. Comparar `results.json` (rejeições por código, `low_value`, tokens, latência) e preencher `evaluation.md`. Se a v1 rejeitar menos com a mesma qualidade, rever a decisão: é uma linha.
3. Ajustar padrões só com evidência de falso positivo real (documentar como `mentor-v3`, nunca relaxando sem caso concreto).
4. Produção com 1–3 uuids na allowlist (runbook da G2.17).
