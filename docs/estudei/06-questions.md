# 🎯 Módulo 06 — Questões, Cadernos & Simulados

## 🎯 Objetivo
Permitir que o estudante registre resoluções de questões (diretamente ou oriundas de plataformas parceiras como TEC/QConcursos), acompanhe seu percentual de acertos por assunto/banca e cadastre simulados completos para medir sua evolução real em condições de prova.

---

## 🔄 Fluxo do Usuário

### Fluxo A: Resolução e Registro de Questões
1. O usuário acessa o menu **Questões** (`/questions`).
2. Escolhe resolver questões na plataforma ou registrar um lote de questões resolvidas externamente (ex: "Fiz 30 questões no TEC Concursos de Direito Const.").
3. Informa a disciplina, o assunto, a banca examinadora, a quantidade de questões feitas e o número de acertos.
4. O sistema calcula a taxa de acerto (%) e atualiza os indicadores no Dashboard e Analytics.

### Fluxo B: Simulados
1. O usuário acessa a seção **Simulados**.
2. Clica em "Novo Simulado" e informa o nome (ex: "Simulado 01 - PF Agente - Cebraspe"), a data de realização e o tempo total.
3. Preenche a quantidade de questões e acertos por disciplina.
4. O sistema gera a nota final (com suporte a pontuação líquida Cebraspe: uma errada anula uma certa) e cria o gráfico de evolução entre simulados.

---

## 🧱 Componentes
- `QuestionResolver`: Interface simples para exibição e resposta de questão individual.
- `ExternalBatchQuestionForm`: Formulário para lançamento manual de lote de questões feitas fora do app.
- `SimuladoListCard`: Lista dos simulados realizados com nota e classificação.
- `SimuladoFormWizard`: Form em passos para cadastrar o resultado de um simulado completo por disciplina.

---

## 📝 Campos
- `question_id`: UUID
- `discipline_id`: UUID
- `topic_id`: UUID
- `exam_board`: string (ex: 'Cebraspe', 'FGV', 'Vunesp')
- `total_questoes`: inteiro
- `acertos`: inteiro
- `erros`: inteiro
- `tipo_erro`: ENUM ('CONTENT', 'INTERPRETATION', 'DISTRACTION', 'TIME', 'GUESS')
- `simulado_nome`: string
- `nota_liquida`: decimal

---

## 🔘 Botões
- `[Registrar Lote de Questões]` -> Abre modal de lançamento rápido de estatísticas de questões.
- `[Cadastrar Simulado]` -> Inicia formulário de registro de simulado.
- `[Criar Caderno]` -> Agrupa questões por filtro específico para estudo futuro.

---

## 🔍 Filtros
- Filtrar por Banca Examinadora (Cebraspe, FGV, Vunesp, FCC, etc.).
- Filtrar por Disciplina e Assunto.
- Filtrar por Mês / Ano de realização.

---

## ⚙️ Regras de Negócio
- A taxa de acerto é calculada por: `(Acertos / Total de Questões) * 100`.
- Para simulados com regra Cebraspe (Certo/Errado): `Nota Líquida = Acertos - Erros`.
- Toda tentativa de questão gravada alimenta o motor de análise de pontos fracos no módulo de Analytics.

---

## 🔗 Dependências
- Módulo de Disciplinas (`disciplines`)
- Módulo de Edital (`subjects`, `question_topics`)
- Question Service (`question-attempt.service.ts`)

---

## 🗄️ Banco de Dados Utilizado
- `question_sources`
- `question_topics`
- `questions`
- `question_attempts`
- `question_lists` & `question_list_items`
- `simulados` (tabela a ser criada/formalizada no schema)

---

## 🌐 APIs Utilizadas
- `question-attempt.service.ts` -> Registra tentativas.
- Interface `QuestionProvider` (em `domain/questions/types.ts`) preparada para futura sincronização via API com plataformas de questões.

---

## 📈 Status Atual no Projeto
- ✅ Tabela e schema de banco de dados (`questions`, `question_attempts`, `question_sources`, `question_lists`) desenvolvidos.
- ✅ `QuestionProvider` interface definida na camada de domínio.
- 🔴 FALTANTE: Interface no frontend para resolver questões ou registrar lotes manuais.
- 🔴 FALTANTE: Módulo e formulário de cadastro de Simulados.

---

## 🚧 O que falta implementar
1. Tela `/questions` no frontend com o formulário `ExternalBatchQuestionForm`.
2. Módulo de lançamento e acompanhamento de Simulados.
3. Conexão dos acertos de questões com a barra de progresso de matérias.

---

## 🎯 Prioridade
**P1 (Essencial para paridade completa com o Estudei)**

---

## ✅ Critérios de Aceite
- O aluno consegue registrar o resultado de suas baterias de questões (banca, disciplina, acertos/erros).
- O aluno consegue cadastrar um simulado completo e ver sua nota calculada.
- O histórico de acertos por matéria atualiza automaticamente as estatísticas do Dashboard.

---

## 📋 Checklist
- [x] Estrutura completa de banco de dados para questões (`sprint5-questions.sql`)
- [x] Interface `QuestionProvider` na camada de domínio
- [ ] Formulário de registro manual de baterias de questões
- [ ] Módulo de cadastro e gráfico de evolução de Simulados
- [ ] Cálculo automático de nota líquida (regra Cebraspe vs Múltipla Escolha)
