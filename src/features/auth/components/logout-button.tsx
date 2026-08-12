"use client"

import { useTransition } from "react"

import { useRouter } from "next/navigation"

import { Loader2, LogOut } from "lucide-react"
import { toast } from "sonner"

import { logoutAction } from "@/application/auth/logout.action"
import { Button } from "@/components/ui/button"
import { clearUserLocalData } from "@/utils/user-data"

export function LogoutButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleLogout() {
    startTransition(async () => {
      clearUserLocalData()
      const result = await logoutAction()
      if (result.success) {
        toast.success("Desconectado com sucesso!")
        router.push("/login")
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Button variant="destructive" onClick={handleLogout} disabled={isPending}>
      {isPending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <LogOut className="mr-2 h-4 w-4" />
      )}
      Sair da Conta
    </Button>
  )
}
