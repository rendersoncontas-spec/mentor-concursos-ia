# Mentor IA com LLM — arquitetura (G2.16)

```
Banco → serviços determinísticos → StudentMentorContext (G2.15)
      → buildMentorLLMInput (mínimo, com referências I/R/D)
      → MentorLLMProvider (porta)  ← OpenAICompatibleMentorProvider (adapter único) | FakeMentorLLMProvider (testes)
      → parseMentorAIText → validateMentorAIResponse (schema + referências + conteúdo)
      → MentorAnalysisView (fatos do sistema + texto da IA) → /mentor
```

## Arquivos

| camada | arquivo |
|---|---|
| contrato (sem HTTP) | `src/domain/mentor/mentor-ai.ts` — tipos, `MentorLLMProvider`, `MentorLLMError`, `MENTOR_PROMPT_VERSION = "mentor-v1"` |
| entrada mínima | `src/application/mentor-llm/mentor-llm-input.ts` |
| prompt versionado | `src/application/mentor-llm/mentor-ai.prompt.ts` |
| validação | `src/application/mentor-llm/mentor-ai-response.validator.ts` |
| serviço (agnóstico) | `src/application/mentor-llm/mentor-analysis.service.ts` — cache, em andamento, limite, retry, métricas |
| configuração (servidor) | `src/application/mentor-llm/mentor-llm.config.ts` |
| montagem do provedor | `src/application/mentor-llm/mentor-llm.runtime.ts` |
| adapter | `src/application/mentor-llm/openai-compatible.provider.ts` |
| Server Action | `src/application/mentor-llm/mentor-analysis.action.ts` — `requestMentorAnalysisAction()` |
| provedor falso | `src/lib/testing/fake-mentor-llm-provider.ts` |
| UI | `src/features/mentor/components/mentor-analysis-panel.tsx` (cliente) em `/mentor` |

## Provedor

Não havia SDK, cliente de IA, prompt nem variável de IA no projeto (o "Mentor IA" antigo era só heurística). Decisão: **nenhuma dependência nova** — um adapter mínimo via `fetch` para o formato *chat completions* compatível com OpenAI (atende OpenAI e outros fornecedores que expõem esse formato via `MENTOR_AI_BASE_URL`), com `response_format: json_object`, `temperature 0.2` e `max_tokens`. Trocar de fornecedor = novo adapter que implementa `MentorLLMProvider`; o domínio e o serviço não mudam. Um único provedor ativo por vez.

## Configuração (somente servidor)

Lista completa e operação: [runbook](./mentor-ai-production-runbook.md). Resumo:

| variável | padrão | regra |
|---|---|---|
| `MENTOR_AI_ENABLED` | desligado | só `"true"` liga (kill switch) |
| `MENTOR_AI_PROVIDER` | `openai-compatible` | outro valor desliga |
| `MENTOR_AI_BASE_URL` | `https://api.openai.com/v1` | precisa ser https |
| `MENTOR_AI_API_KEY` | — | obrigatório; nunca `NEXT_PUBLIC_` |
| `MENTOR_AI_MODEL` | — | obrigatório (sem modelo padrão) |
| `MENTOR_AI_API_STYLE` | `classic` | `reasoning` = `max_completion_tokens`, sem `temperature` (G2.17) |
| `MENTOR_AI_PILOT_USER_IDS` | vazio | allowlist obrigatória (G2.17); vazia = ninguém |
| `MENTOR_AI_TIMEOUT_MS` | 15000 | 2000–30000 |
| `MENTOR_AI_MAX_OUTPUT_TOKENS` | 900 | 200–4000 |
| `MENTOR_AI_MAX_CALLS_PER_HOUR` | 4 | por aluno, 1–30 (G2.17: era 6) |
| `MENTOR_AI_MAX_CALLS_PER_DAY` | 12 | por aluno, 1–100 (G2.17) |
| `MENTOR_AI_MAX_CALLS_PER_DAY_GLOBAL` | 60 | total por instância, 1–2000 (G2.17) |
| `MENTOR_AI_PRICE_INPUT_PER_MTOK` / `_OUTPUT_PER_MTOK` | — | opcional; sem os dois, custo `null` (G2.17) |

Faltou algo → desligado (com motivo interno), sem erro na tela. A página só recebe `aiAvailable: boolean` (flag + sessão + suporte + allowlist, resolvidos no servidor).

## Fluxo da chamada

1. Clique em "Gerar análise" (nunca no render, navegação ou digitação).
2. Action: manutenção? flag? aluno da sessão; **modo suporte bloqueia**; aluno fora da allowlist do piloto → `DISABLED` (G2.17) (o operador não envia dados do aluno a terceiros); contexto G2.15 do mesmo aluno.
3. Serviço: contexto `EMPTY` → `INSUFFICIENT_DATA` sem chamar; chave `aluno:sha256(versão|modelo|entrada)`; cache (30 min) → resposta; chamada em andamento com a mesma chave → reaproveitada (duplo clique, duas abas, reload); limites por aluno/hora, aluno/24 h e total/24 h (só chamadas reais contam; G2.17).
4. Provedor com timeout (AbortController). Nova tentativa **uma vez**, após 800 ms, só para 5xx/rede. Timeout, 429, 4xx e resposta vazia não repetem.
5. Saída cortada (`finish_reason: length`) → descartada (G2.17). JSON (teto bruto de 16 mil caracteres, G2.18) → schema estrito da versão → referências → conteúdo (referência ≠ número, G2.18) → fidelidade (contradição, seção sem dados) → **qualidade** (`GENERIC_LOW_VALUE` é descartada, G2.18). Inválida = descartada (`FAILED / INVALID_RESPONSE`).
6. Resposta resolvida: cada destaque/recomendação vira **Dado do sistema** (frase do sistema) + **Mentor (IA)/Sugestão (IA)**; no texto da IA, `D…` vira a denominação oficial e `I…/R…` um marcador com o fato (G2.18). Só sucesso entra no cache.

## Cache e invalidação

A chave depende da entrada inteira (fatos, números, nomes, qualidade, hoje, versão do prompt e modelo). Estudo novo/removido, simulado criado/alterado/excluído, revisão, meta ou nome de disciplina mudam o contexto → a chave muda → nova análise. O contexto vem do payload das Estatísticas, que já é invalidado nessas ações. Análise nunca é servida para outro aluno (o id faz parte da chave). Sem persistência em banco.

## Limites de custo

Entrada ≤ 12.000 caracteres (até 15 disciplinas, cortadas pelas menos relevantes), saída ≤ `MAX_OUTPUT_TOKENS`, no máximo 2 tentativas, `MAX_CALLS_PER_HOUR` por aluno, cache de 30 min, chamada só por clique.

## Observabilidade

`getMentorLLMMetrics()` (memória do processo): chamadas, sucessos, falhas, timeouts, 429 do provedor, erros do provedor, rejeitadas, JSON inválido, cortadas, cache hit/miss, limite local, tempo do provedor × tempo do contexto, tokens de entrada/saída (só os informados), custo estimado (só com preço configurado), taxa de rejeição (G2.17). Log `[mentor-llm]` por chamada com metadados: provedor, modelo, versão do prompt, desfecho, duração, tentativas, tamanhos e nº de motivos de rejeição. Nunca prompt, resposta, chave ou dado do aluno.

## Feed antigo

`/dashboard/mentor` agora só faz `redirect("/mentor")`; `MentorAIService` está `@deprecated` e `IntelligenceConfig.saveHistory = false`. A tabela `mentor_history` (5 linhas, 2 alunos, julho/agosto, provedor HEURISTIC) não é lida por nenhuma tela e não foi apagada.

## Limitações

- Cache, limite e chamadas em andamento são **por instância** (memória). Em vários servidores, o limite por aluno vale por instância.
- O validador rejeita números e afirmações causais por padrões; números por extenso fora da lista e nomes de matérias inventados em texto livre não são 100% detectáveis — por isso fatos e números sempre vêm do sistema, e matérias só por referência.
- Adapter real não foi exercitado contra um fornecedor nesta fase (sem chave); coberto por testes com `fetch` falso.
