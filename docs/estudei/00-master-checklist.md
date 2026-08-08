# 📋 Master Checklist — Mentor Concursos IA (Equivalência Funcional Estudei v1.0)

> Este documento contém o inventário mestre de todos os módulos necessários para tornar a plataforma **Mentor Concursos IA v1.0** funcionalmente equivalente ao **Estudei.com.br**.

---

## 📌 Visão Geral do Status por Módulo

| Módulo | Status | Existente | Faltante | Prioridade |
|:---|:---:|:---|:---|:---:|
| **01. Dashboard** | 🟡 Parcial | KPIs básicos, Heatmap, Card do Plano | Cronômetro direto no Dashboard, Atividades Recentes, Widget de Metas Rápidas | P0 |
| **02. Ciclo de Estudos** | 🟡 Parcial | Algoritmo semanal básico | Modo Ciclo Rotativo Contínuo, Ajuste de Peso por Matéria no Ciclo, Progresso % do Ciclo | P0 |
| **03. Sessão de Estudos** | ✅ Avançado | Timer inteligente, Modal de registro, Métricas de foco e energia | Associação direta com página do livro/vídeo, Atividades complementares | P0 |
| **04. Revisões** | 🟡 Parcial | Engines (FSRS/SM2+), Tabelas no banco | Interface visual de Flashcards/Revisão ativa, Cron/Trigger de Fila diária | P0 |
| **05. Edital Verticalizado** | 🟡 Parcial | Accordion por disciplina/assunto | Marcação de teoria/revisão/questões por tópico, Barra de progresso % por matéria | P0 |
| **06. Questões & Simulados** | 🔴 Inicial | Estrutura de banco de dados | Banco populado, Filtros de resolução, Histórico de simulados, Cadastro manual de simulado | P1 |
| **07. Analytics & Desempenho** | 🟡 Parcial | Gráficos base (Recharts), Cálculos no backend | Gráfico de evolução por assunto, Comparativo de acertos vs tempo, Exportação de relatórios | P1 |
| **08. Calendário de Estudos** | 🔴 Ausente | Nenhum | Visão mensal/semanal de eventos de estudo, Agendamento de revisões e provas | P1 |
| **09. Metas & Constância** | 🟡 Parcial | Streak diário simples | Definição de metas semanais de horas líquidas, Barra de progresso visual no Dashboard, Premiação por constância | P1 |
| **10. Configurações da Conta** | 🔴 Inicial | Apenas layout base | Edição de plano/assinatura, Preferências do temporizador, Notificações | P2 |
| **11. Perfil do Estudante** | 🟡 Parcial | Dados do Onboarding | Edição de concurso-alvo, foto de perfil, horas disponíveis por dia da semana | P1 |
| **12. Roadmap de Execução** | 📋 Planejado | N/A | Plano de ação em Sprints para equivalência total | P0 |

---

## 🚀 Módulos em Detalhe

### 1. Dashboard (`01-dashboard.md`)
- **Status:** 🟡 Parcial
- **Existente:** KPIs de tempo, heatmap de constância, resumo do plano ativo.
- **Faltante:** Atalho de início rápido de sessão no topo, widget de próximas revisões do dia, progresso do ciclo atual.
- **Prioridade:** P0
- **Dependências:** Módulo de Ciclo, Módulo de Sessão de Estudos.

### 2. Ciclo de Estudos (`02-ciclo.md`)
- **Status:** 🟡 Parcial
- **Existente:** Algoritmo de distribuição semanal.
- **Faltante:** Suporte ao formato de **Ciclo Rotativo Contínuo** (ordem de matérias independente de dias da semana), cálculo dinâmico de horas por bloco.
- **Prioridade:** P0
- **Dependências:** Banco de disciplinas e edital.

### 3. Sessão de Estudos (`03-study-session.md`)
- **Status:** ✅ Avançado
- **Existente:** Timer inteligente com pausa, detecção de inatividade, avaliação de foco/energia/questões.
- **Faltante:** Input de material utilizado (ex: Aula X, Pág Y a Z), atalho para disparar sessão livre de qualquer lugar.
- **Prioridade:** P0
- **Dependências:** Módulo de Disciplinas/Edital.

### 4. Revisões (`04-reviews.md`)
- **Status:** 🟡 Parcial
- **Existente:** Tabelas `review_items`, `review_queue`, `review_history`, algoritmos FSRS/SM2+.
- **Faltante:** Tela interativa de execução de revisões (estilo Flashcard / Resumo), cron autônomo para popular `review_queue`.
- **Prioridade:** P0
- **Dependências:** Módulo de Sessão e Módulo de Questões.

### 5. Edital Verticalizado (`05-edital.md`)
- **Status:** 🟡 Parcial
- **Existente:** Tabela `exam_subjects`, visualização em Accordion.
- **Faltante:** Checkboxes de progresso granular por tópico (Teoria Lido, Resumo Feito, Questões Feitas), indicador % de edital cumprido.
- **Prioridade:** P0
- **Dependências:** Banco de dados de editais/assuntos.

### 6. Questões & Simulados (`06-questions.md`)
- **Status:** 🔴 Inicial
- **Existente:** Modelagem de banco de dados (`questions`, `question_attempts`, `question_lists`).
- **Faltante:** Interface de resolução de questões, registro de cadernos de questões externos (ex: TEC/QConcursos), módulo de registro de Simulados com gabarito.
- **Prioridade:** P1
- **Dependências:** Módulo de Disciplinas e Edital.

### 7. Analytics (`07-analytics.md`)
- **Status:** 🟡 Parcial
- **Existente:** Engine `AnalyticsEngine` (evolução, heatmap, ranking de disciplinas).
- **Faltante:** Filtros avançados por período (semana/mês/ano/personalizado), gráficos de % de acertos por assunto e simulados.
- **Prioridade:** P1
- **Dependências:** Histórico de sessões, tentativas de questões e revisões.

### 8. Calendário (`08-calendar.md`)
- **Status:** 🔴 Ausente
- **Existente:** Nenhum.
- **Faltante:** Visão em calendário (mês/semana) exibindo dias estudados, revisões agendadas e datas de provas/simulados.
- **Prioridade:** P1
- **Dependências:** Módulo de Sessão e Revisões.

### 9. Metas & Constância (`09-goals.md`)
- **Status:** 🟡 Parcial
- **Existente:** Cálculo de metas de horas líquidas semanais.
- **Faltante:** Definição personalizada de meta semanal/diária, barra de progresso visual no Dashboard, acompanhamento de sequência (streak).
- **Prioridade:** P1
- **Dependências:** Módulo de Sessão de Estudos.

### 10. Configurações (`10-settings.md`)
- **Status:** 🔴 Inicial
- **Existente:** Skeleton de configurações em `/profile`.
- **Faltante:** Gerenciamento de assinatura/plano, preferências de temporizador (som, alarme, auto-pausa), exportação de dados.
- **Prioridade:** P2
- **Dependências:** Supabase Auth e Profile.

### 11. Perfil (`11-profile.md`)
- **Status:** 🟡 Parcial
- **Existente:** Dados salvos na tabela `profiles` durante o onboarding.
- **Faltante:** Edição do concurso-alvo, alteração de foto/avatar, configuração de carga horária disponível por dia da semana (`available_days`).
- **Prioridade:** P1
- **Dependências:** Supabase Storage (se houver avatar) e Tabela `profiles`.

### 12. Roadmap de Execução (`12-roadmap.md`)
- **Status:** 📋 Planejado
- **Foco:** Ordem cronológica das Sprints de desenvolvimento para levar o Mentor Concursos IA de seu estado atual até a paridade total com o Estudei v1.0.

---

## 🎯 Critério Mestre de Conclusão (Definition of Done)
Para considerar a versão 1.0 funcionalmente equivalente ao Estudei:
1. O aluno deve conseguir cadastrar seu concurso e gerar um **Ciclo de Estudos** contínuo.
2. O aluno deve poder iniciar e cronometrar uma **Sessão de Estudos** em tempo real com facilidade.
3. O aluno deve receber **Revisões Automáticas** baseadas na sua rotina de estudos.
4. O aluno deve conseguir controlar seu progresso no **Edital Verticalizado** tópico a tópico.
5. O aluno deve visualizar o **Analytics** completo de tempo líquido, acerto de questões e metas atingidas.
