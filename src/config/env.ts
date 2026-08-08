import { z } from "zod"

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("A URL do Supabase é inválida."),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "A chave anônima do Supabase é obrigatória."),
})

const _env = envSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env['NEXT_PUBLIC_SUPABASE_URL'],
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'],
})

if (!_env.success) {
  console.error("❌ Erro de validação nas variáveis de ambiente:")
  console.error(_env.error.format())
  throw new Error("Variáveis de ambiente inválidas. Verifique o arquivo .env")
}

export const env = _env.data
