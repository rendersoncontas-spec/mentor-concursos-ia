"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import {
  User,
  HelpCircle,
  Bell,
  Moon,
  Sun,
  UserCheck,
  CreditCard,
  FilePlus,
  Library,
  LogOut,
  Settings,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { AccountSettingsModal } from "@/features/profile/components/account-settings-modal"

interface AppHeaderProps {
  userEmail?: string
  userName?: string
  logoutAction: () => Promise<void>
}

export function AppHeader({ userEmail, userName = "Renders", logoutAction }: AppHeaderProps) {
  const router = useRouter()
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [isEditalModalOpen, setIsEditalModalOpen] = useState(false)
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false)
  const [editalRequestInput, setEditalRequestInput] = useState("")
  const [avatarImg, setAvatarImg] = useState<string | null>(null)

  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Carregar foto inicial
    const saved = localStorage.getItem("mentor_user_avatar")
    if (saved) setAvatarImg(saved)

    // Escutar atualizações da foto
    const handleAvatarUpdate = () => {
      const updated = localStorage.getItem("mentor_user_avatar")
      setAvatarImg(updated)
    }
    window.addEventListener("avatarUpdated", handleAvatarUpdate)
    return () => window.removeEventListener("avatarUpdated", handleAvatarUpdate)
  }, [])

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

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode)
    document.documentElement.classList.toggle("dark")
    toast.info(!isDarkMode ? "Modo escuro ativado." : "Modo claro ativado.")
  }

  const handleRequestEdital = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editalRequestInput.trim()) return
    toast.success("Solicitação de edital enviada com sucesso!")
    setEditalRequestInput("")
    setIsEditalModalOpen(false)
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/90 backdrop-blur-sm px-6">
      {/* Esquerda: Logo / Título em Mobile */}
      <div className="flex items-center gap-2 md:hidden">
        <Image
          src="/logo.png"
          alt="Mentor IA"
          width={32}
          height={32}
          className="w-8 h-8 rounded-lg object-contain"
        />
        <span className="font-extrabold text-sm text-foreground">Mentor IA</span>
      </div>

      <div className="hidden md:block" />

      {/* Direita: Ações Superiores + Avatar do Usuário (100% Paridade Estudei) */}
      <div className="flex items-center gap-3">
        {/* Botão ? (Ajuda / Suporte) */}
        <button
          onClick={() => toast.info("Central de Ajuda e Suporte do Mentor IA")}
          className="w-8 h-8 rounded-full bg-[#2563EB] text-white flex items-center justify-center hover:bg-[#1D4ED8] transition-colors shadow-xs"
          title="Ajuda e Suporte"
        >
          <HelpCircle className="h-4 w-4" />
        </button>

        {/* Botão Notificações */}
        <button
          onClick={() => toast.info("Nenhuma nova notificação no momento.")}
          className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors relative"
          title="Notificações"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#2563EB]" />
        </button>

        {/* Botão de Personalização do Home */}
        <button
          onClick={() => {
            // Este botão deve abrir o modal de personalização.
            // Precisamos disparar um evento ou ter um método centralizado.
            window.dispatchEvent(new CustomEvent("open-dashboard-customization"))
          }}
          className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Personalizar Home"
        >
          <Settings className="h-4 w-4" />
        </button>

        {/* Botão Modo Noturno / Tema */}
        <button
          onClick={toggleDarkMode}
          className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Alternar Tema"
        >
          {isDarkMode ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* Dropdown Menu do Usuário (Avatar Clicável — 100% Paridade Estudei) */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="w-9 h-9 rounded-full border-2 border-[#2563EB] bg-white dark:bg-slate-900 text-[#2563EB] flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-2xs focus:outline-none overflow-hidden"
            title="Menu do Usuário"
          >
            {avatarImg ? (
              <img src={avatarImg} alt="User" className="w-full h-full object-cover" />
            ) : (
              <User className="h-5 w-5 stroke-[2.2]" />
            )}
          </button>

          {isUserMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl border bg-card p-2 shadow-xl z-50 text-foreground space-y-1 animate-in fade-in zoom-in-95 duration-100">
              {/* Cumprimento: Olá, Renders... */}
              <div className="font-bold text-xs text-muted-foreground px-3 py-2 border-b">
                Olá, <span className="text-foreground font-black">{userName}...</span>
              </div>

              {/* Opção 1: Minha conta */}
              <button
                onClick={() => {
                  setIsUserMenuOpen(false)
                  setIsAccountModalOpen(true)
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg hover:bg-[#2563EB]/10 hover:text-[#2563EB] transition-colors text-left"
              >
                <UserCheck className="h-4 w-4 text-[#2563EB]" />
                <span>Minha conta</span>
              </button>

              {/* Opção 2: Assinatura */}
              <button
                onClick={() => {
                  setIsUserMenuOpen(false)
                  router.push("/assinatura")
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg hover:bg-[#2563EB]/10 hover:text-[#2563EB] transition-colors text-left"
              >
                <CreditCard className="h-4 w-4 text-[#2563EB]" />
                <span>Assinatura</span>
              </button>

              {/* Opção 3: Pedidos de Editais */}
              <button
                onClick={() => {
                  setIsUserMenuOpen(false)
                  router.push("/pedidos-editais")
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg hover:bg-[#2563EB]/10 hover:text-[#2563EB] transition-colors text-left"
              >
                <FilePlus className="h-4 w-4 text-[#2563EB]" />
                <span>Pedidos de Editais</span>
              </button>

              {/* Opção 4: Biblioteca */}
              <button
                onClick={() => {
                  setIsUserMenuOpen(false)
                  router.push("/biblioteca")
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg hover:bg-[#2563EB]/10 hover:text-[#2563EB] transition-colors text-left"
              >
                <Library className="h-4 w-4 text-[#2563EB]" />
                <span>Biblioteca</span>
              </button>

              <div className="border-t my-1" />

               {/* Opção 5: Sair */}
              <button
                onClick={async () => {
                  setIsUserMenuOpen(false)
                  await logoutAction()
                  router.push("/login")
                  router.refresh()
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors text-left"
              >
                <LogOut className="h-4 w-4" />
                <span>Sair</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal Minha Conta (100% Estudei com as 6 abas) */}
      <AccountSettingsModal
        open={isAccountModalOpen}
        onOpenChange={setIsAccountModalOpen}
        userName={userName}
        userEmail={userEmail}
        logoutAction={logoutAction}
      />

      {/* Modal Pedidos de Editais */}
      <Dialog open={isEditalModalOpen} onOpenChange={setIsEditalModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[#2563EB] flex items-center gap-2">
              <FilePlus className="h-5 w-5" />
              Solicitar Edital Verticalizado
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleRequestEdital} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                Nome do Concurso / Órgão Alvo *
              </label>
              <Input
                placeholder="Ex: Auditor Fiscal - Receita Federal 2026..."
                value={editalRequestInput}
                onChange={(e) => setEditalRequestInput(e.target.value)}
                required
                autoFocus
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsEditalModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold">
                Enviar Solicitação
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </header>
  )
}

