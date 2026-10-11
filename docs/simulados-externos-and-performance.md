# Simulados externos e evolução de desempenho

Última revisão: 2026-10-03 (G2.10).

## 1. Objetivo

O módulo de Simulados do NomeIA é um **registro de simulados feitos fora da plataforma** (TEC, Gran, Estratégia, QConcursos, PDF, prova anterior…). O NomeIA não aplica questões: o aluno faz o simulado onde quiser, volta e registra o resultado. O produto é:

**registro → histórico → evolução → análise por disciplina → gargalos**

## 2. O que é um simulado externo

Uma linha em `simulados` com `mode` **nulo** e `status = 'FINISHED'`. `mode` preenchido é reservado a um eventual simulador interno (hoje sem interface) — esses registros nunca aparecem nesta tela, nunca entram nos cálculos e não podem ser editados ou excluídos pelo formulário de registro.

## 3. Modelo de dados (schema real, conferido em produção)

`simulados` — `id` (uuid), `user_id`, `name`, `simulado_date` (date), `exam_board` (banca, obrigatória), `source` / `source_custom` (plataforma), `exam_name` (concurso), `role_name` (cargo), `total_questions`, `total_correct`, `total_wrong`, `total_blank`, `score_percentage`, `time_spent_seconds`, `notes`, `scoring_rule`, `penalty_per_wrong`, `penalty_score`, `net_score`, `net_percentage`, `created_at`, `updated_at`.

`simulado_disciplines` — `simulado_id` (FK, cascade), `user_id`, `discipline_id` (FK para `disciplines`, `ON DELETE SET NULL`), `discipline_name`, `questions_count`, `correct_count`, `wrong_count`, `blank_count`.

Nenhuma migration foi necessária: o schema já cobria tudo o que a fase pede. O percentual por disciplina não é gravado — é sempre calculado de `correct_count / questions_count`.

## 4. Cadastro

Formulário "Registrar simulado" (`simulado-record-modal.tsx`), dois modos:

- **Resultado geral**: total, acertos, brancos. Erros = total − acertos − brancos.
- **Por matéria**: uma linha por disciplina do catálogo (ou nome livre). Os totais do simulado são a soma das matérias.

A Server Action (`saveSimuladoRecordAction`) não confia no navegador. A validação (`simulado-record-validation.ts`, função pura) recalcula tudo o que é derivável e recusa:

| Regra | Mensagem |
|---|---|
| total < 1 ou > 1000 | "O simulado precisa ter pelo menos 1 questão." |
| acertos > total | "Acertos não podem passar do total de questões." |
| acertos + brancos > total | "Acertos + brancos não podem passar do total de questões." |
| erros enviados ≠ derivados | "Acertos + erros + brancos deve ser igual ao total de questões." |
| data inválida, inexistente (30/02), futura (fuso de São Paulo) ou antes de 2000 | mensagem específica |
| duração negativa ou acima de 24 h (0 = não informado) | "Tempo gasto inválido (máximo de 24 horas)." |
| matéria repetida (mesmo id, ou mesmo nome sem acento/caixa/espaços) | "A matéria X foi adicionada mais de uma vez." |
| matéria com id fora do catálogo visível ao usuário | "A matéria X não foi encontrada no catálogo." |
| fonte/regra de pontuação fora da lista | allowlist do domínio (também imposta por CHECK no banco) |

Detalhar por matéria é opcional: o resultado geral sozinho é um registro válido.

## 5. Gravação, edição, exclusão e idempotência

`simulado-record-persistence.ts`:

- **Criar** — o formulário gera um `requestId` (uuid) ao abrir e ele vira o `id` do simulado. Reenviar o mesmo formulário (retry depois de timeout, duplo envio) encontra o registro e o atualiza com os valores mais recentes; dois envios simultâneos colidem na chave primária e o perdedor devolve o mesmo id. Se a gravação das matérias falhar, o cabeçalho é desfeito — não fica simulado salvo pela metade.
- **Editar** — grava as matérias novas, depois o cabeçalho, e só então apaga as antigas. Falha em qualquer passo antes disso não altera nada (antes: apagava as matérias e, se o insert falhasse, o simulado ficava sem nenhuma).
- **Excluir** — só o próprio registro manual; nada removido = "Simulado não encontrado" (não finge sucesso).

## 6. Evolução geral (`computePanelStats`, `buildEvolutionPoints`)

- Ordem cronológica estável: data do simulado → momento do registro → id (`compareRecordsChronologically`). As funções ordenam sozinhas; não dependem de quem chama.
- **Média** = acertos somados ÷ questões somadas (ponderada: um simulado de 120 questões pesa mais que um de 10).
- **Melhor / pior / último / primeiro** — percentuais por simulado.
- **Primeiro → último** — diferença em p.p.; null com menos de 2 simulados.
- **Tendência** — só com 3+ simulados (`MIN_TREND_POINTS`): com 3, último vs primeiro; com 4+, média dos 3 mais recentes vs média dos anteriores. |Δ| ≤ 2 p.p. = estável. Com 2 simulados a tela mostra a variação e avisa que a tendência aparece a partir do 3º.
- Gráfico com eixo fixo 0–100%, um ponto por simulado registrado; nenhum ponto inventado. Com 0 ou 1 simulado o gráfico não aparece.

## 7. Evolução por matéria (`buildSubjectAnalysis`)

Por disciplina: média ponderada, primeiro, último, melhor, pior, evolução (último − primeiro), número de simulados em que aparece e tendência (mesma regra de 3+ pontos). Uma matéria ausente num simulado **não** vira 0% nele — o histórico só tem os simulados em que ela foi registrada. Lista ordenada da pior para a melhor média, desempate pelo nome. Na tela, cada matéria abre seu histórico.

## 8. Gargalos (`findBottlenecks`, sem IA)

Uma matéria com pelo menos 5 questões somadas é apontada quando:

- **abaixo da média**: média ≥ 5 p.p. abaixo da média geral;
- **baixo aproveitamento**: média < 60%;
- **queda recente**: último registro ≥ 5 p.p. abaixo do penúltimo.

O gargalo principal é o de menor média entre os apontados. Com menos de 2 simulados da matéria, o apontamento vem marcado "baseado em 1 simulado". Frase exibida (só números calculados): "Contabilidade — média 63%, abaixo da sua média geral de 75%".

## 9. Ownership

Toda leitura e escrita filtra por `user_id` derivado no servidor (`getEffectiveUserId`, nunca enviado pelo cliente) e por `mode` nulo. A RLS de `simulados` e `simulado_disciplines` exige `auth.uid() = user_id` em SELECT/INSERT/UPDATE/DELETE (conferida em produção, só leitura). Em modo suporte (admin vendo como aluno), leituras funcionam e escritas são bloqueadas pela RLS.

## 10. Limitações

- Edições simultâneas do mesmo simulado em duas abas podem, numa intercalação específica, deixar matérias duplicadas (não há chave única `(simulado_id, discipline_id)` no banco). O botão de salvar trava durante o envio; criar uma constraint exigiria migration e não foi necessário para o fluxo normal.
- A média geral é ponderada por questões; quem espera a média simples dos percentuais verá números ligeiramente diferentes em simulados de tamanhos muito diferentes.
- "Período" filtra pela data do simulado com o calendário do navegador.
- Nenhum `question_attempts` é criado a partir destes registros (são agregados; não há questões individuais). Essa tabela fica para um eventual banco de questões interno.

## 11. Futuro: cruzamento com estudos e Mentor IA

Os dados permitem cruzar sem mudar arquitetura: `simulado_disciplines.discipline_id` e `study_history.discipline_id` apontam para o mesmo catálogo (no único simulado em produção, as 7 matérias têm `discipline_id`). Uma próxima fase pode mostrar, por matéria, "horas estudadas entre dois simulados" ao lado da variação de desempenho — sempre como coincidência temporal, nunca como causa. Para o Mentor IA, as funções desta página (média, tendência, gargalos) são a base determinística; a IA só deveria narrar esses números, não recalculá-los.
