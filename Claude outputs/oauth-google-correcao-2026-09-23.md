# NomeIA — Correção Final do Google OAuth

**Data:** 2026-09-23 · **Branch:** local, sem commits (regra permanente respeitada) · Nenhum arquivo de código foi alterado nesta fase.

---

## Conclusão em uma frase

O código está correto. O erro **não é de frontend nem de `/auth/callback`** — é o próprio Supabase Auth (GoTrue) recusando a requisição em `/authorize` porque **o provider Google está desabilitado (ou sem Client ID/Secret) no Dashboard do Supabase**. Isso foi confirmado com um log real de produção, não por suposição.

---

## Evidência real (não suposição)

Consulta aos logs reais do projeto Supabase (`snlwfnwjrcqtlilhwgfm`, fonte `auth_logs`), evento mais recente:

```json
{
  "time": "2026-09-23T12:39:08Z",
  "path": "/authorize",
  "method": "GET",
  "status": 400,
  "error": "provider is not enabled",
  "error_code": "validation_failed",
  "referer": "http://localhost:3000"
}
```

Isso mostra que a requisição **nunca chega ao Google** — o próprio endpoint `/authorize` do Supabase (chamado internamente por `signInWithOAuth`) já rejeita de cara, porque o provider Google está desligado (ou incompleto) na configuração de Auth do projeto. O `referer: localhost:3000` confirma que foi um teste local, batendo com o relato do problema.

---

## 1. Auditoria do código (concluída — nada alterado)

| Arquivo | Verificado | Resultado |
|---|---|---|
| `src/features/auth/components/google-auth-button.tsx` | `signInWithOAuth({ provider: "google", options: { redirectTo } })`, construção do `redirectTo` | ✅ Correto — chama `/auth/callback` do próprio app (não confunde com o callback do Supabase), valida `next` com `isSafeRedirectPath`, sem segredos, erro tratado com toast genérico + log técnico só no console |
| `src/app/auth/callback/route.ts` | `exchangeCodeForSession`, cliente server, classificação de erro, redirects | ✅ Correto — usa cliente **server** (nunca service role), classifica erros por `error.code` (hardening já aplicado em 2026-09-21), trata `access_denied`/`missing_code`, nunca expõe detalhe técnico ao usuário |
| `src/infrastructure/supabase/server.ts` / `client.ts` | cookies, PKCE | ✅ Correto — `createServerClient`/`createBrowserClient` padrão do `@supabase/ssr`, cookies httpOnly geridos pelo Next, sem lógica customizada arriscada |
| `src/domain/auth/auth-redirect.ts` | `isSafeRedirectPath`, `resolvePostAuthDestination` | ✅ Correto — bloqueia protocol-relative URLs, esquemas embutidos, `javascript:`, espaços/controles; open-redirect não é possível |
| `src/application/auth/google-oauth-profile.ts` | `backfillProfileFromGoogle`, `getOnboardingCompleted` | ✅ Correto — nunca faz INSERT em `profiles` (evita corrida com o trigger `handle_new_user()`), nunca sobrescreve dado que o usuário já personalizou, nunca lança exceção que derrubaria o login |

**Nenhuma linha de código foi alterada** — confirmando a hipótese do próprio pedido: "se o código já estiver correto para Supabase SSR/PKCE, não alterá-lo."

## 2. Supabase Auth — Google Provider

**Não posso verificar nem alterar isso por nenhuma ferramenta disponível nesta sessão.** As ferramentas de MCP do Supabase disponíveis aqui (`get_project`, `list_tables`, `execute_sql`, `query_logs`, `apply_migration`, etc.) não incluem acesso à configuração de Auth Providers — isso vive exclusivamente no Dashboard.

**O que você precisa confirmar/fazer, exatamente:**

1. Acesse `https://supabase.com/dashboard/project/snlwfnwjrcqtlilhwgfm/auth/providers`
2. Abra **Google**
3. Confirme que **Enabled** está ligado (o log real mostra que hoje está desligado ou incompleto — é a causa raiz)
4. Confirme que **Client ID (for OAuth)** está preenchido
5. Confirme que **Client Secret (for OAuth)** está preenchido
6. Nunca cole o Client Secret em nenhum arquivo do repositório, `.env` versionado, ou variável `NEXT_PUBLIC_*` — ele só deve existir dentro deste campo do Dashboard.

## 3. Google Cloud Console

Verifique em `https://console.cloud.google.com/apis/credentials` → o OAuth Client usado:

- **Tipo:** Web application
- **Authorized JavaScript origins:** deve incluir `http://localhost:3000` e o domínio real de produção
- **Authorized redirect URIs:** deve conter **exatamente**:
  ```
  https://snlwfnwjrcqtlilhwgfm.supabase.co/auth/v1/callback
  ```
  Este é o callback do **Supabase**, não o `/auth/callback` do Next.js — são coisas diferentes (ver seção 5 abaixo). Um erro comum é colocar a URL do app aqui; isso não vai gerar o erro atual (que é "provider not enabled", anterior a qualquer redirect do Google), mas vale conferir enquanto o provider estiver sendo configurado.

## 4. Supabase — URL Configuration

Em `https://supabase.com/dashboard/project/snlwfnwjrcqtlilhwgfm/auth/url-configuration`:

- **Site URL:** domínio real de produção
- **Redirect URLs** (allowlist) deve conter:
  - `http://localhost:3000/auth/callback`
  - `https://SEU-DOMINIO-DE-PRODUCAO/auth/callback`

Sem essas entradas, mesmo com o provider habilitado, o Supabase recusaria o `redirectTo` enviado pelo app.

## 5. Os dois callbacks (não inverter)

```
Google  →  https://snlwfnwjrcqtlilhwgfm.supabase.co/auth/v1/callback   (Supabase, configurado no Google Cloud)
        →  Supabase redireciona internamente
        →  http://localhost:3000/auth/callback  (ou domínio de produção — rota Next.js, código já correto)
        →  exchangeCodeForSession()
        →  usuário autenticado
```

O código do app já está certo nesse fluxo — ele só participa do segundo salto. O primeiro salto (Google → Supabase) é quem está falhando hoje, antes mesmo de o Google entrar em cena.

## 6. Teste (a ser feito por você, depois de habilitar o provider)

Não posso executar login real do Google (exigiria digitar credenciais reais, o que nunca faço). Depois de habilitar o provider e confirmar Client ID/Secret:

1. `/login` → clicar em "Continuar com Google"
2. Confirmar redirecionamento para a tela de consentimento do Google (se cair de novo em erro "provider not enabled", o toggle Enabled ainda não foi salvo)
3. Autenticar → retornar para `/auth/callback` → confirmar sessão criada → confirmar redirecionamento para o Dashboard (ou onboarding, se for o primeiro login)
4. Fechar/reabrir o app → confirmar que a sessão persiste
5. Logout → repetir o login com Google

## 7. Resposta às perguntas obrigatórias

| # | Pergunta | Resposta |
|---|---|---|
| A | Provider Google habilitado no Supabase? | ❌ **Não** — confirmado por log real de hoje (`"error":"provider is not enabled"`, 2026-09-23T12:39:08Z). Requer ação sua no Dashboard. |
| B | Client ID configurado? | ⚠️ Não verificável por nenhuma ferramenta desta sessão — confirme no Dashboard (seção 2). |
| C | Client Secret configurado? | ⚠️ Não verificável por nenhuma ferramenta desta sessão — confirme no Dashboard (seção 2). Nunca deve aparecer em código. |
| D | Redirect URI do Google correto? | ⚠️ Não verificável — confirme no Google Cloud Console que é exatamente `https://snlwfnwjrcqtlilhwgfm.supabase.co/auth/v1/callback` (seção 3). |
| E | Redirect URL do Supabase correto? | ⚠️ Não verificável — confirme em Auth → URL Configuration que inclui `.../auth/callback` local e de produção (seção 4). |
| F | Login com Google funcionando? | ❌ Não, hoje — bloqueado no passo 0 (antes de chegar ao Google), pela causa raiz acima. |
| G | Sessão sendo criada? | Não aplicável ainda — o fluxo nunca chega a esse ponto. Código de `exchangeCodeForSession` já está pronto e correto para quando o provider for habilitado. |
| H | Logout funcionando? | Não testado nesta fase (fora do escopo do bug relatado; fluxo de logout não foi tocado nem investigado). |
| I | Arquivos de código alterados? | **Nenhum.** Auditoria completa (seção 1) não encontrou bug de código — por instrução do próprio pedido, nada foi recriado ou alterado. |
| J | tsc/testes? | Nenhum código foi modificado nesta fase. Última verificação completa neste mesmo estado de código (Fase 20, sem alterações desde então): `tsc --noEmit` 0 erros, suite completa 780/780 testes passando. Uma nova rodada de `tsc` foi tentada nesta fase mas excedeu o limite de tempo por chamada do ambiente (~170s) sem erro — não é um teste concluído, e é reportado como tal, não fabricado; como zero arquivos mudaram, o resultado da Fase 20 continua válido. |

---

## Próximo passo (seu, não meu)

Habilitar o provider Google e preencher Client ID/Secret em **Authentication → Providers → Google** no Dashboard do Supabase é a única ação que falta. Depois disso, o fluxo de código já existente (auditado e aprovado acima) deve funcionar sem qualquer alteração.
