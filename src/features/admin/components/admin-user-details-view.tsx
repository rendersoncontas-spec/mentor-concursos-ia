"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  Clock,
  HelpCircle,
  LifeBuoy,
  RefreshCw,
  Target,
  User,
  Zap,
} from "lucide-react"
import { toast } from "sonner"

import {
  type AdminUserDetail,
  getUserDetailsAdminAction,
  startSupportSessionAction,
} from "@/application/admin/admin.actions"
import type { UserRole } from "@/application/admin/auth-guard"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface AdminUserDetailsViewProps {
  userId: string
  currentOperatorRole: UserRole
  currentOperatorId: string
}

export function AdminUserDetailsView({
  userId,
  currentOperatorRole,
  currentOperatorId,
}: AdminUserDetailsViewProps) {
  const router = useRouter()
  const [detail, setDetail] = useState<AdminUserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [showSupportModal, setShowSupportModal] = useState(false)
  const [startingSupport, setStartingSupport] = useState(false)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      try {
        const res = await getUserDetailsAdminAction(userId)
        if (active && res.data) {
          setDetail(res.data)
        } else if (active && res.error) {
          toast.error(res.error)
        }
      } catch {
        if (active) toast.error("Erro ao carregar detalhes do estudante.")
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [userId])

  const handleStartSupport = async () => {
    if (!detail) return
    setStartingSupport(true)
    try {
      const res = await startSupportSessionAction(detail.id)
      if (res.ok) {
        toast.success(`Modo de suporte ativado na conta de ${detail.name}!`)
        setShowSupportModal(false)
        router.push("/dashboard")
        router.refresh()
      } else {
        toast.error(res.error || "Erro ao iniciar suporte.")
      }
    } catch {
      toast.error("Erro de conexão ao iniciar suporte.")
    } finally {
      setStartingSupport(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-6 sm:p-10 flex flex-col items-center justify-center space-y-3">
        <RefreshCw className="w-8 h-8 animate-spin text-[#2563EB]" />
        <p className="text-xs text-muted-foreground font-medium">Carregando diagnóstico do estudante...</p>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="max-w-5xl mx-auto p-6 sm:p-10 text-center space-y-4">
        <p className="text-sm font-bold text-foreground">Estudante não encontrado.</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/admin")}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Voltar ao Painel
        </Button>
      </div>
    )
  }

  const isSelf = detail.id === currentOperatorId
  const isTargetAdmin = detail.role === "admin"
  const canImpersonate =
    !isSelf &&
    (currentOperatorRole === "admin" || (currentOperatorRole === "moderator" && !isTargetAdmin))

  const formatHours = (min: number) => {
    const h = Math.floor(min / 60)
    const m = min % 60
    return `${h}h${m > 0 ? `${m}min` : ""}`
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Voltar */}
      <button
        type="button"
        onClick={() => router.push("/admin")}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Voltar para lista de usuários
      </button>

      {/* Header do Estudante */}
      <div className="bg-card rounded-2xl border p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center font-black text-primary text-lg">
            {detail.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-foreground">{detail.name}</h1>
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-muted text-muted-foreground border">
                {detail.role}
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{detail.email}</p>
          </div>
        </div>

        {canImpersonate && (
          <Button
            size="sm"
            onClick={() => setShowSupportModal(true)}
            className="h-9 px-4 text-xs font-bold bg-[#2563EB] text-white hover:bg-[#1D4ED8] rounded-xl cursor-pointer shadow-xs"
          >
            <LifeBuoy className="w-4 h-4 mr-1.5" /> Entrar como usuário
          </Button>
        )}
      </div>

      {/* Cards de Métricas e Diagnóstico */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-card p-4 rounded-2xl border shadow-xs space-y-1">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3 text-[#2563EB]" /> Total Estudado
          </span>
          <div className="text-lg font-black text-foreground font-mono">
            {formatHours(detail.stats.totalMinutes)}
          </div>
          <p className="text-[11px] text-muted-foreground">{detail.stats.totalSessions} sessões registradas</p>
        </div>

        <div className="bg-card p-4 rounded-2xl border shadow-xs space-y-1">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground flex items-center gap-1">
            <HelpCircle className="w-3 h-3 text-emerald-500" /> Questões
          </span>
          <div className="text-lg font-black text-foreground font-mono">
            {detail.stats.totalQuestions}
          </div>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
            {detail.stats.accuracyPercentage}% de acerto ({detail.stats.questionsCorrect} acertos)
          </p>
        </div>

        <div className="bg-card p-4 rounded-2xl border shadow-xs space-y-1">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground flex items-center gap-1">
            <Target className="w-3 h-3 text-amber-500" /> Meta Semanal
          </span>
          <div className="text-lg font-black text-foreground font-mono">
            {detail.weeklyStudyHours}h / semana
          </div>
          <p className="text-[11px] text-muted-foreground">
            {detail.onboardingCompleted ? "Onboarding concluído" : "Onboarding pendente"}
          </p>
        </div>

        <div className="bg-card p-4 rounded-2xl border shadow-xs space-y-1">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground flex items-center gap-1">
            <Calendar className="w-3 h-3 text-purple-500" /> Cadastro
          </span>
          <div className="text-sm font-bold text-foreground mt-1">
            {new Date(detail.createdAt).toLocaleDateString("pt-BR")}
          </div>
          <p className="text-[11px] text-muted-foreground font-mono">ID: {detail.id.slice(0, 8)}...</p>
        </div>
      </div>

      {/* Detalhes do Plano Ativo */}
      <div className="bg-card rounded-2xl border p-5 shadow-xs space-y-3">
        <h2 className="text-sm font-black text-foreground flex items-center gap-2">
          <Zap className="w-4 h-4 text-[#2563EB]" /> Planejamento Atual
        </h2>

        {detail.activePlan ? (
          <div className="bg-background/60 border rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <span className="font-bold text-foreground">Plano Versão {detail.activePlan.version}</span>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Motivo: {detail.activePlan.generatedReason} · Criado em{" "}
                {new Date(detail.activePlan.createdAt).toLocaleDateString("pt-BR")}
              </p>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              Ativo
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">O estudante ainda não possui um plano de estudos gerado.</p>
        )}
      </div>

      {/* Modal de Confirmação de Suporte */}
      <Dialog open={showSupportModal} onOpenChange={setShowSupportModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-black text-foreground">
              <LifeBuoy className="w-5 h-5 text-[#2563EB]" />
              Iniciar Modo de Suporte
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1.5 leading-relaxed">
              Você entrará temporariamente na conta de <strong>{detail.name}</strong> para diagnóstico e correção. Todas as ações nesta sessão serão registradas com sua identificação nos logs de auditoria.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSupportModal(false)}
              disabled={startingSupport}
              className="text-xs font-bold rounded-xl cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => void handleStartSupport()}
              disabled={startingSupport}
              className="text-xs font-bold bg-[#2563EB] text-white hover:bg-[#1D4ED8] rounded-xl cursor-pointer"
            >
              {startingSupport ? "Conectando..." : "Sim, entrar como usuário"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
