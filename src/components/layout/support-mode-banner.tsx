"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ShieldAlert, LogOut, Clock } from "lucide-react"
import { toast } from "sonner"

import { endSupportSessionAction } from "@/application/admin/admin.actions"
import { Button } from "@/components/ui/button"

interface SupportModeBannerProps {
  targetUserName: string
  targetUserEmail: string
  expiresAt: string
}

export function SupportModeBanner({
  targetUserName,
  targetUserEmail,
  expiresAt,
}: SupportModeBannerProps) {
  const router = useRouter()
  const [leaving, setLeaving] = useState(false)
  const [remainingTime, setRemainingTime] = useState<string>("")

  useEffect(() => {
    const updateCountdown = () => {
      const diff = new Date(expiresAt).getTime() - Date.now()
      if (diff <= 0) {
        setRemainingTime("Expirado")
        toast.warning("Sessão de suporte expirada.")
        void handleLeave()
        return
      }
      const minutes = Math.floor(diff / 60000)
      const seconds = Math.floor((diff % 60000) / 1000)
      setRemainingTime(`${minutes}m ${seconds < 10 ? "0" : ""}${seconds}s`)
    }

    updateCountdown()
    const timer = setInterval(updateCountdown, 1000)
    return () => clearInterval(timer)
  }, [expiresAt])

  const handleLeave = async () => {
    setLeaving(true)
    try {
      const res = await endSupportSessionAction()
      if (res.ok) {
        toast.success("Sessão de suporte encerrada. Você retornou para o painel administrativo.")
        router.push("/admin")
        router.refresh()
      } else {
        toast.error(res.error || "Erro ao encerrar suporte.")
      }
    } catch {
      toast.error("Erro ao encerrar modo de suporte.")
    } finally {
      setLeaving(false)
    }
  }

  return (
    <aside
      aria-label="Aviso de modo suporte ativo"
      className="sticky top-0 z-50 w-full bg-gradient-to-r from-amber-600 via-amber-700 to-amber-800 text-white shadow-lg border-b border-amber-500/40 px-4 py-2.5"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs font-semibold">
        <div className="flex items-center gap-2.5">
          <div className="p-1 bg-white/20 rounded-lg shrink-0 animate-pulse">
            <ShieldAlert className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="font-extrabold uppercase tracking-wider bg-white/25 px-2 py-0.5 rounded text-[10px] mr-2">
              Modo Suporte Ativo
            </span>
            <span>
              Visualizando conta de: <strong className="underline underline-offset-2">{targetUserName}</strong>
              {targetUserEmail && <span className="opacity-80 ml-1">({targetUserEmail})</span>}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1 font-mono bg-black/20 px-2.5 py-1 rounded-md text-[11px]">
            <Clock className="w-3.5 h-3.5 text-amber-200" />
            <span>Expira em: {remainingTime || "Calculando..."}</span>
          </div>

          <Button
            size="sm"
            onClick={() => void handleLeave()}
            disabled={leaving}
            className="h-7 px-3 text-xs font-black bg-white text-amber-900 hover:bg-amber-100 rounded-lg cursor-pointer shadow-xs"
          >
            <LogOut className="w-3.5 h-3.5 mr-1" />
            {leaving ? "Saindo..." : "Sair do Suporte"}
          </Button>
        </div>
      </div>
    </aside>
  )
}
