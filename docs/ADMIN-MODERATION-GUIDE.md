# 🛡️ Guia Operacional — Sistema de Administração, Moderação e Modo de Suporte

> **Sistema NomeIA**  
> **Documento Oficial de Segurança, Papéis e Suporte**

---

## 📌 1. Visão Geral dos Níveis de Acesso (Roles)

| Papel | Permissões | Restrições Estritas |
|:---|:---|:---|
| **`user`** (Estudante) | Acesso exclusivo aos seus próprios estudos, plano, questões e histórico. | Não acessa `/admin`, não visualiza outros estudantes e não altera papéis. |
| **`moderator`** (Moderador) | Acesso ao Painel de Suporte (`/admin`), busca de estudantes, diagnóstico e **Modo de Suporte** temporário (30 min) para contas de estudantes. | **Não pode** alterar roles, promover/rebaixar usuários, criar/remover admins ou acessar contas de outros Administradores. |
| **`admin`** (Administrador) | Todas as permissões de moderador + gestão de papéis (`user_roles`), promoção/rebaixamento e acesso a ferramentas administrativas completas. | Proteção ativa contra a remoção do último administrador do sistema. |

---

## 🔒 2. Modo de Suporte Seguro (Impersonação Temporária)

1. **Sem vazamento de credenciais**: O moderador **nunca** recebe senhas, access tokens ou refresh tokens do estudante.
2. **Contexto temporário**: É gerado um registro em `public.support_sessions` com expiração estrita de **30 minutos**.
3. **Banner Fixo Evidente**: Em todas as telas da plataforma, é exibido o banner:
   ```
   🛡️ MODO SUPORTE ATIVO — Visualizando conta de: [Nome] | Expira em: [MM:SS] | [SAIR DO SUPORTE]
   ```
4. **Encerramento / Expiração**: Ao clicar em "Sair do Suporte" ou atingir 30 minutos, a sessão é finalizada e o moderador retorna para o Painel Administrativo.

---

## 📜 3. Logs de Auditoria Imutáveis (`public.audit_logs`)

A tabela de auditoria opera no modelo **Append-Only**:
- Proibidos `UPDATE` e `DELETE` no nível de banco (RLS).
- Ações registradas:
  - `SUPPORT_SESSION_STARTED` (Quem iniciou, em quem iniciou e data de expiração).
  - `SUPPORT_SESSION_ENDED` (Encerramento da sessão de suporte).
  - `ROLE_CHANGED` (Alteração de papéis executada por administradores).

---

## 🚀 4. Como Executar as Migrations no Supabase

1. Acesse o **SQL Editor** do seu painel Supabase.
2. Execute o conteúdo do arquivo [`docs/admin-moderation-migration.sql`](./admin-moderation-migration.sql).
3. Para definir o primeiro Administrador, execute no SQL Editor:
   ```sql
   INSERT INTO public.user_roles (user_id, role)
   SELECT id, 'admin'
   FROM auth.users
   WHERE email = 'seu-email-de-admin@mentorconcursos.com.br'
   ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
   ```

---

## 🧪 5. Validação de Testes Automatizados

Execute na raiz do projeto:
```bash
npm test
```
Resultados esperados: **254/254 testes passando (100% de sucesso)**.
