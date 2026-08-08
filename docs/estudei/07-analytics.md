# 📈 Módulo 07 — Analytics & Estatísticas de Desempenho

## 🎯 Objetivo
Transformar todos os registros de estudo, revisões e questões em relatórios gráficos e indicadores visuais claros, permitindo ao estudante identificar seus pontos fortes e fracos, medir sua evolução temporal e tomar decisões estratégicas no planejamento.

---

## 🔄 Fluxo do Usuário
1. O usuário acessa a página de Estatísticas (`/dashboard/analytics`).
2. Seleciona o período de análise desejado (Últimos 7 dias, 30 dias, Mês Atual, Período Customizado).
3. Analisa os gráficos:
   - **Evolução de Horas Líquidas** (Gráfico de linha/barra por dia).
   - **Distribuição de Tempo por Disciplina** (Gráfico de pizza/donut).
   - **Percentual de Acerto de Questões por Matéria** (Gráfico de barra comparativo).
   - **Média de Foco e Energia** ao longo das sessões.
4. Identifica no ranking de disciplinas quais matérias demandam mais atenção (baixo rendimento ou poucas horas dedicadas).

---

## 🧱 Componentes
- `AnalyticsEngine`: Facade backend que agrupa `aggregations`, `visuals`, `rankings`, `goals` e `ai`.
- `PerformanceChart`: Gráfico de evolução temporal de horas estudadas.
- `HoursDistributionChart`: Donut chart com a distribuição do tempo acumulado por área/matéria.
- `DisciplineRankingTable`: Tabela ordenada de matérias com mais/menos tempo e melhor/pior desempenho.
- `FocusEnergyTrendChart`: Gráfico de dispersão/linha mostrando a oscilação do nível de energia e foco.

---

## 📝 Campos
- `periodo_dias`: inteiro (7, 30, 90, 365)
- `total_minutos_periodo`: inteiro
- `media_foco_periodo`: decimal (1.0 a 5.0)
- `media_energia_periodo`: decimal (1.0 a 5.0)
- `taxa_acerto_global`: porcentagem (0 a 100%)
- `disciplina_mais_estudada`: string
- `disciplina_menos_estudada`: string

---

## 🔘 Botões
- `[Filtrar Período]` -> Seletor de intervalo de datas.
- `[Exportar Relatório PDF]` -> Gera um resumo executivo dos dados em PDF para impressão.
- `[Alternar Visão]` -> Chaveia entre visualização por Disciplina e por Área de Conhecimento (ex: Direito vs Geral).

---

## 🔍 Filtros
- Período: 7 dias, 30 dias, 90 dias, Todo o Período, Personalizado.
- Disciplina Específica.

---

## ⚙️ Regras de Negócio
- Apenas sessões finalizadas com status `completed = true` ou duração gravada entram no cálculo de horas líquidas.
- A média de foco e energia descarta sessões em que o aluno optou por não informar esses valores (valores `null`).
- O gráfico de evolução diária deve exibir "0 horas" nos dias em que não houve estudo para garantir a integridade visual da série temporal.

---

## 🔗 Dependências
- Módulo de Sessão de Estudos (`study_history`)
- Módulo de Questões (`question_attempts`)
- Engine Analítica (`study-analytics.service.ts` e arquivos auxiliares em `application/study-analytics/`)
- Biblioteca de Gráficos (`Recharts`)

---

## 🗄️ Banco de Dados Utilizado
- `study_history`
- `question_attempts`
- `disciplines`

---

## 🌐 APIs Utilizadas
- `getStudyHistoryForAnalytics(supabase, userId, periodDays)` -> Busca o histórico de sessões.
- `AnalyticsEngine.createContext(...)` -> Constrói o contexto analítico em memória para agregação rápida.

---

## 📈 Status Atual no Projeto
- ✅ Engine analítica completa no backend (`AnalyticsEngine` com 8 submódulos em `application/study-analytics/`).
- ✅ Gráficos `performance-chart.tsx` e `hours-distribution-chart.tsx` criados.
- ✅ Ranking de disciplinas funcional.
- 🔴 FALTANTE: Tela dedicada `/dashboard/analytics` integrando todos os relatórios em um único dashboard de BI.
- 🔴 FALTANTE: Gráfico integrado de acertos de questões vs tempo estudado.

---

## 🚧 O que falta implementar
1. Montar a página completa de estatísticas em `/dashboard/analytics`.
2. Adicionar o gráfico comparativo de % de acerto de questões por matéria.
3. Adicionar botão para exportar relatório analítico.

---

## 🎯 Prioridade
**P1 (Essencial para paridade com o Estudei)**

---

## ✅ Critérios de Aceite
- O aluno pode visualizar gráficos claros de suas horas diárias, semanais e mensais.
- A distribuição de tempo por matéria reflete com exatidão o registrado no timer.
- É possível filtrar o relatório por diferentes períodos de tempo.

---

## 📋 Checklist
- [x] Engine analítica backend com agregações
- [x] Gráfico de Linhas de Evolução Temporal (`Recharts`)
- [x] Gráfico Donut de Distribuição por Matéria
- [ ] Página dedicada `/dashboard/analytics` no App Router
- [ ] Gráfico de taxa de acerto em questões por matéria
- [ ] Filtro por intervalo de datas personalizado
