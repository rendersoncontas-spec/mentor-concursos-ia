# Mentor IA — runbook de operação (piloto)

Para quem liga, acompanha e desliga a análise por IA do `/mentor`. Arquitetura: [mentor-ai-llm-architecture.md](./mentor-ai-llm-architecture.md). Piloto: [g2-17-mentor-pilot.md](./g2-17-mentor-pilot.md).

## 1. Variáveis (somente servidor — nunca `NEXT_PUBLIC_`)

| variável | exemplo | observação |
|---|---|---|
| `MENTOR_AI_ENABLED` | `true` | kill switch; qualquer outro valor desliga |
| `MENTOR_AI_PROVIDER` | `openai-compatible` | único adapter |
| `MENTOR_AI_BASE_URL` | `https://api.openai.com/v1` | qualquer API no formato chat completions; precisa ser https |
| `MENTOR_AI_API_KEY` | (segredo) | só no servidor; nunca em chat, print, commit ou variável pública |
| `MENTOR_AI_MODEL` | (nome do modelo) | obrigatório, sem padrão |
| `MENTOR_AI_API_STYLE` | `classic` | `reasoning` para modelos que recusam `max_tokens`/`temperature` (erro 400 com código `unsupported_parameter`) |
| `MENTOR_AI_PILOT_USER_IDS` | `uuid1,uuid2` | allowlist obrigatória |
| `MENTOR_AI_MAX_CALLS_PER_HOUR` / `_PER_DAY` / `_PER_DAY_GLOBAL` | `4` / `12` / `60` | padrões do piloto |
| `MENTOR_AI_TIMEOUT_MS` | `15000` | manter abaixo do limite de duração da função na hospedagem |
| `MENTOR_AI_MAX_OUTPUT_TOKENS` | `900` | subir se aparecer `truncated` nos logs (modelos de raciocínio gastam tokens antes da resposta) |
| `MENTOR_AI_PRICE_INPUT_PER_MTOK` / `_OUTPUT_PER_MTOK` | `0.40` / `1.60` | opcional: preço USD por 1 M tokens **copiado da tabela do fornecedor**; sem os dois o custo fica `null` |

O id do aluno piloto é o uuid do usuário no Supabase (Authentication → Users). Não é o e-mail.

## 1.1 Conferir a configuração (G2.19)

```bash
npx tsx --env-file=.env.local scripts/mentor-ai-pilot.ts --check
```

Mostra cada variável como `definido`/`ausente`, **nunca o valor**. Diz `PRONTO` (modelo, host, estilo, timeout, teto de saída e se há preço) ou `DESLIGADO` com o motivo. Com `--real` e a configuração incompleta, o script cancela antes de qualquer chamada.

## 2. Ensaio local (sem custo)

```bash
npx tsx scripts/mentor-ai-pilot.ts
```

Usa provedor falso; confere cenários, cache, deduplicação, limite e falhas forçadas. Resultado em `pilot-runs/<data>-dry/` (fora do git).

## 3. Chamadas reais controladas (no seu computador)

1. Coloque as variáveis da seção 1 em `.env.local` (já ignorado pelo git).
2. Rode:
   ```bash
   npx tsx --env-file=.env.local scripts/mentor-ai-pilot.ts --real
   # comparar com a candidata:
   npx tsx --env-file=.env.local scripts/mentor-ai-pilot.ts --real --prompt=both --max-calls=20
   ```
3. Custo: no máximo `--max-calls` chamadas (padrão 12, teto 30). Cada nova tentativa conta. Contextos sintéticos — nenhum dado de aluno sai do computador.
4. Abra `pilot-runs/<data>-real/evaluation.md` e preencha a rubrica ([mentor-ai-evaluation.md](./mentor-ai-evaluation.md)). `results.json` tem latência, tokens, `finish_reason`, motivos de rejeição e a resposta bruta.

## 3.1 Contexto real, sem exportar dados (G2.19)

Para avaliar a análise sobre **dados reais** sem copiar dados de aluno para arquivos:

1. No seu computador, `.env.local` com as variáveis da seção 1 e `MENTOR_AI_PILOT_USER_IDS=<seu uuid>`.
2. `npm run dev`, entrar com a **sua** conta e abrir `/mentor` → "Gerar análise".
3. O contexto é montado no servidor a partir dos seus registros, só leitura, com a mesma minimização do piloto (sem nome, e-mail, ids e concurso). Nada é gravado e o log só tem metadados.
4. Avaliar na tela com a rubrica e anotar fora do repositório.

Se a conta tiver poucos dados (contexto EMPTY/LOW), registre isso: o resultado esperado é "dados insuficientes" ou uma análise limitada, sem invenção.

## 4. Ligar para alunos piloto (produção)

1. Rodar a seção 3 e ter taxa de rejeição aceitável (ver seção 6).
2. Na hospedagem (ex.: Vercel → Settings → Environment Variables, ambiente Production), cadastrar as variáveis da seção 1 como **não públicas**. Começar com 1–3 uuids.
3. Fazer o deploy (na Vercel, variável nova só vale em novo deploy).
4. Entrar com um aluno piloto → `/mentor` → "Gerar análise". Entrar com um aluno fora da lista → o bloco não aparece.

## 5. Acompanhar

Logs do servidor com prefixo `[mentor-llm]` (um JSON por pedido, só metadados):

| campo | uso |
|---|---|
| `outcome` | `success`, `cache_hit`, `rejected`, `invalid_json`, `truncated`, `timeout`, `provider_rate_limited`, `provider_error`, `local_rate_limited` |
| `durationMs` / `contextMs` | tempo do provedor × tempo de montar o contexto |
| `inputTokens` / `outputTokens` / `estimatedCostUsd` | só quando o fornecedor informa (e com preço configurado) |
| `httpStatus` / `errorKind` / `providerErrorCode` | diagnóstico de erro sem mensagem livre |
| `rejectionCount`, `limitScope`, `finishReason`, `promptVersion`, `contextVersion`, `model` | — |

Nunca aparecem: chave, prompt, resposta, e-mail, id ou nome do aluno.

## 6. Quando agir

| sinal | ação |
|---|---|
| `rejected` + `invalid_json` > 30 % das respostas | investigar no script de piloto (motivos em `results.json`); corrigir prompt via nova versão. **Não** relaxar o validador |
| `truncated` > 0 | subir `MENTOR_AI_MAX_OUTPUT_TOKENS`; se for modelo de raciocínio, `MENTOR_AI_API_STYLE=reasoning` |
| `provider_error` com `httpStatus` 400 e `unsupported_parameter` | trocar `MENTOR_AI_API_STYLE` |
| `provider_error` 401/403 | chave inválida/revogada |
| `timeout` > 10 % | modelo lento: avaliar outro modelo antes de subir o timeout |
| `provider_rate_limited` frequente | limite da conta no fornecedor; baixar `MENTOR_AI_MAX_CALLS_PER_DAY_GLOBAL` |
| custo diário acima do esperado | baixar `_PER_DAY_GLOBAL`; conferir `cache_hit` |
| qualquer suspeita de vazamento ou ação indevida | **desligar** (seção 7) e abrir incidente |

## 7. Desligar

| como | efeito | tempo |
|---|---|---|
| revogar a chave no painel do fornecedor | toda chamada falha (401) → aluno vê o fallback | imediato, sem deploy |
| `MENTOR_AI_ENABLED=false` (ou apagar a chave) + deploy | bloco some para todos; action devolve `DISABLED` | próximo deploy |
| tirar o uuid de `MENTOR_AI_PILOT_USER_IDS` + deploy | só aquele aluno perde o acesso | próximo deploy |

Desligar não afeta nada do resto do site: o Mentor determinístico, estatísticas, ciclo e revisões não dependem da IA. A IA nunca escreveu no banco — não há o que desfazer.

## 8. Incidente (registro mínimo)

Data/hora · sintoma · `outcome`/`httpStatus` dos logs · ação tomada · se houve desligamento · próximo passo. Não colar respostas ou prompts de alunos no registro.
