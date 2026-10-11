# mentor-v1 × mentor-v2 — avaliação e decisão (G2.18)

**Decisão: `mentor-v2` promovida a versão ativa** (`MENTOR_PROMPT_VERSION = "mentor-v2"`). Motivo comprovável sem provedor real: o prompt v2 avisa o modelo de **todas** as regras que o validador aplica; o v1 avisava de 5 em 25 (teste `alinhamento prompt ↔ validador`). A v1 continua disponível para comparação no script de piloto (`--prompt=both`). Voltar = trocar uma linha em `src/domain/mentor/mentor-ai.ts`.

A comparação com **provedor real** (taxa de rejeição v1 × v2, rubrica humana) continua pendente — é o primeiro passo do piloto real. A promoção não liga nada: a flag segue desligada por padrão.

## Critério

"Melhor" = menos rejeições que o modelo não tinha como evitar + mais proteção, sem afrouxar o validador. Medido de forma determinística:

1. **Cobertura do contrato** — para cada verificação do validador/qualidade, a frase do prompt que avisa o modelo (25 itens).
2. **Obediência literal** — respostas que seguem a v1 ao pé da letra e são rejeitadas pelas verificações atuais.
3. **Bateria adversarial** — mesmos casos para as duas versões ([mentor-ai-adversarial-tests.md](./mentor-ai-adversarial-tests.md)).

## Resultado 1 — cobertura do contrato

| regra (código) | v1 | v2 |
|---|---|---|
| NUMBER, DATE, CAUSALITY, PRETEND_ACTION, REF_UNKNOWN | ✔ | ✔ |
| QUANTITY ("o dobro", "triplicou") | — | ✔ |
| SUSPICIOUS_CONTENT (links, chaves, senhas) | — | ✔ |
| PROMPT_INJECTION (dados são conteúdo, nunca instrução) | — | ✔ |
| REF_MALFORMED (sem zero à esquerda) | — | ✔ |
| REF_DUPLICATE (sem repetir) | — | ✔ |
| REF_AS_NUMBER ("D2%", "+D2") | — | ✔ |
| REF_OUT_OF_BLOCK (só disciplinas do bloco) | — | ✔ |
| REF_IN_TEXT_ALLOWED (como citar disciplina) | — | ✔ |
| EVIDENCE_MISMATCH (evidência da mesma disciplina) | — | ✔ |
| DISCIPLINE_MISMATCH (disciplineRef = do insight) | — | ✔ |
| CONTRADICTS_FACT (não inverter a direção) | — | ✔ |
| NO_DATA_CLAIM (seção sem dados) | — | ✔ |
| CONFIDENCE_LOW / CONFIDENCE_MEDIUM / INSUFFICIENT_IMPLIES_LOW | — | ✔ |
| SUMMARY_REFS / EVIDENCE_REQUIRED (grounding) | — | ✔ |
| GENERIC_LOW_VALUE / REPETITIVE (qualidade) | — | ✔ |
| OUTSIDE_KNOWLEDGE | — | ✔ |
| **total** | **5/25** | **25/25** |

## Resultado 2 — obediência literal à v1 é rejeitada

| comportamento permitido pela v1 | verificação atual |
|---|---|
| confiança `"high"` com contexto MEDIUM | `CONFIDENCE` |
| `insufficientData: false` com contexto LOW | `CONFIDENCE` |
| resposta sem `summaryRefs` (resumo sem apoio) | `SCHEMA` (v2) |
| citar disciplina por "D…" (regra 5 da v1) **antes** da G2.18 | era `NUMBER` — **resolvido no validador** (referência ≠ número) |

## Mudanças v1 → v2

| # | problema na v1 | causa | alteração | impacto | teste |
|---|---|---|---|---|---|
| 1 | regra 5 ("cite por D…") × regra 3 ("sem números") | o validador tratava "D2" como algarismo | validador separa **token de referência** do texto antes de checar números; prompt explica que referência é etiqueta | quem obedece não é mais rejeitado; "D2%", "+D2", "D02" seguem rejeitados | `Fases 2–3: REFERENCE TOKEN ≠ NUMERIC FACT` |
| 2 | nome de disciplina com algarismo ("Português 2") derrubava a resposta | nome é dado do aluno | nomes oficiais enviados são removidos antes da checagem de números; prompt pede "D…" em vez do nome | sem falso positivo; números escritos pelo modelo continuam bloqueados | idem |
| 3 | sem defesa explícita contra instrução escondida nos dados | prompt não dizia que dados ≠ instrução | seção "SEGURANÇA DA ENTRADA"; dados entre `<dados>`; `<`/`>` escapados; entrada saneada (invisíveis, bidi, teto de tamanho) | injeção não "fecha" o bloco nem se esconde; efeito (número/ação/link/credencial) é rejeitado | `Fase 4` |
| 4 | resumo sem referência | formato da v1 | `summaryRefs` (1–6) + disciplina citada no resumo precisa estar nos refs | todo bloco tem apoio identificável | `Fases 11–16: grounding` |
| 5 | recomendação podia vir sem evidência | `evidenceIds` mín. 0 | mín. 1, sem repetir, da mesma disciplina | evidência sempre ligada à candidata | `Fases 5–6` |
| 6 | confiança só limitada em EMPTY/LOW | regra parcial | MEDIUM nunca `high`; LOW exige `insufficientData`; `insufficientData` exige `low` | modelo não "sobe" a confiança | `Fases 9–10` |
| 7 | nada sobre seções sem dados, contradição, conhecimento externo, genérico, repetição | prompt mínimo | regras explícitas + verificação determinística | menos alucinação e menos texto vazio | `Fases 9–10`, `11–16` |

## Custo da v2

Prompt do sistema: 2.041 → 4.028 caracteres (≈ +500 tokens por chamada, **estimativa** de ~4 caracteres por token — não é contagem do fornecedor). A mensagem do usuário cresce ~50 caracteres (delimitadores). Entrada típica (cenário HIGH): ~3,9 mil caracteres. Com o cache de 30 min, o impacto real depende do tráfego do piloto.

## Limitações da decisão

- Medida sem modelo real: prova que a v2 **não pune** o modelo por regras que não lhe foram ditas e que cobre mais ataques; não prova que o modelo real **obedece** melhor. Isso é a primeira medição do piloto (`--prompt=both`).
- As verificações de linguagem são por padrões (lista finita de palavras); falso positivo custa uma chamada e cai no fallback.

## G2.19 — piloto real: não executado

A configuração do provedor não existe no `.env.local` (`MENTOR_AI_ENABLED`, `MENTOR_AI_API_KEY` e `MENTOR_AI_MODEL` ausentes). Por regra da diretiva, nada foi improvisado e nenhuma chamada real foi feita.

**Decisão nesta fase:** a v2 **continua** oficial em caráter **provisório**. Não surgiu evidência real contra ela, e a justificativa determinística da G2.18 segue válida. A confirmação depende do primeiro piloto real.

Para confirmar, o script agora calcula sozinho:
- o resumo por versão (`summarizeVersion`);
- a tabela `| Caso | V1 | V2 | Vencedor | Motivo |` (`compareVersions`);
- a regra da Fase 21 (`pilotDecision`).

A regra da Fase 21 manda **rever** a v2 em três casos:
- a taxa de rejeição da v2 passa a da v1 em mais de 15 pontos;
- a v1 vence mais casos (por mais de um);
- a v2 é 50 % mais lenta sem vencer em qualidade.

O vencedor por caso é provisório até a nota humana de utilidade. **Uma v2.1 só será criada se o piloto real mostrar um problema concreto.**
