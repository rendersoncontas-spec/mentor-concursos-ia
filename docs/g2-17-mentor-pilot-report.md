# G2.17 — Piloto controlado do Mentor IA — relatório

**Status: AMARELO.** O piloto está pronto e protegido: allowlist, limites, observabilidade, fallback, casos adversariais, avaliação e runbook. Mas **nenhuma chamada real bem-sucedida foi feita nesta fase**:

- não há chave nem modelo do Mentor configurados (`.env.local` não tem `MENTOR_AI_*`);
- a rede dos dois ambientes de trabalho bloqueia os endpoints de LLM (`api.openai.com`, Groq, Gemini e OpenRouter respondem `000`).

O passo real fica com o operador, no próprio computador (runbook §3). Nenhum critério VERMELHO ocorreu.

Docs: [piloto](./g2-17-mentor-pilot.md) · [runbook](./mentor-ai-production-runbook.md) · [avaliação](./mentor-ai-evaluation.md)

## 1. Provider
Um só: `OpenAICompatibleMentorProvider` (`fetch`, sem SDK, sem dependência nova). O domínio não conhece o fornecedor.

Revisão do adapter para uso real:
- endpoint `${BASE_URL}/chat/completions`;
- autenticação `Authorization: Bearer`, mais `content-type: application/json`;
- `response_format: json_object` e `cache: no-store`;
- timeout por AbortController, agora cobrindo também a leitura do corpo;
- resposta `choices[0].message.content` + `usage` + `finish_reason`;
- erros 429, 5xx e 4xx mapeados; vazio vira EMPTY_RESPONSE; abort vira TIMEOUT; outras falhas viram NETWORK.

## 2. Model
Não definido: depende da escolha do operador (`MENTOR_AI_MODEL`, sem padrão). Para modelos de raciocínio: `MENTOR_AI_API_STYLE=reasoning`.

## 3. Configuração
Somente servidor e relida a cada pedido. Novas variáveis:
- `MENTOR_AI_PILOT_USER_IDS`;
- `MENTOR_AI_MAX_CALLS_PER_DAY` e `MENTOR_AI_MAX_CALLS_PER_DAY_GLOBAL`;
- `MENTOR_AI_API_STYLE`;
- `MENTOR_AI_PRICE_INPUT_PER_MTOK` e `MENTOR_AI_PRICE_OUTPUT_PER_MTOK`.

Nenhuma variável `NEXT_PUBLIC_`.

## 4. Allowlist
Obrigatória e verificada no servidor com o aluno da sessão. Vazia significa que ninguém usa. Uuids inválidos são ignorados e maiúsculas normalizadas.

Quem está fora da lista recebe o Mentor determinístico sem o bloco de IA. Em modo suporte, a IA fica bloqueada mesmo para quem está na lista. O navegador não tem como se declarar piloto.

## 5. Chamadas realizadas

| execução | chamadas ao provedor | resultado |
|---|---|---|
| ensaio, provedor falso, `mentor-v1` | 10 | cenários, cache, dedupe e limite OK; 6 falhas forçadas viraram FAILED |
| ensaio, provedor falso, `both` | 18 | v1 e v2 percorrem o mesmo fluxo |
| **adapter real** com chave falsa (`--real --max-calls=2`) | 2 (1 + 1 nova tentativa) | `NETWORK` (rede bloqueada) → `FAILED/PROVIDER_ERROR`; a chave não aparece em `results.json` nem em `evaluation.md` |
| real com chave válida | **0** | pendente (sem chave/rede) |

## 6–8. Sucesso / falha / rejeições
Com provedor real: **sem dados**. No ensaio, 100 % de sucesso por construção: o provedor falso monta respostas válidas. As rejeições foram exercitadas com respostas maliciosas determinísticas (testes).

## 9. Latência
Provedor real: sem dados. A separação já está instrumentada: `contextMs` (montagem do contexto, medida na action) ≠ `durationMs` (provedor, todas as tentativas). Os dois campos vão para o log e para as métricas.

## 10. Consumo
Tokens de entrada e saída são somados quando o fornecedor informa `usage`. Quando não informa, fica null e é contado em `usageMissing`. Sem chamada real: sem dados.

## 11. Custo estimado
**Não informado**: não há dado real. Só é calculado com tokens reais e preço configurado pelo operador; sem isso, `null`.

## 12. Cache
30 min por aluno. A chave combina versão do prompt, modelo e entrada; o id do aluno fica no prefixo.

O que os testes e o ensaio verificaram:
- a 1ª chamada vai ao provedor e a 2ª vem do cache;
- dado novo gera nova análise;
- outro aluno não reaproveita a análise;
- saída cortada ou rejeitada não entra no cache.

A análise depende só da entrada. Se um estudo, simulado, meta ou revisão muda a entrada, a análise é refeita. Se não muda nada do que vai ao modelo, a análise anterior continua correta para aqueles fatos.

## 13. Deduplicação
Duplo clique, duas abas, duas chamadas simultâneas e reload durante a chamada compartilham a mesma chamada em andamento: uma ida ao provedor, e a segunda não gasta cota.

Limitação: vale **por instância**. Não foi criada solução distribuída.

## 14. Rate limit
Janelas por aluno de 4/h e 12/24 h, e 60/24 h no total. Negar não chama o provedor e não consome cota. A mensagem diz se o limite é da hora, do dia ou o total. Um 429 do fornecedor não é repetido.

## 15. Fallback
Todos viram status e nenhum deixa a tela presa:
- timeout, 429, 500 (com 1 nova tentativa), 4xx e vazio;
- JSON inválido, schema inválido e saída cortada;
- resposta com número, causa ou ação.

O cliente tem um vigia de 75 s, acima do pior caso do servidor (2 × 30 s + 0,8 s). A mensagem padrão é *"Não foi possível gerar a análise agora. Seus dados continuam disponíveis na visão determinística do Mentor."*

## 16. Segurança
- **Aluno A não consegue pedir o contexto de B:** a action não tem parâmetro, o contexto e o acesso usam a sessão e o cache é separado por aluno.
- **Manipular candidateId, evidenceId ou disciplineRef:** a resposta é rejeitada.
- **Manipular o user id:** não existe entrada para isso.
- **Bundle:** 0 ocorrências de `MENTOR_AI_API_KEY`, `MENTOR_AI_PILOT`, `chat/completions`, `max_completion_tokens` ou do prompt em `.next/static`. As 3 ocorrências de "sk-" são nomes de classe CSS (`mask-…`).
- **Escrita:** a IA continua sem nenhum caminho de escrita.

## 17. Privacidade
Entrada revisada: os cenários do piloto não têm uuid, id do aluno, e-mail nem nome do concurso. Disciplinas vão como `D…` + nome.

Nomes de disciplina e de ciclo são dados do próprio aluno e vão como **dados**. A candidata v2 manda tratá-los como dados, e o validador rejeita o efeito de instruções escondidas neles.

Os logs têm só metadados. O script grava respostas apenas de contextos sintéticos, em `pilot-runs/` (fora do git).

## 18. Qualidade observada
**Nenhuma resposta real para avaliar.** A rubrica de 10 critérios e as metas estão prontas, e o script gera a planilha por resposta (`evaluation.md`).

## 19. Problemas encontrados
1. **mentor-v1 tem contradição:** a regra 5 ("refira-se a disciplinas pelas referências D…") choca com a regra 3 (sem algarismos). Um modelo obediente seria rejeitado.
2. Nomes de disciplina com algarismos, que o próprio aluno digita, derrubam respostas que citam o nome.
3. Nomes e textos da entrada podem carregar instruções (prompt injection pelo próprio aluno).
4. **Bug no teto da entrada:** cortar uma disciplina citada deixava um `D…` órfão nos insights, e uma resposta correta era rejeitada.
5. O timeout do adapter não cobria a leitura do corpo.
6. Modelos de raciocínio recusam `max_tokens`/`temperature` (400). Saída cortada (`finish_reason: length`) virava "JSON inválido" sem diagnóstico.
7. Não havia tokens, custo, `finish_reason`, status HTTP nem código de erro nos logs. Contexto e provedor não eram separados.
8. Sem limite diário nem global: a cota por hora sozinha não fecha o custo.
9. A G2.16 mostrava o bloco "IA desligada" para todos e não tinha restrição por aluno.
10. O validador aceitava datas por extenso ("de outubro") e quantificações ("o dobro").
11. Sem vigia no cliente: se a resposta nunca chegasse, o painel ficaria em "carregando".
12. Ambiente: sem chave e com a rede bloqueada para LLMs. Não dá para validar o provedor real daqui.

## 20. Correções
- 1–3: candidata **mentor-v2**, sem ativar ([avaliação](./mentor-ai-evaluation.md)).
- 4: o teto agora corta primeiro as não citadas e limpa a referência.
- 5–6: o timeout cobre o corpo; há `MENTOR_AI_API_STYLE`; saída cortada é descartada como `truncated`.
- 7: logs e métricas ampliados, ainda só com metadados.
- 8: limites de 12/dia por aluno e 60/dia no total.
- 9: allowlist; o bloco só aparece para o piloto.
- 10: validador endurecido.
- 11: vigia de 75 s.
- 12: runbook e script para rodar no computador do operador.

## 21. mentor-v2
**Proposta, não ativada.** Há motivos concretos (problemas 1–3, mais campos obrigatórios), cada um com teste. `MENTOR_PROMPT_VERSION` continua `mentor-v1`.

Próximo passo: rodar `--real --prompt=both --max-calls=20`, comparar a taxa de rejeição e a rubrica, e só então promover.

## 22. Limitações
- Cache, dedupe, limites e métricas ficam em memória, por instância, e o reinício zera.
- Na Vercel, trocar uma variável exige deploy. O corte imediato é revogar a chave.
- A validação de linguagem é por padrões.
- O tempo de montar o contexto só será medido com tráfego real (`contextMs`).
- `mentor_history` continua preservada (5 linhas) e o feed antigo só redireciona.

## 23. Próximos passos
1. Operador: colocar chave e modelo em `.env.local` e rodar `npx tsx --env-file=.env.local scripts/mentor-ai-pilot.ts --real --prompt=both --max-calls=20`.
2. Preencher `evaluation.md` e decidir v1 × v2.
3. Configurar produção com 1–3 uuids e acompanhar os logs `[mentor-llm]` por uma semana (runbook §5–6).
4. Fase seguinte: promover a v2 (se aprovada) e decidir se é preciso estado compartilhado (cache/limite) antes de ampliar o piloto.

## Comandos

| comando | resultado |
|---|---|
| `npm test` | **2321 pass, 0 fail** (424 suítes; G2.16: 2291 → +30 em `mentor-pilot-g2-17.test.ts`) |
| `npx tsc --noEmit` | 0 erros |
| `npm run build` | OK (`/mentor`, `/dashboard/mentor` dinâmicas) |
| `npx eslint` (arquivos da fase + script) | 0 problemas |
| `npm audit --omit=dev` | 3 moderate: mammoth 1.12.1 → argparse 1.0.10 → sprintf-js. Sem versão corrigida (faixa `*`); a mammoth 1.13.0 ainda usa argparse ~1.0.3. Só o CLI do mammoth usa o argparse. **Risco residual**, sem upgrade cego |
| `npm audit` | 10 (6 moderate, 4 high): os acima + dev (`@next/eslint-plugin-next`, `@capacitor/cli`), que só se corrigem com versão major. `npm audit fix --force` **não** executado |
| `package-lock.json` | inalterado |
