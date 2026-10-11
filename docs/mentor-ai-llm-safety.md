# Mentor IA com LLM — segurança e privacidade (G2.16)

## O que o modelo NÃO pode fazer (garantido pela arquitetura, não só pelo prompt)

| risco | barreira |
|---|---|
| escrever no banco / alterar ciclo, revisões, plano, metas | o modelo não tem ferramenta; a action e o serviço não fazem insert/update/delete (teste) |
| decidir identidade de disciplina | disciplinas só por referência `D…` gerada pelo servidor; referência fora do conjunto ou trocada → rejeitada |
| inventar recomendação | `candidateId` precisa ser um `R…` do pedido; `evidenceIds` só `I…`/`R…` do pedido |
| inventar número | qualquer algarismo, `%` ou número por extenso com unidade no texto → rejeitada; números exibidos vêm do contexto |
| afirmar causa | padrões causais ("causou", "por causa de", "graças a", "fez com que", "resultou"…) → rejeitada |
| fingir ação | "agendei", "alterei", "salvei"… → rejeitada |
| datas e quantificações sem algarismo (G2.17) | meses por extenso, "o dobro", "triplicou" → rejeitada |
| instrução escondida em nome de disciplina/ciclo (G2.17) | o efeito (número, ação, causa) é rejeitado; a candidata `mentor-v2` também manda tratar esses textos como dados |
| excesso de confiança | qualidade LOW/EMPTY exige `confidence: "low"`; EMPTY não chama o modelo |
| campos/formatos inesperados | schema estrito (zod `strictObject`), tamanhos máximos |
| resposta perigosa "consertada" | não há conserto: resposta inválida é descartada inteira |

## Dados enviados ao provedor (`MentorLLMInput`)

Enviado: versão do prompt/contexto, data de hoje, nível de qualidade e motivos, status das seções, dias até a prova, até 15 disciplinas (referência, nome, minutos em 28 dias, nº de simulados, média, variação), insights (tipo, prioridade, referência da matéria, frase factual, evidência numérica) e candidatas (tipo, prioridade, motivo, evidência).

**Não** enviado: id do aluno, nome, e-mail, ids internos (uuid), nome/data do concurso, tokens, cookies, chaves, service role, dados administrativos, dados de outros alunos, histórico bruto de sessões.

## Identidade e ownership

- A action não recebe parâmetro: o aluno é o da sessão no servidor (`getEffectiveSessionUser`). Um `userId` vindo do cliente não tem por onde entrar.
- Em **modo suporte**, a análise por IA é bloqueada.
- G2.17: só alunos da allowlist `MENTOR_AI_PILOT_USER_IDS` (verificada no servidor com o id da sessão). O navegador não tem como se declarar piloto.
- O cache é chaveado pelo aluno: a análise de A nunca é servida a B (teste).
- RLS continua valendo em todas as leituras do contexto.

## Segredos

- Chave só em `MENTOR_AI_API_KEY` (servidor). Nenhuma variável `NEXT_PUBLIC_` do Mentor.
- O componente cliente não importa configuração, runtime ou adapter (teste); o build foi conferido: nenhum chunk de `.next/static` contém a variável, o endpoint ou o prompt.
- O adapter não inclui a chave em mensagens de erro (teste) e não registra nada.

## Logs

Somente metadados: provedor, modelo, versões do prompt e do contexto, desfecho, duração do provedor e do contexto, tentativas, tamanho da entrada/saída, tokens e custo (quando informados), status HTTP, tipo de erro, código curto do fornecedor (saneado), `finish_reason`, nº de motivos de rejeição, escopo do limite. Sem prompt, sem resposta, sem nome de matéria, sem id do aluno (teste).

## Indisponibilidade

Desligado, sem chave, timeout, 429, 4xx, 5xx, JSON inválido ou resposta rejeitada → a tela mostra o motivo em linguagem simples e o Mentor determinístico continua completo.
