# Mentor Concursos IA

A melhor plataforma de mentoria inteligente para concursos públicos do Brasil.

## 🛠 Tecnologias

- **Framework:** [Next.js 15](https://nextjs.org/) (App Router)
- **Linguagem:** [TypeScript](https://www.typescriptlang.org/)
- **Estilização:** [Tailwind CSS v4](https://tailwindcss.com/)
- **Componentes UI:** [shadcn/ui](https://ui.shadcn.com/)
- **Estado de Servidor:** [TanStack Query v5](https://tanstack.com/query)
- **Estado Global:** [Zustand](https://zustand-demo.pmnd.rs/)
- **Formulários:** [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/)
- **Backend/DB:** [Supabase](https://supabase.com/) (PostgreSQL)

## 🏗 Arquitetura

O projeto utiliza **Clean Architecture** dividida em 5 camadas principais:

- `src/domain`: Entidades e regras de negócio puras.
- `src/application`: Casos de uso e portas/interfaces.
- `src/infrastructure`: Implementações de repositórios (Supabase, APIs externas).
- `src/features`: Componentes de UI, hooks e pequenos estados amarrados a uma funcionalidade.
- `src/app` & `src/components`: Camada de apresentação (Next.js) e Design System.

*Regra de Ouro:* As dependências sempre apontam para o centro (Domain). O Domain nunca importa nada de fora.

## 🚀 Como Executar

1. Instale as dependências:
   ```bash
   npm install
   ```

2. Configure as variáveis de ambiente:
   Crie um arquivo `.env.local` na raiz do projeto baseado nas variáveis exigidas em `src/config/env.ts`:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=sua_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_key
   ```

3. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

4. Acesse [http://localhost:3000](http://localhost:3000) no seu navegador.

## 🔒 Qualidade de Código

O projeto possui rigoroso controle de qualidade automatizado:
- **TypeScript Strict Mode** ativado.
- **ESLint** e **Prettier** para formatação de código.
- **Husky** configurado com *pre-commit* (lint-staged executando ESLint e Prettier) e *commit-msg* (Commitlint validando Conventional Commits).

## 📄 Licença

Projeto privado.
