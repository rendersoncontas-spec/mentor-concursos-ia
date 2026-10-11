# G2.16 — Mentor IA com LLM — relatório

Detalhes: [`mentor-ai-llm-architecture.md`](./mentor-ai-llm-architecture.md) · [`mentor-ai-llm-safety.md`](./mentor-ai-llm-safety.md) · [`mentor-ai-prompt-contract.md`](./mentor-ai-prompt-contract.md)

## 1. Arquitetura
`StudentMentorContext` (G2.15) → entrada mínima com referências → `MentorLLMProvider` (porta) → validador estrito → visão resolvida (fato do sistema + texto da IA) → painel em `/mentor`. Três camadas: provedor (só transporte), serviço (cache, deduplicação, limite, retry, métricas — sem HTTP e sem SDK), validador (schema, referências, conteúdo).

## 2. Provedor
Arqueologia: não havia SDK, cliente de IA, variável, prompt, limite nem flag de IA (o "Mentor IA" antigo era heurística). Implementado **um** adapter, `OpenAICompatibleMentorProvider`, via `fetch` (sem dependência nova; `package-lock.json` intacto), formato chat completions com `response_format: json_object`. Outro fornecedor = outro adapter da mesma porta.

## 3. Configuração
Somente servidor: `MENTOR_AI_ENABLED`, `MENTOR_AI_PROVIDER`, `MENTOR_AI_BASE_URL` (https), `MENTOR_AI_API_KEY`, `MENTOR_AI_MODEL`, `MENTOR_AI_TIMEOUT_MS` (15 s), `MENTOR_AI_MAX_OUTPUT_TOKENS` (900), `MENTOR_AI_MAX_CALLS_PER_HOUR` (6). Valores fora da faixa são limitados. Nada de `NEXT_PUBLIC_`.

## 4. Flag
Desligada por padrão (só `"true"` liga). Sem chave ou modelo → desligada. `/mentor` funciona integralmente sem LLM; o painel mostra "análise por IA desligada".

## 5. Prompt
`MENTOR_PROMPT_VERSION = "mentor-v1"`, em português, regras: usar só os dados enviados; não inventar matéria, número, meta ou recomendação; não citar números no texto; não afirmar causa; não prometer aprovação; não alterar nada nem fingir ações; tom calmo; JSON estrito por referências; dados poucos → confiança baixa / `insufficientData`.

## 6. Entrada
`MentorLLMInput`: datas/versões, qualidade, status das seções, dias até a prova, até 15 disciplinas como `D1…` (nome + métricas), insights `I1…`, candidatas `R1…`. Sem ids internos, nome do aluno, e-mail, concurso, tokens ou dados administrativos. Teto de 12.000 caracteres.

## 7. Saída
`MentorAIResponse`: `summary`, `highlights[{insightRef, kind:"INTERPRETATION", text}]`, `attentionPoints[{insightRef, disciplineRef, text}]`, `recommendations[{id, candidateId, title, explanation, evidenceIds}]`, `confidence`, `insufficientData`. A tela mostra **Fato** (sistema) + **Interpretação**/**Sugestão** (IA).

## 8. Validação
`validateMentorAIResponse()`: schema estrito com limites de tamanho/quantidade; referências existentes; matéria do ponto de atenção = matéria do insight; ids únicos; sem algarismos/%/números por extenso; sem causalidade; sem ações fingidas; confiança coerente com a qualidade. Inválida → rejeitada inteira, sem conserto.

## 9. Segurança
Aluno sempre o da sessão (action sem parâmetro); modo suporte bloqueia; cache por aluno; segredos fora do bundle (0 ocorrências em `.next/static` da variável, endpoint e prompt); o modelo não tem nenhum caminho de escrita.

## 10. Fallback
Desligado / sem dados / limite / timeout / 429 / 4xx / 5xx / JSON inválido / rejeitada → mensagem simples; o Mentor determinístico continua completo. Retry: 1 nova tentativa, 800 ms, só 5xx/rede.

## 11. Cache
Memória, 30 min, até 500 entradas, chave `aluno:sha256(versão|modelo|entrada)`. Qualquer mudança nos dados do aluno muda a chave. Duplo clique, duas abas e reload reaproveitam a chamada em andamento. Só sucessos são guardados.

## 12. Rate limit
Janela deslizante de 1 h por aluno (padrão 6 chamadas reais). Cache e reaproveitamento não contam. Excedido → "tente de novo em N minutos".

## 13. Custos
Chamada só por clique; entrada ≤ 12.000 caracteres; saída ≤ 900 tokens (configurável); ≤ 2 tentativas; cache 30 min; limite por aluno.

## 14. Logs
`[mentor-llm]` com provedor, modelo, versão do prompt, desfecho, duração, tentativas, tamanhos, nº de motivos de rejeição. Métricas: chamadas, sucessos, falhas, timeouts, 429, rejeitadas, cache, duração média. Nunca prompt, resposta, chave ou dados do aluno.

## 15. UI
`/mentor`: "Seu momento atual" → "Análise do Mentor" (novo painel: desligada / dados insuficientes / pronto para gerar / gerando / pronta / limite / falha) → "Pontos para acompanhar" → "Próximos passos". Sem chat. Contexto fraco → aviso "análise limitada". `/dashboard/mentor` (feed antigo) redireciona para `/mentor`; gravação em `mentor_history` desligada; tabela preservada; nenhuma migration.

## 16. Testes
2261 → **2291** (+30, `src/application/mentor-llm/mentor-llm.test.ts`, provedor falso, sem chamada real): flag/config, sucesso, timeout, 429, 500 com retry, 4xx sem retry, JSON inválido, schema, candidateId/evidência/matéria inventados, matéria trocada, números (algarismo, %, por extenso), causalidade, ação fingida, campo extra, confiança, EMPTY sem chamada, duplo clique, cache, invalidação, cache por aluno, TTL, limite, minimização da entrada, logs só metadados, adapter com fetch falso, chave fora do erro, sem `NEXT_PUBLIC_`, cliente sem importar servidor, domínio sem HTTP, sem SDK, feed antigo desligado.

## 17. Problemas encontrados
- Nenhuma infraestrutura de IA existente (tudo criado do zero).
- `mentor_history`: 5 linhas, gravadas só pelo feed antigo, sem leitor.
- Sem armazenamento compartilhado para cache/limite (sem Redis/KV no projeto).
- Nomes de matéria em texto livre e números por extenso não são 100% detectáveis.
- Adapter não testado contra fornecedor real (sem chave nesta fase).

## 18. Problemas corrigidos
- Feed antigo duplicado → redirecionado e sem gravação.
- Risco de alucinação numérica/matéria → números só do sistema, matérias só por referência, validador rejeita.
- Risco de custo por render/clique repetido → chamada explícita, deduplicação, cache, limite.

## 19. Pendências
- Configurar chave e modelo no ambiente de produção e ligar a flag após teste manual.
- Revisar `mentor_history` (manter ou remover) em fase própria — nenhuma migration criada.
- Migration G2.12 continua **não aplicada**.

## 20. Limitações
Cache/limite/deduplicação por instância (memória); a análise some com reinício; sem persistência de análises; sem histórico; validação de linguagem por padrões.

## 21. Próxima fase sugerida
G2.17 — piloto controlado: chave em produção, flag para poucos alunos, medir taxa de rejeição/latência/custo, ajustar o prompt (`mentor-v2`) e, se preciso, cache/limite compartilhados.

## Comandos
| comando | resultado |
|---|---|
| `npm test` | 2291 pass, 0 fail (419 suítes) |
| `npx tsc --noEmit` | 0 erros |
| `npm run build` | OK (`/mentor`, `/dashboard/mentor`) |
| `npx eslint` (arquivos da fase) | 0 problemas |
| `npm audit --omit=dev` | 3 moderate (mammoth → argparse → sprintf-js; sem correção disponível; usado só no CLI do mammoth) |
| `npm audit` | 10 (6 moderate, 4 high) — inclui dev (`@next/eslint-plugin-next`, `@capacitor/cli`), só com major. `npm audit fix --force` **não** executado |
| `package-lock.json` | inalterado |
