# ⏱️ Módulo 03 — Sessão de Estudos & Cronômetro

## 🎯 Objetivo
Fornecer um temporizador de horas líquidas de alta precisão com suporte a pausa, detecção de inatividade e avaliação pós-sessão (questões, foco, energia e páginas/aulas lidas), garantindo que apenas o tempo efetivamente estudado seja contabilizado.

---

## 🔄 Fluxo do Usuário
1. O usuário clica em "Iniciar Sessão" (a partir do Dashboard, Ciclo ou Botão Flutuante global FAB).
2. Seleciona a disciplina, o assunto específico e o tipo de material (PDF, Vídeo, Questões, Revisão).
3. Na fase de SETUP, informa seu nível inicial de foco e energia (escala 1 a 5).
4. O timer inicia a contagem de tempo líquido.
5. Durante o estudo, o usuário pode pausar, retomar ou minimizar o timer.
6. Em caso de inatividade prolongada sem movimento, o sistema pausa o timer e avisa o usuário.
7. Ao clicar em "Encerrar", o usuário vai para a fase de EVALUATION: digita a quantidade de questões feitas, acertos, páginas lidas ou videoaulas assistidas, além do foco e energia finais.
8. O sistema calcula a variação e exibe o resumo com a pontuação IGA e feedback imediato.

---

## 🧱 Componentes
- `ActiveSessionRunner`: Componente mestre de execução da sessão (fases SETUP, ACTIVE, EVALUATION, SUMMARY).
- `SmartTimerDisplay`: Exibição do tempo líquido decorrido em dígitos grandes (`HH:MM:SS`).
- `InactivityWarningBanner`: Alerta sonoro/visual quando detectada inatividade.
- `PostSessionEvaluationModal`: Formulário de fechamento da sessão.
- `ActiveSessionManager` (FAB): Botão flutuante global que persiste o estado do timer na navegação.

---

## 📝 Campos
- `discipline_id`: UUID
- `subject_id`: UUID (opcional)
- `study_source`: ENUM ('PLAN', 'FREE', 'REVIEW', 'SIMULADO', 'QUESTOES', 'VIDEO', 'PDF')
- `planned_minutes`: inteiro
- `duration_minutes`: inteiro (tempo líquido gravado)
- `started_at`: timestamp
- `finished_at`: timestamp
- `energy_level` (inicial e final): 1 a 5
- `focus_score` (inicial e final): 1 a 5
- `questions_answered`: inteiro
- `correct_answers`: inteiro
- `material_progress`: string (ex: "Pág 15 a 40" ou "Vídeo 03 a 05")
- `notes`: texto livre

---

## 🔘 Botões
- `[Iniciar]` -> Começa a contagem do timer e abre sessão no banco.
- `[Pausar]` -> Interrompe temporariamente o relógio líquido.
- `[Retomar]` -> Continua a contagem de onde parou.
- `[Encerrar]` -> Para o timer e avança para a tela de avaliação.
- `[Salvar Sessão]` -> Envia os dados finais e atualiza o histórico e gráficos.

---

## 🔍 Filtros
- N/A (Módulo de Execução).

---

## ⚙️ Regras de Negócio
- Tempo mínimo para validar uma sessão no histórico: 5 minutos. Sessões com menos de 5 minutos podem ser descartadas sem salvar.
- A detecção de inatividade dispara após 10 minutos sem interação do usuário (configurável).
- Se a página for atualizada ou o navegador fechado acidentalmente, o estado do timer DEVE ser recuperado através do `localStorage` / `ActiveSessionManager`.
- Ao finalizar uma sessão vinculada a um item do ciclo, esse item é marcado como concluído e o ciclo avança.

---

## 🔗 Dependências
- Módulo de Disciplinas (`disciplines`)
- Módulo de Histórico de Estudos (`study_history`)
- Hook de Timer (`use-smart-timer.ts`)
- Server Actions (`study-history.actions.ts`, `study-session.actions.ts`)

---

## 🗄️ Banco de Dados Utilizado
- `study_history`
- `profiles`
- `user_disciplines`

---

## 🌐 APIs Utilizadas
- `startStudySessionAction()` -> Cria o registro inicial na tabela `study_history`.
- `finalizeSmartSessionAction()` -> Atualiza o registro com tempo final, foco, energia e questões.

---

## 📈 Status Atual no Projeto
- ✅ Máquina de estados completa no `ActiveSessionRunner.tsx`.
- ✅ Hook `useSmartTimer` com suporte a `localStorage` e inatividade.
- ✅ Inserção e finalização via Server Actions implementadas.
- ✅ FAB flutuante de recuperação de sessão ativa.
- 🔴 FALTANTE: Input específico de progresso de páginas/vídeos (ex: "Leitura pág X a Y").
- 🔴 FALTANTE: Seleção granular do assunto (tópico) do edital antes de iniciar o timer.

---

## 🚧 O que falta implementar
1. Adicionar campo de seleção de Assunto (Subject) na fase de SETUP da sessão.
2. Adicionar campos de registro de páginas lidas / aulas assistidas no formulário de encerramento.
3. Notificação sonora ao atingir o tempo planejado.

---

## 🎯 Prioridade
**P0 (Crítico para equivalência com o Estudei)**

---

## ✅ Critérios de Aceite
- O temporizador conta o tempo com precisão em segundo plano.
- O aluno pode pausar e retomar a qualquer momento.
- Ao salvar a sessão, as horas estudadas são imediatamente computadas no Dashboard e nos Analytics.
- Se o navegador fechar, a sessão é recuperada ao reabrir.

---

## 📋 Checklist
- [x] Timer de tempo líquido com horas:minutos:segundos
- [x] Pausa e Retomada
- [x] Detecção automática de inatividade
- [x] Avaliação de foco (1-5) e energia (1-5)
- [x] Entrada de questões respondidas e acertos
- [x] Persistência em `localStorage` para recuperação contra reload
- [ ] Seleção de Assunto/Tópico específico do edital no setup
- [ ] Registro de páginas lidas e blocos de aulas assistidas
- [ ] Alerta sonoro/visual de conclusão de tempo planejado
