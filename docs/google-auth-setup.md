# Login com Google — Configuração (Supabase + Google Cloud)

Este documento cobre **apenas configuração externa** (Google Cloud Console e
Supabase Dashboard). Todo o código já está implementado e não depende de
nenhuma variável de ambiente nova — a configuração do provider OAuth vive
inteiramente no painel do Supabase, não no `.env.local` do projeto.

Nenhum segredo (Client Secret, chaves, etc.) deve ser colado neste arquivo,
em commits, ou em qualquer lugar do repositório. As credenciais do Google
ficam apenas no painel do Supabase.

## 1. Google Cloud Console

1. Acesse [Google Cloud Console](https://console.cloud.google.com/) e
   selecione (ou crie) um projeto para o NomeIA.
2. Vá em **APIs & Services → OAuth consent screen** e configure a tela de
   consentimento (nome do app "NomeIA", e-mail de suporte, domínio, logo,
   etc.). Para produção, será necessário publicar o app (sair do modo
   "Testing") depois de validado.
3. Vá em **APIs & Services → Credentials → Create Credentials → OAuth
   client ID**.
   - Tipo de aplicação: **Web application**.
   - **Authorized JavaScript origins**: a URL do seu app (ex.:
     `https://app.nomeia.com` em produção, e `http://localhost:3000` em
     desenvolvimento, se for testar localmente).
   - **Authorized redirect URIs**: a URL de callback do **Supabase**, não do
     NomeIA — algo como:
     ```
     https://<seu-project-ref>.supabase.co/auth/v1/callback
     ```
     (o `<seu-project-ref>` está visível no painel do Supabase, em
     Project Settings → General, ou na própria URL do dashboard).
4. Ao salvar, o Google mostra um **Client ID** e um **Client Secret**. Copie
   os dois — eles vão para o passo 2, no Supabase, e em nenhum outro lugar.

## 2. Supabase Dashboard

1. No projeto do Supabase, vá em **Authentication → Providers → Google**.
2. Ative o provider e cole o **Client ID** e o **Client Secret** obtidos no
   passo anterior.
3. Em **Authentication → URL Configuration**:
   - **Site URL**: a URL de produção do NomeIA (ex.: `https://app.nomeia.com`).
   - **Redirect URLs**: adicione as URLs de callback da própria aplicação
     (não confundir com o callback do passo 1, que é do Supabase para o
     Google) — precisa incluir:
     ```
     https://app.nomeia.com/auth/callback
     http://localhost:3000/auth/callback
     ```
     (ajuste os domínios conforme os ambientes que você usa; o código lê a
     origem da própria requisição em `/auth/callback`, então cada ambiente
     que for usado precisa estar nesta lista).

### Fase 5 — usuário existente que tenta entrar com Google (ação necessária)

Este é o único ponto de configuração que **precisa ser decidido
manualmente** e que o código não pode resolver sozinho:

Se um usuário já tem conta no NomeIA com e-mail/senha e tenta entrar com
Google usando o **mesmo e-mail**, o comportamento depende da configuração
**Authentication → Providers → Email → "Confirm email"** e das opções de
**account linking** do projeto Supabase:

- Se o *auto-linking* por e-mail não estiver habilitado no projeto, o
  Supabase recusa o `exchangeCodeForSession` para essa conta, e o callback
  implementado aqui (`src/app/auth/callback/route.ts`) detecta esse caso e
  redireciona para `/login?oauthError=account_exists_different_method`, que
  mostra a mensagem:
  > "Já existe uma conta com este e-mail cadastrada por senha. Entre com
  > e-mail e senha, ou fale com o suporte para vincular sua conta Google."

  Isso é intencional e seguro: o app **nunca cria uma conta duplicada nem
  apaga a conta existente** nesse cenário.
- Se você quiser permitir que esse usuário vincule automaticamente a conta
  Google à conta existente (mesmo e-mail passa a poder logar pelos dois
  métodos), isso é uma decisão de produto que se configura no Supabase
  (verifique a documentação oficial do Supabase sobre "Identity Linking" /
  "Manual Linking" para a versão do seu projeto, já que essa opção varia
  entre "automatic" e "manual" conforme configuração do projeto). Esta
  decisão não foi tomada por mim — depende de política do produto, e o
  código já trata os dois cenários com segurança (nunca duplica, nunca
  apaga), mas qual comportamento o Supabase efetivamente aplica depende
  dessa configuração do painel, que não pude verificar nem alterar sem
  acesso ao dashboard.

## 3. Variáveis de ambiente

**Nenhuma variável nova é necessária.** O projeto já usa:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (ou `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)

Essas são as únicas chaves usadas pelos clients Supabase existentes
(`src/infrastructure/supabase/client.ts` e `server.ts`), e o login com
Google reaproveita exatamente os mesmos clients — nenhum client novo, nenhum
uso da service role key.

**Nunca crie** uma variável `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` (ou
qualquer variável `NEXT_PUBLIC_*` com a service role key) — isso exporia a
chave de administração do banco no bundle do navegador. O código deste
recurso não usa a service role key em nenhum momento; um teste automatizado
(`google-auth.wiring.test.ts`) garante isso.

## 4. O que foi implementado no código

- `src/features/auth/components/google-auth-button.tsx` — botão
  "Entrar com Google" / "Continuar com Google", reaproveitando o client
  Supabase do browser já existente (`@/infrastructure/supabase/client`).
  Chama `supabase.auth.signInWithOAuth({ provider: "google" })` com
  `redirectTo` apontando para `/auth/callback`. Trata loading e erro (toast).
- `src/app/auth/callback/route.ts` — Route Handler que troca o `code` por
  sessão no servidor (`exchangeCodeForSession`, cookies httpOnly via o
  server client existente `@/infrastructure/supabase/server`), sincroniza o
  profile com `backfillProfileFromGoogle`, decide o redirect final
  (`/onboarding`, `/dashboard`, ou o `next` explícito e seguro) e trata
  todos os erros redirecionando para `/login?oauthError=<código>` — nunca
  expõe a mensagem técnica do Supabase ao usuário.
- `src/application/auth/google-oauth-profile.ts` — preenche
  `name`/`full_name`/`avatar_url`/`email` no profile **apenas quando esses
  campos estiverem vazios** (nunca sobrescreve dado que o usuário já
  personalizou no NomeIA). Nunca faz `INSERT` em `profiles` — a linha é
  criada pelo trigger `handle_new_user()` do banco, do mesmo jeito que já
  acontece hoje no cadastro por e-mail/senha.
- `src/domain/auth/auth-redirect.ts` — valida que qualquer destino de
  redirect pós-login (`next`) é uma rota interna do próprio app, nunca uma
  URL externa (proteção contra open redirect).
- `src/features/auth/components/oauth-error-toast.tsx` — mostra os erros do
  OAuth (via `?oauthError=`) como toast amigável na tela de login.
- `src/features/auth/components/login-form.tsx` e `register-form.tsx` —
  passaram a renderizar `<GoogleAuthButton />` junto do fluxo de
  e-mail/senha já existente (que continua funcionando exatamente como
  antes).
- `src/app/(auth)/login/page.tsx` — passa o `redirectedFrom` (o parâmetro já
  usado pelo middleware em `src/infrastructure/supabase/proxy.ts`) como
  `next` para o `LoginForm`, e renderiza o `OAuthErrorToast`.

## 5. Checklist de teste manual (após configurar o Google Cloud + Supabase)

1. Abrir `/login` e `/register` — o botão "Entrar/Continuar com Google"
   deve aparecer, com o logo do Google, abaixo do divisor "Ou continue com".
2. Clicar no botão — deve redirecionar para a tela de consentimento do
   Google.
3. Fazer login com uma conta Google **nova** (sem cadastro prévio no
   NomeIA) — deve voltar para `/onboarding` (usuário novo).
4. Completar o onboarding e fazer logout; entrar de novo com a mesma conta
   Google — deve ir direto para `/dashboard` (onboarding já concluído).
5. Verificar em **Table Editor → profiles** no Supabase que o profile tem
   `name`, `avatar_url` e `email` preenchidos com os dados do Google, e que
   **não existe uma linha duplicada**.
6. Editar o nome/avatar manualmente no NomeIA, fazer logout e login de novo
   com Google — o dado personalizado **não deve ser sobrescrito** pelo
   Google.
7. Tentar entrar com Google usando o e-mail de uma conta que já existe por
   senha — deve mostrar a mensagem amigável de conflito (ver seção "Fase 5"
   acima), nunca criar uma segunda conta.
8. Cancelar o consentimento na tela do Google — deve voltar para `/login`
   com a mensagem "Login com Google cancelado.", sem erro técnico visível.
9. Confirmar que o logout (botão já existente) continua funcionando
   normalmente para uma sessão criada via Google.
10. Tentar acessar uma rota protegida deslogado (ex.: `/dashboard`) — deve
    cair em `/login?redirectedFrom=/dashboard`; entrando com Google a partir
    dessa tela, deve voltar exatamente para `/dashboard` ao final.

## 6. Problemas comuns

- **"redirect_uri_mismatch" na tela do Google**: a URL cadastrada em
  "Authorized redirect URIs" no Google Cloud não bate com a URL de callback
  do Supabase (`https://<project-ref>.supabase.co/auth/v1/callback`) —
  revise o passo 1.
- **Callback cai em `oauthError=exchange_failed` sempre**: geralmente
  Client ID/Secret errados ou não salvos no Supabase, ou o provider Google
  ainda não está habilitado em Authentication → Providers.
- **Volta para `/login` em vez de `/onboarding` ou `/dashboard` sem erro
  nenhum**: verifique os logs do servidor (Next.js) por linhas
  `[GOOGLE_OAUTH] ...` — todo erro é logado ali com detalhe técnico, mesmo
  quando a tela mostra só uma mensagem amigável.
- **Login funciona em produção mas não em localhost (ou vice-versa)**:
  confirme que **ambos** os domínios estão em "Redirect URLs" no Supabase
  (passo 2) — cada ambiente precisa da própria entrada.

## 7. Limitação desta implementação (importante)

Este documento e o código foram validados com `tsc`, os testes automatizados
do projeto e `npm run build`. **Não foi possível realizar um teste real de
ponta a ponta com uma conta Google de verdade** neste ambiente, porque isso
exige credenciais reais do Google Cloud/Supabase que não estavam
disponíveis. Ou seja: o fluxo está implementado e testado no nível de
unidade/integração estática, mas o "login com Google funciona 100%" só pode
ser confirmado depois que você completar os passos 1–2 acima e rodar o
checklist da seção 5 manualmente.
