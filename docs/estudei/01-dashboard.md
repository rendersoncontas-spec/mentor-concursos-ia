# 📊 Módulo 01 — Dashboard Central

## 🎯 Objetivo
Fornecer ao estudante um painel centralizado de controle da sua rotina de estudos, permitindo que ele responda de forma imediata a duas perguntas essenciais: "O que preciso estudar agora?" e "Como está minha constância e desempenho geral?".

---

## 🔄 Fluxo do Usuário
1. O usuário acessa a aplicação e cai diretamente no Dashboard (`/dashboard`).
2. Visualiza os cards principais de KPI: Horas estudadas no dia/semana, streak de dias seguidos e meta de horas.
3. Observa o widget de **Próxima Matéria do Ciclo / Plano do Dia** e tem a opção de clicar em **"Iniciar Sessão"**.
4. Visualiza o widget de **Revisões Pendentes do Dia** com a quantidade de itens a revisar.
5. Acompanha o gráfico de constância (Heatmap) dos últimos 30 dias.
6. Acessa rapidamente atalhos para Edital Verticalizado e Histórico Recente.

---

## 🧱 Componentes
- `DashboardHeader`: Cumprimento personalizado + Data atual + Seletor de Concurso Ativo.
- `KpiCards`: Cards de tempo líquido estudado (Hoje, Semana, Mês), Streak de Dias e Acurácia.
- `TodayPlanCard` / `CycleNextCard`: Exibe a disciplina atual a ser estudada com tempo recomendado e atalho para iniciar timer.
- `PendingReviewsWidget`: Exibe resumo de revisões agendadas para hoje com botão "Iniciar Revisões".
- `HabitTracker`: Heatmap visual de constância diária.
- `RecentActivitiesList`: Lista das últimas sessões de estudo finalizadas.

---

## 📝 Campos
- `horas_hoje` (número, formatado ex: "2h 30m")
- `horas_semana` (número, formatado ex: "14h 15m")
- `meta_semanal` (número, ex: "20h")
- `percentual_meta` (porcentagem 0-100%)
- `streak_dias` (inteiro)
- `proxima_disciplina_nome` (string)
- `proxima_disciplina_tempo` (minutos)
- `qtd_revisoes_pendentes` (inteiro)

---

## 🔘 Botões
- `[Iniciar Sessão]` -> Abre modal/runner da sessão de estudos para a matéria recomendada.
- `[Fazer Revisões]` -> Redireciona para `/dashboard/reviews`.
- `[Ver Edital]` -> Redireciona para `/edital`.
- `[Alternar Concurso]` -> Dropdown para trocar de concurso ativo.

---

## 🔍 Filtros
- Período do Heatmap: 30 dias / 60 dias / 90 dias / Ano Atual.

---

## ⚙️ Regras de Negócio
- Se o usuário não tiver completado o Onboarding, deve ser redirecionado para `/onboarding`.
- O card de "Próxima Matéria" deve seguir a ordem estrita definida no Ciclo de Estudos Ativo.
- O Streak (dias consecutivos) deve ser zerado se passar 1 dia útil sem nenhum registro de estudo na tabela `study_history`.
- Horas líquidas são calculadas estritamente a partir do tempo decorrido de sessões marcadas como concluídas (`completed = true`).

---

## 🔗 Dependências
- Módulo de Autenticação (`profiles`)
- Módulo de Ciclo de Estudos / Plano de Estudos (`study_plans`, `study_plan_items`)
- Módulo de Sessão de Estudos (`study_history`)
- Módulo de Revisões (`review_queue`)

---

## 🗄️ Banco de Dados Utilizado
- `profiles`
- `user_targets`
- `study_plans` & `study_plan_items`
- `study_history`
- `review_queue`

---

## 🌐 APIs Utilizadas
- `getDashboardData(userId)` -> Agrupa dados de perfil, metas, estatísticas e plano do dia em paralelo.

---

## 📈 Status Atual no Projeto
- ✅ KPIs de tempo (dia/semana/mês) implementados.
- ✅ Heatmap de constância funcional.
- ✅ Exibição de plano do dia funcional.
- 🔴 FALTANTE: Início direto de timer a partir do card do ciclo.
- 🔴 FALTANTE: Widget dedicado de fila de revisões pendentes no dashboard.
- 🔴 FALTANTE: Lista de atividades recentes no feed.

---

## 🚧 O que falta implementar
1. Integração do widget de Revisões Pendentes consumindo `review_queue`.
2. Botão de clique único para iniciar a próxima matéria do Ciclo.
3. Componente de feed de atividades recentes dos últimos 7 dias.

---

## 🎯 Prioridade
**P0 (Crítico para v1.0)**

---

## ✅ Critérios de Aceite
- O usuário visualiza suas horas líquidas do dia e da semana assim que faz login.
- O card da próxima matéria do ciclo mostra a matéria exata que deve ser estudada.
- O botão de iniciar sessão abre o temporizador configurado com a matéria correta.
- O heatmap reflete com precisão os dias em que houve sessão registrada.

---

## 📋 Checklist
- [x] Layout base com Grid responsivo
- [x] KPI Cards (Hoje, Semana, Mês, Streak)
- [x] Heatmap de frequência diária
- [ ] Widget de Revisões Pendentes do dia
- [ ] Botão "Iniciar Próxima Matéria" integrado ao timer
- [ ] Feed de Histórico Recente no Dashboard
