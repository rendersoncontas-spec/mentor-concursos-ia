# 👤 Módulo 11 — Perfil do Estudante & Concurso-Alvo

## 🎯 Objetivo
Centralizar os dados pessoais do estudante, informações acadêmicas, concurso e cargo almejado, além da disponibilidade de horário por dia da semana (`available_days`), servindo como fonte primária para os algoritmos de geração de ciclos e métricas.

---

## 🔄 Fluxo do Usuário
1. O usuário acessa a página de **Meu Perfil** (`/profile`).
2. Visualiza seus dados de cadastro (Nome, E-mail, Nível de Experiência, Regime de Trabalho).
3. Visualiza o **Concurso Ativo** selecionado no momento (ex: "Polícia Federal - Agente").
4. Pode clicar em "Alterar Concurso-Alvo" para selecionar um novo edital.
5. Pode ajustar a grade de **Disponibilidade Semanal** (ex: Segunda 4h, Terça 4h, Sábado 6h, Domingo 2h).
6. Salva as alterações. O sistema pergunta se o usuário deseja refazer o Ciclo de Estudos com as novas configurações.

---

## 🧱 Componentes
- `UserProfileCard`: Card exibindo foto/avatar, nome, e-mail e nível de experiência.
- `ActiveTargetCard`: Card detalhado do concurso atual com banca, cargo e data da prova.
- `WeeklyAvailabilityGrid`: Matriz interativa para configurar a carga horária disponível em cada dia da semana.
- `EditProfileModal`: Modal de edição dos dados pessoais básicos.

---

## 📝 Campos
- `name`: string
- `email`: string
- `weekly_study_hours`: inteiro
- `work_regime`: ENUM ('FULL_TIME', 'PART_TIME', 'UNEMPLOYED', 'STUDENT')
- `experience_level`: ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')
- `exam_id`: UUID
- `target_role`: string
- `main_study_source`: string (ex: 'Estratégia Concursos', 'Gran Cursos')
- `available_days`: Array de Inteiros `[0,1,2,3,4,5,6]` com horas atribuídas a cada dia.

---

## 🔘 Botões
- `[Editar Dados Pessoais]` -> Abre modal de edição do perfil.
- `[Trocar Concurso]` -> Permite selecionar outro concurso disponível no banco de editais.
- `[Salvar Disponibilidade]` -> Atualiza a grade horária e revalida o ciclo.

---

## 🔍 Filtros
- N/A.

---

## ⚙️ Regras de Negócio
- Ao alterar o concurso-alvo ativo, o sistema deve executar a função `seedUserDisciplinesFromExam` para associar as disciplinas do novo edital ao perfil do usuário.
- Se o usuário zerar a disponibilidade de um dia específico (ex: Domingo = 0h), o algoritmo de ciclo de estudos NÃO agendará blocos de estudo para aquele dia.
- O e-mail de login é gerenciado pelo Supabase Auth e sua troca exige confirmação via link.

---

## 🔗 Dependências
- Módulo de Autenticação (`profiles`)
- Módulo de Concursos e Objetivos (`user_targets`, `exams`)
- Action de Onboarding / Perfil (`complete-onboarding.action.ts`)

---

## 🗄️ Banco de Dados Utilizado
- `profiles`
- `user_targets`
- `exams`
- `user_disciplines`

---

## 🌐 APIs Utilizadas
- `completeOnboardingAction(...)` / `updateProfileAction(...)` -> Atualiza os dados no banco Supabase.
- `seedUserDisciplinesFromExam(supabase, userId, examId)` -> Gera a matriz de matérias do concurso.

---

## 📈 Status Atual no Projeto
- ✅ Tabela `profiles` e `user_targets` com suporte a todas as propriedades base.
- ✅ Action `completeOnboardingAction` funcionando perfeitamente no onboarding inicial.
- 🔴 FALTANTE: Interface de edição desses dados na página `/profile` após a conclusão do onboarding.
- 🔴 FALTANTE: Matriz visual de configuração de `available_days` por dia da semana.

---

## 🚧 O que falta implementar
1. Construir os formulários de edição na página `/profile`.
2. Adicionar o componente `WeeklyAvailabilityGrid` na tela de perfil.
3. Conectar a edição do concurso-alvo ao reagendamento do ciclo.

---

## 🎯 Prioridade
**P1 (Essencial para gestão contínua do aluno)**

---

## ✅ Critérios de Aceite
- O aluno pode visualizar e editar seus dados de perfil a qualquer momento.
- O aluno pode trocar de concurso-alvo e ver suas disciplinas serem atualizadas.
- O aluno pode configurar suas horas disponíveis para cada dia da semana.

---

## 📋 Checklist
- [x] Tabela `profiles` e `user_targets` no banco
- [x] Logica de vínculo de concurso e seed de disciplinas
- [ ] Formulário de edição de perfil em `/profile`
- [ ] Modal de troca de concurso-alvo
- [ ] Grade de edição da disponibilidade diária de horas (`available_days`)
