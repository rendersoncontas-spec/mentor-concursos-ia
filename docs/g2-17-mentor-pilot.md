# G2.17 — Piloto controlado do Mentor IA

Base: G2.16 ([arquitetura](./mentor-ai-llm-architecture.md), [segurança](./mentor-ai-llm-safety.md)). Nada da G2.16 foi recriado ou afrouxado: validador, referências, bloqueio de números/causalidade/IDs inventados, fallback e limites continuam — alguns ficaram **mais** rígidos.

Operação: [runbook](./mentor-ai-production-runbook.md) · Avaliação: [mentor-ai-evaluation.md](./mentor-ai-evaluation.md) · Relatório: [g2-17-mentor-pilot-report.md](./g2-17-mentor-pilot-report.md)

## Quem pode usar

| condição | resultado |
|---|---|
| `MENTOR_AI_ENABLED` ≠ `true`, sem chave ou sem modelo | ninguém (kill switch) |
| aluno fora de `MENTOR_AI_PILOT_USER_IDS` | Mentor determinístico normal; o bloco de IA **não aparece** |
| aluno na allowlist em **modo suporte** | bloqueado ("não roda no modo suporte") |
| aluno na allowlist, sessão normal | pode pedir a análise (clique) |

- Allowlist **obrigatória** (uuids separados por vírgula; inválidos ignorados; vazia = ninguém). Não existe modo "todos" nesta fase — liberar geral exige mudança de código deliberada.
- O aluno é sempre o da **sessão no servidor** (`getEffectiveSessionUser`). A action não recebe parâmetro; a página recebe só um booleano (`isMentorAIAvailableForSessionUser`, módulo de servidor que **não** é Server Action).
- Admin/moderador não consegue pedir análise "como outro aluno": em modo suporte a IA é bloqueada; fora dele, só vale o próprio id.

## Limites do piloto (por instância)

| limite | padrão | faixa |
|---|---|---|
| chamadas por aluno / hora | 4 | 1–30 |
| chamadas por aluno / 24 h | 12 | 1–100 |
| chamadas totais / 24 h | 60 | 1–2000 |
| timeout por tentativa | 15 s | 2–30 s |
| saída máxima | 900 tokens | 200–4000 |
| tentativas | 2 (nova tentativa só para 5xx/rede, 800 ms) | fixo |

Negar por limite não consome cota e não chama o provedor. 429 do fornecedor **não** é repetido. Cache e chamada em andamento não gastam cota.

## O que mudou no código

| área | mudança | motivo |
|---|---|---|
| config | allowlist, limites diário/global, `MENTOR_AI_API_STYLE`, preço opcional | piloto restrito, trava de custo, compatibilidade com modelos de raciocínio, custo só com dado real |
| acesso | `resolveMentorAIAccess` (flag → sessão → suporte → allowlist) | uma regra só, usada pela página e pela action |
| adapter | timeout cobre a leitura do corpo; `usage` e `finish_reason`; código de erro curto e saneado; estilo `reasoning` (`max_completion_tokens`, sem `temperature`) | problemas que o provedor falso não mostrava |
| serviço | limites hora/dia/global; saída cortada (`finish_reason: length`) descartada; métricas de tokens, custo, cache miss, tempo de contexto × tempo do provedor; log com status HTTP, tipo de erro, código do fornecedor | observabilidade do piloto sem conteúdo |
| entrada | teto de tamanho não deixa `D…` órfão (antes uma resposta correta podia ser rejeitada) | bug encontrado na revisão |
| validador | rejeita também meses por extenso e quantificações ("o dobro", "triplicou") | casos adversariais de datas/números sem algarismo |
| prompt | `mentor-v1` continua **ativa**; `mentor-v2` existe só como **candidata** (script de piloto) | contradição concreta na v1 — ver avaliação |
| UI | bloco só para piloto; textos de falha sem detalhe técnico; limite por hora/dia/total; vigia de 75 s no cliente | nunca preso no "carregando" |
| script | `scripts/mentor-ai-pilot.ts` (ensaio ou real, contextos sintéticos, teto de chamadas, saída em `pilot-runs/`, fora do git) | medir latência, rejeição, tokens e qualidade sem dados de aluno |

## Kill switch

`MENTOR_AI_ENABLED=false` (ou remover a chave) desliga **novas** chamadas: a configuração é lida a cada pedido no servidor e a página é dinâmica, então não há nada a "esconder" no bundle do cliente. Em hospedagem que só aplica variável em novo deploy (Vercel), a troca exige redeploy — o desligamento **imediato** sem deploy é revogar a chave no painel do fornecedor (toda chamada vira erro → fallback). Ver runbook.

## Limitações conhecidas

- Cache, deduplicação, limites e métricas são **por instância** (memória). Com várias instâncias, cada uma conta separado; reinício zera. Não há solução distribuída nesta fase (decisão da diretiva).
- Validação de linguagem por padrões: números por extenso fora da lista e informação "de fora" (ex.: fatos sobre a banca) não são 100% detectáveis — a avaliação humana cobre "fiel aos dados".
