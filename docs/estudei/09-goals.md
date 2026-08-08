# 🎯 Módulo 09 — Metas, Desafios & Constância

## 🎯 Objetivo
Estimular a constância diária do estudante por meio da definição e acompanhamento de metas de horas líquidas (diárias e semanais), barra de progresso visual em tempo real e sistema de gamificação de sequência de dias (Streak).

---

## 🔄 Fluxo do Usuário
1. Durante o Onboarding ou na tela de Perfil, o aluno define sua meta de estudo (ex: 20 horas por semana ou 3 horas por dia).
2. No Dashboard, o aluno acompanha a **Barra de Progresso da Meta Semanal** (ex: "14h / 20h — 70%").
3. Acompanha também o **Contador de Streak (Dias Consecutivos)** com um ícone de fogo/chama indicando a sequência ininterrupta de estudos.
4. Ao atingir a meta semanal ou quebrar seu recorde de streak, o sistema exibe uma mensagem de celebração/conquista.

---

## 🧱 Componentes
- `WeeklyGoalProgressBar`: Barra de progresso com porcentagem e total de horas restantes para bater a meta semanal.
- `StreakCounterWidget`: Card destacado no Dashboard com o número de dias seguidos de estudo.
- `GoalSettingsModal`: Modal para alterar a meta de horas líquidas semanais/diárias.
- `AchievementCelebration`: Componente/Modal pop-up ativado quando uma meta é alcançada.

---

## 📝 Campos
- `weekly_study_hours` (em `profiles`): inteiro (ex: 20)
- `daily_study_hours_target`: decimal (calculado ou definido, ex: 3.5)
- `current_streak`: inteiro (dias seguidos)
- `longest_streak`: inteiro (recorde histórico de dias seguidos)
- `horas_cumpridas_semana`: decimal (calculado a partir de `study_history`)

---

## 🔘 Botões
- `[Ajustar Meta]` -> Abre modal para alterar as horas semanais planejadas.
- `[Compartilhar Conquista]` -> Gera imagem/card do streak para redes sociais.

---

## 🔍 Filtros
- N/A.

---

## ⚙️ Regras de Negócio
- A semana de estudos para a meta é computada de **Segunda-feira a Domingo**.
- Para pontuar 1 dia no **Streak**, o aluno deve registrar pelo menos 15 minutos de tempo líquido estudado no dia (`duration_minutes >= 15`).
- Se o aluno passar 24 horas sem registrar o tempo mínimo até as 23:59, o streak é zerado no dia seguinte.
- A porcentagem da meta é atualizada em tempo real ao salvar uma nova sessão de estudos.

---

## 🔗 Dependências
- Módulo de Autenticação e Perfil (`profiles`)
- Módulo de Sessão de Estudos (`study_history`)
- Engine Analítica de Metas (`goals.ts` em `application/study-analytics/`)

---

## 🗄️ Banco de Dados Utilizado
- `profiles` (campo `weekly_study_hours`)
- `study_history`

---

## 🌐 APIs Utilizadas
- `AnalyticsEngine.goals.getWeeklyGoalProgress(ctx, targetHours)` -> Retorna o percentual de cumprimento e horas restantes.
- `AnalyticsEngine.aggregations.getBase(ctx).consecutiveStreak` -> Retorna o streak atual.

---

## 📈 Status Atual no Projeto
- ✅ Campo `weekly_study_hours` cadastrado no onboarding e salvo na tabela `profiles`.
- ✅ Algoritmo de cálculo de streak e meta semanal desenvolvido em `application/study-analytics/goals.ts`.
- ✅ Widget `HabitTracker` e `KpiCards` exibindo o streak e o progresso no Dashboard.
- 🔴 FALTANTE: Interface dedicada para edição da meta semanal fora do onboarding.
- 🔴 FALTANTE: Modal de celebração ao atingir 100% da meta semanal.

---

## 🚧 O que falta implementar
1. Modal de edição rápida da meta semanal no perfil/dashboard.
2. Animação/Modal de celebração ao atingir a meta.

---

## 🎯 Prioridade
**P1 (Essencial para paridade com o Estudei)**

---

## ✅ Critérios de Aceite
- A barra de progresso da meta semanal atualiza imediatamente após o encerramento de cada sessão.
- O contador de streak incrementa corretamente a cada dia de estudo.
- O aluno pode alterar sua meta semanal a qualquer momento.

---

## 📋 Checklist
- [x] Salvamento da meta semanal no perfil do usuário
- [x] Algoritmo de cálculo de progresso de meta e streak
- [x] Visualização gráfica do streak no Dashboard
- [ ] Modal de edição simples da meta de horas
- [ ] Pop-up de comemoração ao completar a meta semanal
