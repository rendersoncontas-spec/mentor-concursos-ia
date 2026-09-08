"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ShieldAlert,
  Search,
  UserCheck,
  LifeBuoy,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Eye,
  Sliders,
  CheckCircle,
  AlertTriangle,
} from "lucide-react"
import { toast } from "sonner"

import {
  type AdminUserListItem,
  searchUsersAdminAction,
  startSupportSessionAction,
  updateUserRoleAdminAction,
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
import { Input } from "@/components/ui/input"

interface AdminDashboardViewProps {
  currentOperatorRole: UserRole
  currentOperatorId: string
}

export function AdminDashboardView({
  currentOperatorRole,
  currentOperatorId,
}: AdminDashboardViewProps) {
  const router = useRouter()
  const [users, setUsers] = useState<AdminUserListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalUsers, setTotalUsers] = useState(0)

  // Modais de ação
  const [targetForSupport, setTargetForSupport] = useState<AdminUserListItem | null>(null)
  const [startingSupport, setStartingSupport] = useState(false)

  const [targetForRole, setTargetForRole] = useState<AdminUserListItem | null>(null)
  const [selectedNewRole, setSelectedNewRole] = useState<UserRole>("user")
  const [updatingRole, setUpdatingRole] = useState(false)

  // Debounce da busca
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery)
      setPage(1)
    }, 350)
    return () => clearTimeout(handler)
  }, [searchQuery])

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await searchUsersAdminAction({
        query: debouncedQuery,
        page,
        limit: 12,
        roleFilter,
      })

      if (res.data) {
        setUsers(res.data.users)
        setTotalPages(res.data.totalPages || 1)
        setTotalUsers(res.data.total || 0)
      } else if (res.error) {
        toast.error(res.error)
      }
    } catch {
      toast.error("Erro ao consultar lista de usuários.")
    } finally {
      setLoading(false)
    }
  }, [debouncedQuery, page, roleFilter])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const handleStartSupport = async () => {
    if (!targetForSupport) return
    setStartingSupport(true)
    try {
      const res = await startSupportSessionAction(targetForSupport.id)
      if (res.ok) {
        toast.success(`Modo de suporte ativado na conta de ${targetForSupport.name}!`)
        setTargetForSupport(null)
        router.push("/dashboard")
        router.refresh()
      } else {
        toast.error(res.error || "Erro ao iniciar suporte.")
      }
    } catch {
      toast.error("Erro ao conectar à sessão de suporte.")
    } finally {
      setStartingSupport(false)
    }
  }

  const handleUpdateRole = async () => {
    if (!targetForRole) return
    setUpdatingRole(true)
    try {
      const res = await updateUserRoleAdminAction(targetForRole.id, selectedNewRole)
      if (res.ok) {
        toast.success(`Papel de ${targetForRole.name} atualizado para ${selectedNewRole}!`)
        setTargetForRole(null)
        void loadUsers()
      } else {
        toast.error(res.error || "Erro ao atualizar permissão.")
      }
    } catch {
      toast.error("Erro ao salvar permissão.")
    } finally {
      setUpdatingRole(false)
    }
  }

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case "admin":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
            Administrador
          </span>
        )
      case "moderator":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            Moderador
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-muted text-muted-foreground border border-border">
            Estudante
          </span>
        )
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header do Painel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2.5">
            <ShieldAlert className="w-6 h-6 text-[#2563EB]" />
            Painel de Administração e Suporte
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Localize estudantes, acerte pendências e acesse temporariamente em modo de suporte seguro.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {getRoleBadge(currentOperatorRole)}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadUsers()}
            disabled={loading}
            className="text-xs font-bold rounded-xl cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-card p-3.5 rounded-2xl border shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar por nome, email ou ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs font-medium bg-background"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label htmlFor="role-filter" className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
            Filtrar:
          </label>
          <select
            id="role-filter"
            aria-label="Filtrar usuários por papel"
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value)
              setPage(1)
            }}
            className="h-9 px-3 text-xs font-bold bg-background border rounded-xl focus:outline-none cursor-pointer"
          >
            <option value="all">Todos os papéis ({totalUsers})</option>
            <option value="user">Apenas Estudantes</option>
            <option value="moderator">Apenas Moderadores</option>
            <option value="admin">Apenas Administradores</option>
          </select>
        </div>
      </div>

      {/* Lista / Tabela de Usuários */}
      <div className="bg-card rounded-2xl border shadow-xs overflow-hidden">
        {loading && users.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-muted-foreground space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin text-[#2563EB]" />
            <p className="text-xs font-medium">Carregando usuários...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-muted-foreground space-y-2 text-center">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
            <p className="text-sm font-bold text-foreground">Nenhum usuário encontrado</p>
            <p className="text-xs">Tente ajustar o termo de pesquisa ou os filtros aplicados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground font-extrabold uppercase tracking-wider text-[10px] border-b">
                <tr>
                  <th className="px-4 py-3">Estudante</th>
                  <th className="px-4 py-3">Papel</th>
                  <th className="px-4 py-3">Meta Semanal</th>
                  <th className="px-4 py-3">Cadastro</th>
                  <th className="px-4 py-3 text-right">Ações de Suporte</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((u) => {
                  const isCurrentOperator = u.id === currentOperatorId
                  const isTargetAdmin = u.role === "admin"
                  const canImpersonate =
                    !isCurrentOperator &&
                    (currentOperatorRole === "admin" || (currentOperatorRole === "moderator" && !isTargetAdmin))

                  return (
                    <tr key={u.id} className="hover:bg-muted/25 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-foreground text-xs">{u.name}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{u.email}</div>
                      </td>

                      <td className="px-4 py-3.5">{getRoleBadge(u.role)}</td>

                      <td className="px-4 py-3.5 font-bold font-mono">
                        {u.weeklyStudyHours}h / semana
                      </td>

                      <td className="px-4 py-3.5 text-muted-foreground text-[11px]">
                        {new Date(u.createdAt).toLocaleDateString("pt-BR")}
                      </td>

                      <td className="px-4 py-3.5 text-right space-x-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => router.push(`/admin/users/${u.id}`)}
                          className="h-7 px-2.5 text-[11px] font-bold rounded-lg cursor-pointer text-muted-foreground hover:text-foreground"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" /> Diagnóstico
                        </Button>

                        {canImpersonate && (
                          <Button
                            size="sm"
                            onClick={() => setTargetForSupport(u)}
                            className="h-7 px-2.5 text-[11px] font-bold bg-[#2563EB] text-white hover:bg-[#1D4ED8] rounded-lg cursor-pointer shadow-xs"
                          >
                            <LifeBuoy className="w-3.5 h-3.5 mr-1" /> Entrar como usuário
                          </Button>
                        )}

                        {currentOperatorRole === "admin" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setTargetForRole(u)
                              setSelectedNewRole(u.role)
                            }}
                            className="h-7 px-2 text-[11px] font-semibold border-border/80 hover:bg-muted rounded-lg cursor-pointer"
                          >
                            <Sliders className="w-3 h-3 mr-1" /> Papel
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3.5 border-t bg-card text-xs">
            <span className="text-muted-foreground">
              Página <strong>{page}</strong> de <strong>{totalPages}</strong> ({totalUsers} total)
            </span>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="h-7 px-2 text-xs rounded-lg cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="h-7 px-2 text-xs rounded-lg cursor-pointer"
              >
                Próxima <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Confirmar Entrada em Modo de Suporte */}
      <Dialog open={targetForSupport !== null} onOpenChange={(open) => !open && setTargetForSupport(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-black text-foreground">
              <LifeBuoy className="w-5 h-5 text-[#2563EB]" />
              Iniciar Modo de Suporte
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1.5 leading-relaxed">
              Você está prestes a entrar temporariamente na conta de:
              <br />
              <strong className="text-foreground font-semibold text-sm">
                {targetForSupport?.name} ({targetForSupport?.email})
              </strong>
              <br />
              <span className="block mt-2 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 p-2 rounded-lg">
                ⚠️ Todas as ações realizadas nesta sessão temporária serão registradas com seu identificador nos logs de auditoria. A sessão expira automaticamente em 30 minutos.
              </span>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTargetForSupport(null)}
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
              {startingSupport ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Conectando...
                </>
              ) : (
                "Sim, entrar como usuário"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Gerenciar Papel do Usuário (Admin Only) */}
      <Dialog open={targetForRole !== null} onOpenChange={(open) => !open && setTargetForRole(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-black text-foreground">
              <Sliders className="w-5 h-5 text-purple-600" />
              Alterar Papel de Acesso
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1.5">
              Defina o nível de permissão para <strong>{targetForRole?.name}</strong>:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            {[
              {
                id: "user" as UserRole,
                label: "Estudante (Padrão)",
                desc: "Acesso somente à sua própria conta de estudos.",
              },
              {
                id: "moderator" as UserRole,
                label: "Moderador",
                desc: "Pode pesquisar alunos, diagnosticar e entrar em modo suporte (sem gerenciar roles).",
              },
              {
                id: "admin" as UserRole,
                label: "Administrador",
                desc: "Acesso total: gerencia moderadores, permissões e configurações do sistema.",
              },
            ].map((opt) => (
              <label
                key={opt.id}
                onClick={() => setSelectedNewRole(opt.id)}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  selectedNewRole === opt.id
                    ? "bg-primary/5 border-primary text-foreground"
                    : "bg-card border-border hover:bg-muted/40 text-muted-foreground"
                }`}
              >
                <input
                  type="radio"
                  name="roleSelect"
                  checked={selectedNewRole === opt.id}
                  onChange={() => setSelectedNewRole(opt.id)}
                  className="mt-0.5 accent-[#2563EB] cursor-pointer"
                />
                <div>
                  <div className="text-xs font-bold text-foreground">{opt.label}</div>
                  <div className="text-[11px] text-muted-foreground">{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTargetForRole(null)}
              disabled={updatingRole}
              className="text-xs font-bold rounded-xl cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => void handleUpdateRole()}
              disabled={updatingRole}
              className="text-xs font-bold bg-purple-600 text-white hover:bg-purple-700 rounded-xl cursor-pointer"
            >
              {updatingRole ? "Salvando..." : "Salvar Permissão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
