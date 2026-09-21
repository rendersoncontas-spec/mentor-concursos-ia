"use client"

import { useEffect, useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { useRouter } from "next/navigation"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

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
import { resetPasswordSchema, type ResetPasswordInput } from "@/domain/auth/auth.schemas"
import { createClient } from "@/infrastructure/supabase/client"

/**
 * Completa o fluxo de "esqueci minha senha" iniciado em
 * forgot-password-form.tsx. O link do e-mail de recuperacao traz o usuario
 * de volta para esta pagina (/update-password) e o client do Supabase
 * (createBrowserClient, detectSessionInUrl: true por padrao) processa o
 * codigo/token da URL sozinho e estabelece uma sessao de recuperacao — nao
 * precisamos trocar o codigo manualmente aqui. So confirmamos que a sessao
 * existe antes de liberar o formulario, porque sem ela `updateUser` falha
 * com "Auth session missing" e o usuario veria um erro sem contexto.
 */
export function UpdatePasswordForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [sessionReady, setSessionReady] = useState<boolean | null>(null)

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  })

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getSession().then(({ data }) => {
      setSessionReady((prev) => (prev === true ? prev : Boolean(data.session)))
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setSessionReady(true)
      }
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  function onSubmit(values: ResetPasswordInput) {
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: values.password })

      if (error) {
        toast.error("Não foi possível redefinir a senha. Solicite um novo link e tente novamente.")
        return
      }

      toast.success("Senha redefinida com sucesso! Faça login com a nova senha.")
      await supabase.auth.signOut()
      router.push("/login")
    })
  }

  if (sessionReady === false) {
    return (
      <div className="text-center space-y-4">
        <p className="text-muted-foreground">
          Este link de redefinição é inválido ou já expirou. Solicite um novo link de recuperação.
        </p>
        <Button variant="outline" onClick={() => router.push("/forgot-password")}>
          Solicitar novo link
        </Button>
      </div>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 w-full">
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nova senha</FormLabel>
              <FormControl>
                <Input type="password" disabled={isPending || sessionReady === null} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirmar nova senha</FormLabel>
              <FormControl>
                <Input type="password" disabled={isPending || sessionReady === null} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isPending || sessionReady === null}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Redefinir senha
        </Button>
      </form>
    </Form>
  )
}
