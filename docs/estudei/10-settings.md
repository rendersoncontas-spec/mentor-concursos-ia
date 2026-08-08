# ⚙️ Módulo 10 — Configurações da Conta & Sistema

## 🎯 Objetivo
Permitir ao usuário gerenciar as preferências do aplicativo, parâmetros do temporizador, notificações, segurança da conta e assinatura/plano.

---

## 🔄 Fluxo do Usuário
1. O usuário acessa a página de Configurações (`/profile` ou ícone de engrenagem na Sidebar).
2. Navega entre as abas:
   - ⏱️ **Temporizador**: Ajustar tempo de alarme, som de finalização, pausa automática e sensibilidade de inatividade.
   - 🔔 **Notificações**: Ativar/desativar lembretes de estudo diário e avisos de revisões por e-mail/browser.
   - 🛡️ **Segurança**: Alterar senha e gerenciar sessões ativas.
   - 💳 **Assinatura & Plano**: Visualizar plano atual (Gratuito / Premium), histórico de pagamentos e dados de cobrança.
3. Altera a opção desejada e clica em "Salvar Preferências".

---

## 🧱 Componentes
- `SettingsTabs`: Abas laterais/superiores de navegação entre os grupos de configuração.
- `TimerPreferencesForm`: Formulário de parâmetros do temporizador de estudo.
- `NotificationToggleList`: Lista de switches para habilitar/desabilitar notificações.
- `SecurityPasswordForm`: Formulário para alteração de senha de acesso.
- `SubscriptionStatusCard`: Card de informações do plano do usuário com botão de upgrade/cancelamento.

---

## 📝 Campos
- `inactivity_threshold_minutes`: inteiro (ex: 10)
- `sound_enabled`: booleano
- `auto_pause_enabled`: booleano
- `notify_daily_reminder`: booleano
- `notify_overdue_reviews`: booleano
- `current_password`: string (password)
- `new_password`: string (password)

---

## 🔘 Botões
- `[Salvar Alterações]` -> Persiste as novas preferências no banco ou `localStorage`.
- `[Alterar Senha]` -> Dispara a atualização de credenciais via Supabase Auth.
- `[Gerenciar Assinatura]` -> Abre o portal do cliente de pagamento (Stripe / Asaas).

---

## 🔍 Filtros
- N/A.

---

## ⚙️ Regras de Negócio
- As preferências do temporizador (som, inatividade) são salvas em `localStorage` para resposta instantânea durante a sessão de estudo.
- A alteração de senha exige a confirmação da senha atual.
- Usuários no plano Gratuito possuem acesso com limitações que são apresentadas na aba de Assinatura com opção de upgrade para o plano PRO.

---

## 🔗 Dependências
- Módulo de Autenticação (`infrastructure/supabase/server.ts`)
- Timer Hook (`use-smart-timer.ts`)
- Configuração de Ambiente (`config/env.ts`)

---

## 🗄️ Banco de Dados Utilizado
- `profiles`
- `user_settings` (tabela a ser criada para preferências avançadas de sistema)
- `auth.users`

---

## 🌐 APIs Utilizadas
- `supabase.auth.updateUser()` -> Atualiza senha e e-mail.
- API de pagamentos (Stripe / Mercado Pago / Asaas) no futuro.

---

## 📈 Status Atual no Projeto
- ✅ Componente básico de sidebar e layout do perfil existente em `/profile`.
- ✅ Ações de troca de senha via Supabase Auth integradas.
- 🔴 FALTANTE: Formulário de preferências do temporizador (som, alarme, sensibilidade).
- 🔴 FALTANTE: Tela de gerenciamento de plano/assinatura SaaS.

---

## 🚧 O que falta implementar
1. Criar abas estruturadas na página `/profile`.
2. Desenvolver a aba de **Preferências do Timer** integrando com o `useSmartTimer`.
3. Adicionar a aba de **Gerenciamento de Assinatura**.

---

## 🎯 Prioridade
**P2 (Importante para o modelo SaaS comercial)**

---

## ✅ Critérios de Aceite
- O aluno pode habilitar ou desabilitar o som e a pausa automática do timer.
- O aluno pode alterar sua senha com segurança.
- O sistema exibe o status atual da assinatura do usuário.

---

## 📋 Checklist
- [x] Estrutura de rotas protegidas para configurações
- [ ] Aba de Preferências do Temporizador
- [ ] Form de Alteração de Senha seguro
- [ ] Gerenciamento de Notificações
- [ ] Card de Assinatura/Plano SaaS
