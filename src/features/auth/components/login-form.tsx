"use client"

import { useTransition } from "react"
import { useForm } from "react-hook-form"

import { useRouter } from "next/navigation"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
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
              <FormLabel>E-mail</FormLabel>
              <FormControl>
                <Input placeholder="seu@email.com" type="email" disabled={isPending} {...field} />
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
              <FormLabel>Senha</FormLabel>
              <FormControl>
                <Input placeholder="******" type="password" disabled={isPending} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Entrar
        </Button>
      </form>
    </Form>
  )
}
