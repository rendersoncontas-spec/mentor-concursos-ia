# 📜 Módulo 05 — Edital Verticalizado

## 🎯 Objetivo
Transformar o edital oficial em uma estrutura navegável e interativa por disciplinas e tópicos/assuntos, permitindo o acompanhamento do progresso de cobertura do conteúdo (Teoria, Resumo, Questões) e a medição do % total de conclusão do concurso.

---

## 🔄 Fluxo do Usuário
1. O usuário acessa o menu **Edital Verticalizado** (`/edital`).
2. O edital do concurso ativo é carregado, organizado em disciplinas e assuntos hierárquicos.
3. O usuário visualiza a barra de progresso geral (% do Edital Cumprido).
4. Ao expandir uma disciplina (Accordion), visualiza a lista de tópicos/assuntos.
5. Para cada assunto, o usuário pode marcar status específicos:
   - 📖 **Teoria** (Estudado / Não Estudado)
   - 📝 **Resumo / Mapa Mental** (Criado / Pendente)
   - 🎯 **Questões** (Resolvidas / Pendente)
6. As barras de progresso da disciplina e do concurso são recalculadas instantaneamente.

---

## 🧱 Componentes
- `EditalAccordion`: Componente expansível listando disciplinas e assuntos.
- `EditalProgressBar`: Barra de progresso visual de cobertura (% global e % por matéria).
- `TopicStatusCheckboxes`: Conjunto de checkboxes para cada assunto (Teoria, Resumo, Questões).
- `ExamSelector`: Dropdown para alternar visualização caso o aluno esteja inscrito em múltiplos concursos.

---

## 📝 Campos
- `exam_id`: UUID
- `discipline_id`: UUID
- `subject_id`: UUID
- `teoria_concluida`: booleano
- `resumo_concluido`: booleano
- `questoes_concluidas`: booleano
- `peso_assunto`: decimal
- `data_ultimo_estudo`: timestamp

---

## 🔘 Botões
- `[Marcar Todos Teoria]` -> Marca a teoria de todos os assuntos da matéria como concluída.
- `[Iniciar Estudo do Tópico]` -> Abre diretamente o timer com a matéria e o assunto pré-selecionados.
- `[Imprimir / Exportar PDF]` -> Gera versão para impressão do edital verticalizado.

---

## 🔍 Filtros
- Filtrar assuntos por Status: Todos / Pendentes / Concluídos / Com Dificuldade.
- Pesquisar por palavra-chave no edital.

---

## ⚙️ Regras de Negócio
- A porcentagem de conclusão de uma disciplina considera a média ponderada do cumprimento dos tópicos.
- Quando o usuário conclui uma sessão de estudo atribuída a um assunto específico, o status de **Teoria** ou **Questões** daquele assunto pode ser atualizado automaticamente.
- Editais são compartilhados globalmente entre usuários cadastrados no mesmo concurso (`exams` e `exam_subjects`).

---

## 🔗 Dependências
- Módulo de Concursos e Editais (`exams`, `subjects`, `exam_subjects`)
- Módulo de Disciplinas (`disciplines`)
- Progresso do Usuário (`user_disciplines`, `user_subjects`)

---

## 🗄️ Banco de Dados Utilizado
- `exams`
- `disciplines`
- `subjects`
- `exam_subjects`
- `user_subjects` (conforme documentado na migration da Sprint 6)

---

## 🌐 APIs Utilizadas
- `getEditalData(examId, userId)` -> Retorna o edital estruturado com os marcadores de progresso do usuário.

---

## 📈 Status Atual no Projeto
- ✅ Componente de visualização em Accordion desenvolvido (`edital-accordion.tsx`).
- ✅ Estrutura de banco de `exams`, `disciplines`, `subjects` e `exam_subjects` pronta com seeds.
- 🔴 FALTANTE: Tabela `user_subjects` para salvar as marcações individuais de Teoria/Resumo/Questões do aluno por tópico.
- 🔴 FALTANTE: Barra de progresso % global do edital no topo da página.

---

## 🚧 O que falta implementar
1. Criar e aplicar a migration da tabela `user_subjects` (registrando progresso granular).
2. Adicionar os 3 checkboxes por tópico (Teoria, Resumo, Questões).
3. Conectar a mudança dos checkboxes à revalidação do progresso total do edital.

---

## 🎯 Prioridade
**P0 (Crítico para equivalência com o Estudei)**

---

## ✅ Critérios de Aceite
- O aluno consegue visualizar todos os tópicos do edital divididos por disciplina.
- O aluno consegue marcar Teoria, Resumo e Questões individualmente para cada tópico.
- As marcações persistem no banco de dados e atualizam a barra de progresso geral do concurso.

---

## 📋 Checklist
- [x] Accordion expansível de disciplinas e assuntos
- [x] Mapeamento de tabelas no banco (`exams`, `subjects`, `exam_subjects`)
- [ ] Tabela `user_subjects` ativada para progresso individual
- [ ] Checkboxes de Teoria, Resumo e Questões por assunto
- [ ] Cálculo dinâmico da % de cobertura total do edital
