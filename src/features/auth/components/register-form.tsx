"use client"

import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"

import { useRouter } from "next/navigation"
import Link from "next/link"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, MailCheck } from "lucide-react"
import { toast } from "sonner"

import { registerAction } from "@/application/auth/register.action"
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
import { type RegisterInput, registerSchema } from "@/domain/auth/auth.schemas"

export function RegisterForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isSuccess, setIsSuccess] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState("")

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  })

  function onSubmit(values: RegisterInput) {
    startTransition(async () => {
      const response = await registerAction(values)

      if (!response.success) {
        if (response.code === "ALREADY_REGISTERED") {
          toast.error(response.error, {
            action: {
              label: "Fazer Login",
              onClick: () => router.push("/login")
            }
          })
        } else {
          toast.error(response.error)
        }
        return
      }

      setRegisteredEmail(values.email)
      setIsSuccess(true)
    })
  }

  async function handleResend() {
    startTransition(async () => {
      const response = await resendConfirmationAction(registeredEmail)
      if (response.success) {
        toast.success("E-mail de confirmação reenviado!")
      } else {
        toast.error(response.error)
      }
    })
  }

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 text-center animate-fade-in">
        <div className="rounded-full bg-primary/10 p-4">
          <MailCheck className="h-10 w-10 text-primary" />
        </div>
        <h3 className="text-xl font-bold">Verifique seu E-mail</h3>
        <p className="text-sm text-muted-foreground">
          Enviamos um link de confirmação para <br/>
          <span className="font-semibold text-foreground">{registeredEmail}</span>
        </p>
        <div className="pt-4 flex flex-col w-full gap-2">
          <Button 
            variant="outline" 
            onClick={handleResend} 
            disabled={isPending}
            className="w-full"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Reenviar E-mail
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/login">Voltar para o Login</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 w-full animate-fade-in">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome</FormLabel>
              <FormControl>
                <Input placeholder="Seu nome" disabled={isPending} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
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
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirmar Senha</FormLabel>
              <FormControl>
                <Input placeholder="******" type="password" disabled={isPending} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Criar Conta
        </Button>
      </form>
    </Form>
  )
}
