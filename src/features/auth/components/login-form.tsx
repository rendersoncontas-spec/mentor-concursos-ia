"use client"

import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react"
import { toast } from "sonner"

import { loginAction } from "@/application/auth/login.action"
import { resendConfirmationAction } from "@/application/auth/resend-confirmation.action"
import { getGuardUserId, purgeOnUserSwitch } from "@/infrastructure/offline/user-switch-guard"
import { clearServerActionCache } from "@/lib/server-action-cache"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { type LoginInput, loginSchema } from "@/domain/auth/auth.schemas"
import { GoogleAuthButton } from "@/features/auth/components/google-auth-button"

export function LoginForm({ next }: { next?: string | null } = {}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showPassword, setShowPassword] = useState(false)

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  })

  function onSubmit(values: LoginInput) {
    startTransition(async () => {
      const response = await loginAction(values)

      if (!response.success) {
        if (response.code === "UNCONFIRMED_EMAIL") {
          toast.error(response.error, {
            action: {
              label: "Reenviar E-mail",
              onClick: async () => {
                const res = await resendConfirmationAction(values.email)
                if (res.success) toast.success("E-mail reenviado com sucesso!")
                else toast.error(res.error)
              }
            },
            duration: 10000,
          })
        } else if (response.code === "INVALID_CREDENTIALS") {
          toast.error(response.error, {
            action: {
              label: "Esqueci a senha",
              onClick: () => router.push("/forgot-password")
            },
            duration: 5000,
          })
        } else {
          toast.error(response.error)
        }
        return
      }

      toast.success("Login realizado com sucesso!")
      // G1.1 (G-30): login por senha é SPA (sem reload) — invalida o cache do
      // contexto JS anterior para o novo usuário nunca herdar dado alheio.
      clearServerActionCache()
      // G1.7 (G-31): troca de usuário sem logout canônico prévio (expiração,
      // cookie removido, aba compartilhada). Purga o estado do anterior e
      // recarrega para matar timers/contexto ainda vivos no JS.
      const { switched } = await purgeOnUserSwitch(await getGuardUserId())
      if (switched) {
        window.location.replace("/dashboard")
        return
      }
      router.push("/dashboard")
      router.refresh()
    })
  }

  return (
    <>
      <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 w-full">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium">E-mail</FormLabel>
              {/* G2.20: FormControl envolve o PRÓPRIO input (antes envolvia o div),
                  para o rótulo "E-mail" e a mensagem de erro ficarem ligados a ele. */}
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <FormControl>
                  <Input
                    placeholder="seu.email@exemplo.com"
                    type="email"
                    autoComplete="email"
                    disabled={isPending}
                    className="pl-9 h-11 bg-background"
                    {...field}
                  />
                </FormControl>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel className="text-sm font-medium">Senha</FormLabel>
                <Link
                  href="/forgot-password"
                  className="text-xs text-primary hover:underline font-medium"
                >
                  Esqueceu sua senha?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <FormControl>
                  <Input
                    placeholder="••••••••"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    disabled={isPending}
                    className="pl-9 pr-10 h-11 bg-background"
                    {...field}
                  />
                </FormControl>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          className="w-full h-11 font-semibold text-base gap-2 shadow-xs transition-all"
          disabled={isPending}
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {/* G2.20: o botão não fica sem nome acessível durante o envio. */}
              <span className="sr-only">Entrando…</span>
            </>
          ) : (
            <>
              Entrar na Plataforma
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </form>
      </Form>

      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border/60" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-background px-2 text-muted-foreground">
            Ou continue com
          </span>
        </div>
      </div>

      <GoogleAuthButton mode="login" next={next} />
    </>
  )
}

