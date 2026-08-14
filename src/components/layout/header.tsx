"use client"

import { useEffect, useRef, useState } from "react"

import { useTheme } from "next-themes"
import Image from "next/image"
import Link from "next/link"
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
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [isEditalModalOpen, setIsEditalModalOpen] = useState(false)
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false)
  const [editalRequestInput, setEditalRequestInput] = useState("")
  // Fonte de verdade: avatar_url do banco. localStorage é apenas cache de fallback.
  const [avatarImg, setAvatarImg] = useState<string | null>(avatarUrl ?? null)

  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const avatarKey = userId ? `mentor_user_avatar_${userId}` : "mentor_user_avatar"

    // Fallback: cache local apenas quando não há foto no banco
    if (!avatarUrl) {
      const saved = localStorage.getItem(avatarKey)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setAvatarImg(saved)
    }

    // Escutar atualizações de outros componentes
    const handleAvatarUpdate = () => {
      if (avatarUrl) return
      const updated = localStorage.getItem(avatarKey)
      setAvatarImg(updated)
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
    toast.info(isDark ? "Modo claro ativado." : "Modo escuro ativado.")
  }

  const handleRequestEdital = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editalRequestInput.trim()) return
    toast.success("Solicitação de edital enviada com sucesso!")
    setEditalRequestInput("")
    setIsEditalModalOpen(false)
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/90 backdrop-blur-sm px-3 sm:px-6 w-full">
      {/* Esquerda: Menu Hamburger + Logo em Mobile */}
      <div className="flex items-center gap-2 md:hidden">
        {onOpenMenu && (
          <button
            type="button"
            onClick={onOpenMenu}
            className="p-2 -ml-1 rounded-xl text-foreground hover:bg-muted active:scale-95 transition-all flex items-center justify-center cursor-pointer"
            aria-label="Abrir menu de navegação"
            title="Abrir menu"
          >
            <Menu className="w-5 h-5 text-foreground" />
          </button>
        )}
        <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
          <Image
            src="/branding/nomeia-icon.png"
            alt="NomeIA"
            width={30}
            height={30}
            className="w-[30px] h-[30px] rounded-xl object-contain shadow-xs shrink-0"
          />
          <span className="font-extrabold text-sm text-foreground flex items-center shrink-0">
            <span>Nome</span>
            <span className="bg-gradient-to-r from-[#2563EB] to-[#38BDF8] bg-clip-text text-transparent">
              IA
            </span>
          </span>
        </Link>
      </div>

      <div className="hidden md:block" />

      {/* Direita: Ações Superiores + Avatar do Usuário */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Botão ? (Ajuda / Suporte) */}
        <button
          onClick={() => toast.info("Central de Ajuda e Suporte do NomeIA")}
          className="w-8 h-8 rounded-full bg-[#2563EB] text-white flex items-center justify-center hover:bg-[#1D4ED8] transition-colors shadow-xs shrink-0"
          title="Ajuda e Suporte"
        >
          <HelpCircle className="h-4 w-4" />
        </button>

        {/* Botão Notificações */}
        <button
          onClick={() => toast.info("Nenhuma nova notificação no momento.")}
          className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors relative shrink-0"
          title="Notificações"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#2563EB]" />
        </button>

        {/* Botão de Personalização do Home */}
        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent("open-dashboard-customization"))
          }}
          className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          title="Personalizar Home"
        >
          <Settings className="h-4 w-4" />
        </button>

        {/* Botão Modo Noturno / Tema */}
        <button
          onClick={toggleDarkMode}
          className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          title="Alternar Tema"
        >
          {resolvedTheme === "dark" ? (
            <Sun className="h-4 w-4 text-amber-400" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>

        {/* Dropdown Menu do Usuário */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="w-9 h-9 rounded-full border-2 border-[#2563EB] bg-white dark:bg-slate-900 text-[#2563EB] flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-2xs focus:outline-none overflow-hidden"
            title="Menu do Usuário"
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
              <User className="h-5 w-5 stroke-[2.2]" />
            )}
          </button>

          {isUserMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl border bg-card p-2 shadow-xl z-50 text-foreground space-y-1 animate-in fade-in zoom-in-95 duration-100">
              {/* Cumprimento: Olá, {userName}... */}
              <div className="font-bold text-xs text-muted-foreground px-3 py-2 border-b">
                Olá, <span className="text-foreground font-black">{userName}...</span>
              </div>

              {/* Opção 1: Minha conta */}
              <button
                onClick={() => {
                  setIsUserMenuOpen(false)
                  setIsAccountModalOpen(true)
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg hover:bg-muted transition-colors text-left"
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
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg hover:bg-muted transition-colors text-left"
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
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg hover:bg-muted transition-colors text-left"
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
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg hover:bg-muted transition-colors text-left"
              >
                <Library className="h-4 w-4 text-muted-foreground" />
                Editais cadastrados
              </button>

              <div className="border-t my-1" />

              {/* Opção 5: Sair */}
              <button
                onClick={async () => {
                  setIsUserMenuOpen(false)
                  clearUserLocalData()
                  await logoutAction()
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-destructive rounded-lg hover:bg-destructive/10 transition-colors text-left"
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
            <DialogTitle className="text-base font-bold">Solicitar Novo Edital</DialogTitle>
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
              <Button
                type="submit"
                size="sm"
                className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold"
              >
                Enviar Pedido
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
