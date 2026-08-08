# 🗺️ Módulo 12 — Roadmap de Execução (Paridade Estudei v1.0)

## 🎯 Objetivo
Definir o plano de ação cronológico, dividido em Sprints focadas e incrementais, para elevar o **Mentor Concursos IA** do seu estado atual até a **equivalência funcional total (v1.0) com a plataforma Estudei.com.br**.

---

## 📌 Premissas do Roadmap
1. **Foco Estrito:** Zero adição de novas funcionalidades não presentes no Estudei.
2. **Reaproveitamento Máximo:** Utilizar toda a estrutura atual de Clean Architecture, componentes UI, banco de dados Supabase e engines existentes.
3. **Qualidade & Estabilidade:** Nenhuma Sprint avança sem testes de aceitação do fluxo do usuário.

---

## 🚀 Sprints de Desenvolvimento

### 🟢 Sprint 1: Fundação do Ciclo & Ajustes Críticos do Dashboard (P0)
**Foco:** Tornar o fluxo principal (Ciclo -> Sessão -> Dashboard) 100% fluido e real.

- [ ] **Ajuste do Service do Plano de Estudos:** Remover o `Math.random()` do `study-plan.service.ts` e o `console.log` de debug.
- [ ] **Modo Ciclo Rotativo:** Ajustar o algoritmo e schema para suportar o formato de ciclo contínuo sem amarração fixa em dias da semana.
- [ ] **Conexão do Wizard de Planejamento:** Conectar o `planning-wizard.tsx` ao banco Supabase real para permitir criação do ciclo pelo aluno.
- [ ] **Atalho "Estudar Agora" no Dashboard:** Adicionar o botão de disparo direto do temporizador a partir do card do ciclo no Dashboard.
- [ ] **Correção do Middleware:** Adicionar as rotas `/disciplines`, `/edital`, `/study-plan` e `/planejamento` nas rotas protegidas do proxy.

---

### 🔵 Sprint 2: Motor de Revisões Espaçadas (UI & Automação) (P0)
**Foco:** Entregar a experiência completa de revisões espaçadas automáticas.

- [ ] **Runner Visual de Flashcards (`FlashcardReviewRunner.tsx`):** Interface de tela cheia para apresentação dos tópicos a revisar com botões de nota de 1 a 5.
- [ ] **Widget de Revisões Pendentes no Dashboard:** Exibir a contagem e atalho das revisões do dia no painel principal.
- [ ] **Automação da Fila (`generateDailyQueue`):** Criar a rota de API / Cron para popular a `review_queue` diariamente.
- [ ] **Conexão com Sessão de Estudos:** Garantir que o encerramento de um estudo gere/atualize o item de revisão correspondente.

---

### 🟡 Sprint 3: Edital Verticalizado Granular (P0)
**Foco:** Dar o controle de marcação tópico a tópico do concurso.

- [ ] **Migration `user_subjects`:** Aplicar a tabela `user_subjects` no Supabase para armazenar o progresso individual.
- [ ] **Checkboxes de Progresso por Tópico:** Adicionar no `edital-accordion.tsx` os marcadores de Teoria, Resumo e Questões.
- [ ] **Cálculo de Cobertura do Edital:** Desenvolver a barra de progresso % global do concurso e por disciplina.

---

### 🟠 Sprint 4: Registro de Questões & Simulados (P1)
**Foco:** Controle de baterias de questões e notas de simulados.

- [ ] **Formulário de Lançamento de Questões:** Desenvolver a interface para registro manual de questões feitas em plataformas parceiras (TEC/QConcursos).
- [ ] **Módulo de Simulados:** Criar o formulário de cadastro de simulados com cálculo automático de nota líquida (regra Cebraspe vs Múltipla Escolha).
- [ ] **Integração com Analytics:** Conectar os acertos em questões aos relatórios de desempenho por matéria.

---

### 🟣 Sprint 5: Analytics Completo & Calendário (P1)
**Foco:** Visibilidade total da evolução do estudante.

- [ ] **Página `/dashboard/analytics`:** Integrar todos os componentes da `AnalyticsEngine` em uma página completa de BI.
- [ ] **Página `/dashboard/calendar`:** Desenvolver a visualização de calendário mensal com marcadores de estudo, revisões e provas.
- [ ] **Tabela `user_events`:** Criar o gerenciamento de datas de exames e contagem regressiva (countdown).

---

## 🟤 Sprint 6: Perfil, Configurações & Polimento SaaS (P1/P2)
**Foco:** Autonomia do estudante e refinamento de UX.

- [ ] **Formulários de Edição em `/profile`:** Permitir alteração de dados pessoais e troca de concurso-alvo.
- [ ] **Grade de Disponibilidade (`available_days`):** Adicionar a matriz de definição de horas por dia da semana.
- [ ] **Configurações do Temporizador:** Adicionar controles de som, alarme e inatividade nas configurações.
- [ ] **Polimento de Responsividade Mobile:** Garantir que todos os fluxos funcionem perfeitamente em telas pequenas.

---

## 🏁 Marco de Lançamento (Release v1.0 Estudei Parity)
Ao final da **Sprint 6**, o **Mentor Concursos IA v1.0** terá alcançado **100% de paridade funcional com a plataforma Estudei.com.br**, oferecendo:
- Ciclo de Estudos Inteligente e Flexível.
- Temporizador de Horas Líquidas com Pausa e Inatividade.
- Motor de Revisões Espaçadas Automáticas (FSRS/SM2+).
- Edital Verticalizado Granular.
- Controle de Questões e Simulados.
- Analytics e Calendário Completo.
- Gestão de Metas e Perfil.

---

## 📋 Checklist de Acompanhamento das Sprints
- [ ] Sprint 1: Fundação do Ciclo & Ajustes Críticos
- [ ] Sprint 2: Motor de Revisões Espaçadas (UI & Automação)
- [ ] Sprint 3: Edital Verticalizado Granular
- [ ] Sprint 4: Registro de Questões & Simulados
- [ ] Sprint 5: Analytics Completo & Calendário
- [ ] Sprint 6: Perfil, Configurações & Polimento SaaS
