"use client"

import { useEffect, useRef, useState } from "react"

import { useTheme } from "next-themes"
import Image from "next/image"
import { useRouter } from "next/navigation"

import {
  Bell,
  CreditCard,
  FilePlus,
  HelpCircle,
  Library,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  User,
  UserCheck,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { AccountSettingsModal } from "@/features/profile/components/account-settings-modal"
import { clearUserLocalData } from "@/utils/user-data"
import { StudyHeaderControl } from "@/components/study/study-header-control"
import { ConnectionStatusIndicator } from "@/components/layout/connection-status-indicator"

interface AppHeaderProps {
  userEmail?: string
  userName?: string
  userId?: string
  avatarUrl?: string | null
  logoutAction: () => Promise<void>
  onOpenMenu?: () => void
}

export function AppHeader({
  userEmail,
  userName = "Estudante",
  userId = "",
  avatarUrl = null,
  logoutAction,
  onOpenMenu,
}: AppHeaderProps) {
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [isEditalModalOpen, setIsEditalModalOpen] = useState(false)
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false)
  const [editalRequestInput, setEditalRequestInput] = useState("")
  // Fonte de verdade: avatar_url do banco ou cache persistente
  const [avatarImg, setAvatarImg] = useState<string | null>(avatarUrl ?? null)

  const menuRef = useRef<HTMLDivElement>(null)

useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const avatarKey = userId ? `mentor_user_avatar_${userId}` : "mentor_user_avatar"
    const saved = localStorage.getItem(avatarKey) || localStorage.getItem("mentor_user_avatar")

    if (avatarUrl) {
       setAvatarImg(avatarUrl)
       try {
         localStorage.setItem(avatarKey, avatarUrl)
         localStorage.setItem("mentor_user_avatar", avatarUrl)
       } catch { /* localStorage indisponível (modo privado/cota cheia): segue sem o cache local */ }
     } else if (saved) {
       setAvatarImg(saved)
     }

    // Escutar atualizações de outros componentes (ex: modal de perfil)
    const handleAvatarUpdate = () => {
      const updated = localStorage.getItem(avatarKey) || localStorage.getItem("mentor_user_avatar")
      setAvatarImg(updated || null)
    }
    window.addEventListener("avatarUpdated", handleAvatarUpdate)
    return () => window.removeEventListener("avatarUpdated", handleAvatarUpdate)
  }, [userId, avatarUrl])

  // Fechar menu ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Fechar menu com ESC
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsUserMenuOpen(false)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const toggleDarkMode = () => {
    const isDark = resolvedTheme === "dark"
    setTheme(isDark ? "light" : "dark")
  }

  const handleRequestEdital = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editalRequestInput.trim()) return
    toast.success("Solicitação de edital enviada com sucesso!")
    setEditalRequestInput("")
    setIsEditalModalOpen(false)
  }

  return (
     <header className="sticky top-0 z-40 flex h-14 w-full min-w-0 items-center gap-2 overflow-x-clip border-b border-border bg-background px-2 sm:px-3 md:px-6">
       {/* Esquerda: Menu Hamburger — identidade fica só no Sidebar */}
       {onOpenMenu && (
         <button
           type="button"
           onClick={onOpenMenu}
          className="h-9 w-9 shrink-0 rounded-md text-foreground hover:bg-muted transition-colors flex items-center justify-center cursor-pointer md:hidden"
           aria-label="Abrir menu de navegação"
           title="Abrir menu"
         >
           <Menu className="w-5 h-5 text-foreground" />
         </button>
       )}

       {/* Central de Estudos — prioridade máxima no mobile, flexível sem overflow */}
       <div className="flex min-w-0 flex-1 items-center justify-start md:justify-start">
         <StudyHeaderControl />
       </div>

      {/* Direita: Ações Superiores + Avatar do Usuário */}
      <div className="flex items-center gap-1 shrink-0">
        <ConnectionStatusIndicator />

        {/* Botão ? (Ajuda / Suporte) — desktop apenas, disponível no menu em mobile */}
        <button
          onClick={() => toast.info("Central de Ajuda e Suporte do NomeIA")}
          className="hidden h-9 w-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 md:flex items-center justify-center"
          title="Ajuda e suporte"
          aria-label="Ajuda e suporte"
        >
          <HelpCircle className="h-[18px] w-[18px]" />
        </button>

        {/* Botão Notificações */}
        <button
          onClick={() => toast.info("Nenhuma nova notificação no momento.")}
          className="h-9 w-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors relative shrink-0 flex items-center justify-center"
          title="Notificações"
          aria-label="Notificações"
        >
          {/* Redesign 2.0: removido o ponto de "não lido" fixo — ele aparecia
              sempre, mesmo sem nenhuma notificação (sinal falso). */}
          <Bell className="h-[18px] w-[18px]" />
        </button>

        {/* Botão de Personalização do Home — desktop apenas */}
        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent("open-dashboard-customization"))
          }}
          className="hidden h-9 w-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 md:flex items-center justify-center"
          title="Personalizar início"
          aria-label="Personalizar início"
        >
          <Settings className="h-[18px] w-[18px]" />
        </button>

        {/* Botão Modo Noturno / Tema — desktop apenas, disponível no perfil em mobile */}
        <button
          onClick={toggleDarkMode}
          className="hidden h-9 w-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 md:flex items-center justify-center"
          title="Alternar tema"
          aria-label="Alternar tema"
        >
          {mounted && resolvedTheme === "dark" ? (
            <Sun className="h-[18px] w-[18px]" />
          ) : (
            <Moon className="h-[18px] w-[18px]" />
          )}
        </button>

        {/* Dropdown Menu do Usuário */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="ml-1 h-8 w-8 rounded-full border border-border bg-muted text-muted-foreground flex items-center justify-center hover:border-foreground/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background overflow-hidden"
            title="Menu do usuário"
            aria-label="Menu do usuário"
            aria-haspopup="menu"
            aria-expanded={isUserMenuOpen}
          >
            {avatarImg ? (
              <Image
                src={avatarImg}
                alt="User"
                width={36}
                height={36}
                unoptimized
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="h-4 w-4" />
            )}
          </button>

          {isUserMenuOpen && (
            <div role="menu" className="absolute right-0 mt-2 w-60 rounded-lg border border-border bg-popover p-1 shadow-lg z-50 text-foreground">
              {/* Identificação da conta (nome + e-mail), sem saudação. */}
              <div className="px-2.5 py-2 mb-1 border-b border-border">
                <p className="text-[13px] font-medium text-foreground truncate">{userName}</p>
                {userEmail && <p className="text-xs text-muted-foreground truncate">{userEmail}</p>}
              </div>

              {/* Opção 1: Minha conta */}
              <button
                onClick={() => {
                  setIsUserMenuOpen(false)
                  setIsAccountModalOpen(true)
                }}
                role="menuitem"
                className="w-full flex items-center gap-2.5 px-2.5 py-2 text-[13px] rounded-md hover:bg-muted transition-colors text-left"
              >
                <UserCheck className="h-4 w-4 text-muted-foreground" />
                Minha conta
              </button>

              {/* Opção 2: Minha assinatura */}
              <button
                onClick={() => {
                  setIsUserMenuOpen(false)
                  router.push("/assinatura")
                }}
                role="menuitem"
                className="w-full flex items-center gap-2.5 px-2.5 py-2 text-[13px] rounded-md hover:bg-muted transition-colors text-left"
              >
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                Minha assinatura
              </button>

              {/* Opção 3: Pedir um edital */}
              <button
                onClick={() => {
                  setIsUserMenuOpen(false)
                  setIsEditalModalOpen(true)
                }}
                role="menuitem"
                className="w-full flex items-center gap-2.5 px-2.5 py-2 text-[13px] rounded-md hover:bg-muted transition-colors text-left"
              >
                <FilePlus className="h-4 w-4 text-muted-foreground" />
                Pedir um edital
              </button>

              {/* Opção 4: Editais cadastrados */}
              <button
                onClick={() => {
                  setIsUserMenuOpen(false)
                  router.push("/pedidos-editais")
                }}
                role="menuitem"
                className="w-full flex items-center gap-2.5 px-2.5 py-2 text-[13px] rounded-md hover:bg-muted transition-colors text-left"
              >
                <Library className="h-4 w-4 text-muted-foreground" />
                Editais cadastrados
              </button>

              {/* Opções mobile: Tema e Ajuda (ocultos do header em telas pequenas) */}
              <div className="border-t border-border my-1 md:hidden" />
              <button
                onClick={() => {
                  setIsUserMenuOpen(false)
                  toggleDarkMode()
                }}
                role="menuitem"
                className="md:hidden w-full flex items-center gap-2.5 px-2.5 py-2 text-[13px] rounded-md hover:bg-muted transition-colors text-left"
              >
                {mounted && resolvedTheme === "dark" ? (
                  <Sun className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Moon className="h-4 w-4 text-muted-foreground" />
                )}
                Alternar tema
              </button>
              <button
                onClick={() => {
                  setIsUserMenuOpen(false)
                  toast.info("Central de Ajuda e Suporte do NomeIA")
                }}
                role="menuitem"
                className="md:hidden w-full flex items-center gap-2.5 px-2.5 py-2 text-[13px] rounded-md hover:bg-muted transition-colors text-left"
              >
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
                Ajuda e suporte
              </button>

              <div className="border-t my-1" />

              {/* Opção 5: Sair */}
              <button
                onClick={async () => {
                  setIsUserMenuOpen(false)
                  clearUserLocalData()
                  await logoutAction()
                  window.location.replace("/login")
                }}
                role="menuitem"
                className="w-full flex items-center gap-2.5 px-2.5 py-2 text-[13px] text-destructive rounded-md hover:bg-destructive/10 transition-colors text-left cursor-pointer"
              >
                <LogOut className="h-4 w-4 text-destructive" />
                Sair
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Pedir um Edital */}
      <Dialog open={isEditalModalOpen} onOpenChange={setIsEditalModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Solicitar novo edital</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRequestEdital} className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Informe o cargo, órgão ou link do concurso desejado:
              </label>
              <Input
                placeholder="Ex: Auditor Fiscal - Receita Federal 2026"
                value={editalRequestInput}
                onChange={(e) => setEditalRequestInput(e.target.value)}
                className="text-sm"
                autoFocus
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsEditalModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm">
                Enviar pedido
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Central: Minha Conta (Configurações Completas do Perfil) */}
      <AccountSettingsModal
        open={isAccountModalOpen}
        onOpenChange={setIsAccountModalOpen}
        _userName={userName}
        userEmail={userEmail}
        userId={userId}
        logoutAction={logoutAction}
      />
    </header>
  )
}
