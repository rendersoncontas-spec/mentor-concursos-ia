# 🔄 Módulo 02 — Ciclo de Estudos

## 🎯 Objetivo
Fornecer um método de organização flexível e contínuo (Ciclo de Estudos Rotativo), permitindo que o estudante siga uma sequência de disciplinas com cargas horárias proporcionalmente distribuídas com base no peso no edital e dificuldade pessoal, independente dos dias da semana.

---

## 🔄 Fluxo do Usuário
1. O usuário acessa a página do Ciclo (`/planejamento` ou `/study-plan`).
2. Configura sua carga horária disponível (ex: 20 horas por rodada/ciclo).
3. Ajusta o peso ou prioridade de cada disciplina (ex: Peso 1 a 3 ou Dificuldade Alta/Média/Baixa).
4. O sistema calcula automaticamente a durabilidade de cada bloco no ciclo (ex: Português 1h30m, Direito Const. 2h, RLM 1h).
5. O usuário visualiza a sequência em formato de "roda" ou "lista sequencial de blocos".
6. À medida que o aluno estuda uma disciplina, o ciclo avança para a próxima etapa. Quando chega ao fim, reinicia automaticamente a rodada.

---

## 🧱 Componentes
- `CycleOverview`: Card mostrando a porcentagem concluída da rodada atual do ciclo (ex: 65% concluído).
- `CycleVisualizer`: Representação gráfica circular ou em lista dos blocos do ciclo de estudos.
- `DisciplineWeightEditor`: Tabela ou modal para ajustar o peso/dificuldade de cada matéria.
- `CycleConfigWizard`: Assistente para definir tempo total do ciclo e matérias incluídas.

---

## 📝 Campos
- `tipo_planejamento`: ENUM ('CICLO_ROTATIVO', 'CRONOGRAMA_SEMANAL')
- `tempo_total_ciclo_minutos`: inteiro (ex: 1200 minutos = 20h)
- `disciplina_id`: UUID
- `peso_disciplina`: decimal / inteiro (1 a 5)
- `nivel_dificuldade`: ENUM ('BAIXA', 'MEDIA', 'ALTA')
- `duracao_bloco_minutos`: inteiro (calculado automaticamente, ex: 60, 90, 120)
- `ordem_execucao`: inteiro (1, 2, 3...)
- `status_bloco`: ENUM ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDO')

---

## 🔘 Botões
- `[Gerar / Novo Ciclo]` -> Dispara o cálculo e reseta a rodada.
- `[Editar Pesos]` -> Abre a edição de relevância e dificuldade por disciplina.
- `[Estudar Agora]` -> Inicia a sessão de estudos para a disciplina do bloco atual.
- `[Pular Bloco]` -> Avança manualmente para a próxima matéria sem registrar tempo.

---

## 🔍 Filtros
- Alternar visualização entre Modo Ciclo Rotativo e Modo Semana (Segunda a Domingo).

---

## ⚙️ Regras de Negócio
- Cada bloco do ciclo deve ter duração mínima de 30 minutos e máxima de 120 minutos (2 horas) para evitar fadiga.
- Disciplinas marcadas com status `COMPLETED` no perfil podem ter seu peso reduzido em 50% na distribuição de tempo do ciclo.
- Se o aluno não estudar em um dia, a sequência do ciclo NÃO se altera e NENHUMA matéria é "perdida" (diferente da agenda semanal rígida).
- O progresso do ciclo é atualizado automaticamente conforme as sessões de estudo são concluídas.

---

## 🔗 Dependências
- Módulo de Disciplinas (`disciplines`, `exam_disciplines`)
- Módulo de Sessão de Estudos (`study_history`)
- Algoritmo de distribuição (`study-plan.algorithm.ts`)

---

## 🗄️ Banco de Dados Utilizado
- `study_plans` (com suporte a versão e tipo)
- `study_plan_items` (com campo de ordem e duração)
- `user_disciplines`

---

## 🌐 APIs Utilizadas
- `generateStudyPlan(supabase, userId)` -> Executa o algoritmo de distribuição proporcional.
- `getActiveStudyPlan(supabase, userId)` -> Retorna o ciclo ativo com ordenação dos blocos.

---

## 📈 Status Atual no Projeto
- ✅ Algoritmo de distribuição de horas implementado (`study-plan.algorithm.ts`).
- ✅ Interface do assistente de planejamento desenvolvida em `planning-wizard.tsx`.
- 🔴 FALTANTE: Suporte total ao modo **Ciclo Rotativo Contínuo** (atualmente o plano é estritamente semanal de Segunda a Domingo).
- 🔴 FALTANTE: Conectar o `planning-wizard.tsx` aos dados reais do banco (atualmente usa mocks).

---

## 🚧 O que falta implementar
1. Adaptar o schema e algoritmo para suportar o formato de **Ciclo Rotativo Independente do Dia da Semana**.
2. Conectar a página `/planejamento` ao banco Supabase real.
3. Adicionar indicador de progresso da rodada atual do ciclo no frontend.

---

## 🎯 Prioridade
**P0 (Crítico para equivalência com o Estudei)**

---

## ✅ Critérios de Aceite
- O aluno pode montar um ciclo rotativo de X horas informando peso e dificuldade das disciplinas.
- A lista de blocos é gerada com tempos proporcionais.
- Ao concluir um bloco via timer, o ciclo avança para o próximo bloco automaticamente.
- O ciclo pode ser reiniciado mantendo as configurações.

---

## 📋 Checklist
- [x] Algoritmo matemático de ponderação por peso
- [x] UI de Wizard de Planejamento (`planning-wizard.tsx`)
- [ ] Suporte a ciclo contínuo sem amarração em dias fixos da semana
- [ ] Conexão do Wizard ao banco Supabase
- [ ] Indicador visual de progresso % da rodada do ciclo
