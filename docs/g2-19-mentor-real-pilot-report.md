# G2.19 — Mentor IA: piloto real e comparação v1 × v2 — relatório

**Status: AMARELO (bloqueado por configuração).** O piloto real **não foi executado**. Na Fase 1, o `.env.local` não tem `MENTOR_AI_ENABLED`, `MENTOR_AI_API_KEY` nem `MENTOR_AI_MODEL`, e nenhuma das outras variáveis `MENTOR_AI_*` está definida. Por regra da diretiva, nada foi improvisado: nenhum outro provedor e nenhuma chamada real.

O que foi feito: ensaio, revalidação de segurança e preparação para que o piloto real, quando o operador rodar o comando, já produza a análise completa sem intervenção manual. Nenhum critério VERMELHO ocorreu.

## Mensagem operacional (o que falta)

```
MENTOR_AI_ENABLED=true                       ← obrigatório
MENTOR_AI_API_KEY=<chave do fornecedor>      ← obrigatório (só no .env.local)
MENTOR_AI_MODEL=<modelo>                     ← obrigatório
MENTOR_AI_BASE_URL=https://…/v1              ← se não for a OpenAI
MENTOR_AI_API_STYLE=reasoning                ← só para modelos de raciocínio
MENTOR_AI_PRICE_INPUT_PER_MTOK / _OUTPUT_PER_MTOK  ← opcional (sem isso, custo = null)
```

Depois, no terminal do projeto (rede do seu computador):

```
npx tsx --env-file=.env.local scripts/mentor-ai-pilot.ts --check
npx tsx --env-file=.env.local scripts/mentor-ai-pilot.ts --real --prompt=both --max-calls=20
```

Os ambientes de trabalho do Claude não alcançam os endpoints de LLM (rede bloqueada), então o piloto real precisa rodar no computador do operador.

## 1–3. Provider · model · versão
- **Provider:** `openai-compatible` (adapter único, `fetch`, sem SDK), não exercitado com fornecedor real nesta fase.
- **Modelo:** não configurado.
- **Versão ativa:** `mentor-v2`. A `mentor-v1` está disponível para comparação.

Adapter revisado (Fase 2):
- URL `${BASE_URL}/chat/completions`;
- `Authorization: Bearer` e `content-type: application/json`;
- timeout por AbortController, cobrindo também a leitura do corpo;
- `choices[0].message.content`, `usage.prompt_tokens/completion_tokens` e `finish_reason`;
- modo `reasoning` (`max_completion_tokens`, sem `temperature`);
- erros mapeados (429, 4xx, 5xx, vazio, timeout, rede) com código curto saneado.

Nada mudou no adapter nesta fase.

## 4–10. Chamadas · sucesso · falhas · rejeições · latência · tokens · custo
**Reais: 0.** Todas as métricas reais estão indisponíveis (null). Nada foi estimado.

Ensaio (Fase 3), comando exato da diretiva sem `--real`: `npx tsx --env-file=.env.local scripts/mentor-ai-pilot.ts --prompt=both --max-calls=5`.
- **Fixtures:** carregaram os 8 cenários.
- **Prompts:** os dois disponíveis.
- **Relatório:** `results.json` e `evaluation.md` criados em `pilot-runs/` (fora do git).
- **Segredos:** os 12 valores longos de `.env.local`/`.env.sentry-build-plugin` foram procurados nas saídas, com 0 ocorrências.
- **Bug encontrado (ver 19):** com teto 5, a v1 consumia todas as chamadas e a v2 ficava sem nenhuma.

Também confirmado:
- `--real` sem configuração cancela antes de qualquer chamada ("piloto real cancelado — configuração incompleta").
- `--check` lista as variáveis como `definido`/`ausente`, sem valores.

## 11. Cache
Sem chamada real. Coberto pelos testes com o provedor falso:
- mesmo contexto dá hit sem chamar o provedor;
- contexto alterado dá miss;
- v1 → v2 tem chave diferente (a versão do prompt faz parte da chave);
- o cache é por aluno.

O script real repete essas verificações nas seções `cache` e `cache-miss`.

## 12. Rate limit
Limites atuais do piloto: 4/h e 12/24 h por aluno; 60/24 h no total (por instância).

Nos testes, quando o limite nega, o provedor não é chamado, a cota não é consumida, a mensagem diz o escopo (hora/dia/total) e um 429 do fornecedor não é repetido. O script real faz um teste com limite 1/h, sem forçar o limite de produção.

## 13. Fallback
Os 13 cenários de falha do provedor falso viram `FAILED` sem exceção e sem cache:
- timeout, 429, 500 (com 1 nova tentativa), vazio;
- JSON inválido, schema inválido, resposta enorme, cortada;
- número, causalidade, injeção, referência inventada, genérica.

A UI mostra o Mentor determinístico, a mensagem padrão e o vigia de 75 s, sem código HTTP nem stack trace (teste de fonte do painel).

## 14. Segurança
- **Modo suporte:** a IA fica bloqueada (teste).
- **Fora da allowlist:** sem acesso; o bloco nem aparece (teste).
- **Action:** não recebe parâmetro do cliente.
- **Bundle:** `.next/static` não contém `MENTOR_AI_`, `chat/completions`, o prompt (`SEGURANÇA DA ENTRADA`, `Você é o Mentor`), `PILOT_USER_IDS` nem `pilot_budget`. O texto do painel foi encontrado, o que confirma que a busca rodou nos arquivos certos.
- **Chave:** em nenhum arquivo do repositório, documento, log ou relatório.

## 15. Privacidade
Contextos do piloto são sintéticos.

**Contexto real (Fase 14): não executado** (depende da configuração). Caminho definido para não exportar dados (runbook §3.1): rodar `/mentor` localmente com a própria conta na allowlist. O contexto é montado no servidor, só leitura, com a mesma minimização, e nada é gravado. Não foi criado nenhum fixture com dados reais.

Logs: só metadados (provider, model, versão, durações, status, códigos de rejeição, tokens e custo quando houver).

## 16. Qualidade
Sem respostas reais para avaliar. A planilha gerada pelo script tem rubrica 0/1/2 nas 8 dimensões (USEFULNESS só humana) e a pontuação heurística ao lado.

## 17. v1 × v2
**Não comparado com o modelo real.** O script agora monta sozinho a tabela `| Caso | V1 | V2 | Vencedor | Motivo |`. Ordem dos critérios:
1. segurança/fidelidade (passou no validador?);
2. qualidade heurística;
3. latência (só diferença ≥ 300 ms e ≥ 20 %);
4. tokens.

O vencedor fica marcado como provisório até a nota humana. No ensaio, a tabela e a decisão saem marcadas como "ENSAIO — não vale como evidência".

## 18. Decisão
**mentor-v2 continua oficial, em caráter provisório.** Não há evidência real contra ela, e a justificativa determinística da G2.18 continua válida (cobertura do contrato de 25/25 contra 5/25).

A regra da Fase 21 está implementada em `pilotDecision`. Ela manda **rever** a v2 em três casos:
- a rejeição da v2 passa a da v1 em mais de 15 pontos;
- a v1 vence mais casos (por mais de um);
- a v2 é 50 % mais lenta sem ganho.

## 19. Problemas encontrados
1. **Configuração ausente:** nenhuma variável `MENTOR_AI_*` no `.env.local`. É o bloqueio desta fase.
2. **Comparação desequilibrada no script:** com `--prompt=both`, a v1 rodava todos os cenários antes da v2. Com teto apertado, a v2 ficava sem chamadas (ensaio com `--max-calls=5`: v1 5 chamadas, v2 0).
3. **Teto contado como falha:** o fim do teto aparecia como `PROVIDER_ERROR` e inflava a contagem de falhas do provedor.
4. **Sem tempo de validação:** o tempo de parse/validação/qualidade não era medido; não dava para separar "provedor lento" de "validador lento".
5. **Rejeição sem categoria:** os motivos não vinham na categoria pedida pela diretiva e o script recebia só texto, não a rejeição estruturada.
6. **Sem análise automática:** não havia p50/p95, tabela v1 × v2 nem regra de decisão; a análise do piloto real seria manual.

## 20. Problemas corrigidos
- **2:** v1 e v2 agora rodam intercaladas por cenário, com cobertura igual se o teto acabar.
- **3:** o teto vira `SKIPPED_BUDGET`, verificado antes da chamada, e não conta como erro.
- **4:** o log e as métricas trazem `validationMs` separado de `durationMs` (provedor) e de `contextMs`.
- **5:** `classifyRejection` mapeia os códigos para as 10 categorias, e `onRejected` passa a rejeição estruturada (código + campo, sem o texto).
- **6:** `mentor-pilot-report.ts` traz `summarizeVersion` (p50 com ≥ 3 amostras, p95 com ≥ 20, null sem dado), `compareVersions` e `pilotDecision`. Há também o modo `--check` no script.

Nada do validador foi relaxado.

## 21. v2.1
**Não criada.** Não apareceu problema real do prompt; os problemas acima eram do script e da observabilidade.

## 22. Limitações
- Nenhuma métrica real.
- O vencedor por caso é heurístico até a avaliação humana.
- A comparação depende de o operador rodar o piloto no próprio computador.
- O cache, os limites e as métricas continuam em memória, por instância.

## 23. Próximos passos
1. Preencher o `.env.local` (seção "o que falta"), rodar `--check` e depois `--real --prompt=both --max-calls=20`.
2. Enviar o `results.json` (não contém chave nem dados de aluno) para a análise e a decisão final v1 × v2.
3. Opcional: contexto real pela UI local (runbook §3.1).
4. Só então decidir entre manter a v2, voltar à v1 ou criar uma v2.1 a partir de um problema concreto.

## Comandos

| comando | resultado |
|---|---|
| `npm test` | **2492 pass, 0 fail** (G2.18: 2459 → +33 em `mentor-pilot-report-g2-19.test.ts`) |
| `npx tsc --noEmit` | 0 erros |
| `npm run build` | OK (`/mentor` e `/dashboard/mentor` dinâmicas) |
| `npx eslint` (arquivos da fase) | 0 problemas |
| `npm audit --omit=dev` | 3 moderate (mammoth → argparse → sprintf-js; sem correção; risco residual) |
| `npm audit` | 10 (6 moderate, 4 high); `npm audit fix --force` **não** executado |

Dependências e lockfile inalterados.
