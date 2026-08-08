# 📅 Módulo 08 — Calendário de Estudos & Eventos

## 🎯 Objetivo
Oferecer uma visão estruturada em calendário (mensal/semanal) para mapeamento dos dias estudados, agendamento prévio de revisões, marcar datas de provas e simulados, permitindo um planejamento temporal de médio e longo prazo.

---

## 🔄 Fluxo do Usuário
1. O usuário acessa a aba **Calendário** (`/dashboard/calendar`).
2. Visualiza o mês atual com marcadores visuais:
   - 🟢 Dias com estudo concluído (com badge do número de horas).
   - 🔵 Revisões agendadas para dias futuros.
   - 🔴 Data limite/Dia da Prova do Concurso.
   - 🟡 Simulados agendados.
3. Clica em um dia específico para ver os detalhes das sessões e eventos daquela data.
4. Pode adicionar um evento manual (ex: "Simulado Geral no Domingo" ou "Inscrição no Concurso").

---

## 🧱 Componentes
- `CalendarGrid`: Grade mensal de dias com indicadores visuais de atividades.
- `DayDetailModal`: Popup exibindo todos os registros e agendamentos de um dia selecionado.
- `AddEventDialog`: Modal para cadastrar manualmente um evento no calendário (Prova, Simulado, Lembrete).
- `ExamCountdownCard`: Card fixo no topo indicando "Faltam X dias para a prova da PF".

---

## 📝 Campos
- `evento_id`: UUID
- `user_id`: UUID
- `titulo_evento`: string (ex: "Prova Objetiva Polícia Federal")
- `tipo_evento`: ENUM ('PROVA', 'SIMULADO', 'REVISAO', 'LEMBRETE')
- `data_evento`: date
- `horario_inicio`: time (opcional)
- `cor_indicador`: string (hex ou classe CSS)

---

## 🔘 Botões
- `[Novo Evento]` -> Abre o formulário de cadastro de evento.
- `[Navegar Mês Anterior / Próximo]` -> Alterna a exibição do calendário.
- `[Hoje]` -> Retorna o foco do calendário para a data atual.

---

## 🔍 Filtros
- Filtrar exibição por tipo de evento (Mostrar Apenas Provas, Apenas Simulados, Apenas Histórico).

---

## ⚙️ Regras de Negócio
- A data da prova cadastrada no objetivo do aluno (`user_targets`) deve aparecer automaticamente em destaque no calendário.
- As revisões geradas pelo motor espaçado (`review_queue` e `review_items`) devem alimentar as bolinhas de pendência nos dias futuros correspondentes.
- Dias em que houver estudo registrado em `study_history` ganham a cor verde proporcionalmente à carga horária estudada.

---

## 🔗 Dependências
- Módulo de Sessão (`study_history`)
- Módulo de Revisões (`review_items`, `review_queue`)
- Módulo de Concursos (`user_targets`)

---

## 🗄️ Banco de Dados Utilizado
- `study_history`
- `review_queue`
- `user_targets`
- `user_events` (tabela a ser criada para lembretes customizados)

---

## 🌐 APIs Utilizadas
- `getCalendarEvents(userId, month, year)` -> Consolida sessões passadas, revisões futuras e eventos em um único payload.

---

## 📈 Status Atual no Projeto
- 🔴 FALTANTE: O projeto atual não possui módulo ou visualização em Calendário.

---

## 🚧 O que falta implementar
1. Criar a página `/dashboard/calendar`.
2. Desenvolver o componente visual de grade mensal (`CalendarGrid`).
3. Criar a tabela `user_events` no banco de dados para permitir ao aluno agendar datas de provas e simulados.

---

## 🎯 Prioridade
**P1 (Essencial para paridade com o Estudei)**

---

## ✅ Critérios de Aceite
- O aluno consegue ver os dias passados em que estudou no formato de calendário.
- O aluno consegue ver quando serão suas próximas revisões nos dias seguintes.
- O aluno consegue cadastrar a data da sua prova e visualizar a contagem regressiva.

---

## 📋 Checklist
- [ ] Rota `/dashboard/calendar` no App Router
- [ ] Componente visual de Calendário Mensal
- [ ] Tabela `user_events` para agendamento manual de Provas e Simulados
- [ ] Card de Contagem Regressiva para a Prova (Countdown)
- [ ] Integração das revisões agendadas com os dias do calendário
