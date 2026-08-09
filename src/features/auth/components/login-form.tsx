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

export function LoginForm() {
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
      router.push("/dashboard")
      router.refresh()
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 w-full">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium">E-mail</FormLabel>
              <FormControl>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="seu.email@exemplo.com"
                    type="email"
                    disabled={isPending}
                    className="pl-9 h-11 bg-background"
                    {...field}
                  />
                </div>
              </FormControl>
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
              <FormControl>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="••••••••"
                    type={showPassword ? "text" : "password"}
                    disabled={isPending}
                    className="pl-9 pr-10 h-11 bg-background"
                    {...field}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
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
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          className="w-full h-11 font-semibold text-base gap-2 shadow-md hover:shadow-lg transition-all"
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Entrar na Plataforma
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </form>
    </Form>
  )
}

