"use client"

import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { forgotPasswordAction } from "@/application/auth/forgot-password.action"
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
import { type ForgotPasswordInput, forgotPasswordSchema } from "@/domain/auth/auth.schemas"

export function ForgotPasswordForm() {
  const [isPending, startTransition] = useTransition()
  const [isSent, setIsSent] = useState(false)

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  })

  function onSubmit(values: ForgotPasswordInput) {
    startTransition(async () => {
      const response = await forgotPasswordAction(values)

      if (!response.success) {
        toast.error(response.error)
        return
      }

      setIsSent(true)
      toast.success("E-mail de recuperação enviado!")
    })
  }

  if (isSent) {
    return (
      <div className="text-center space-y-4">
        <p className="text-muted-foreground">
          Verifique sua caixa de entrada. Enviamos um link para você redefinir sua senha.
        </p>
        <Button variant="outline" onClick={() => setIsSent(false)}>
          Tentar outro e-mail
        </Button>
      </div>
    )
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
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Enviar Link de Recuperação
        </Button>
      </form>
    </Form>
  )
}
