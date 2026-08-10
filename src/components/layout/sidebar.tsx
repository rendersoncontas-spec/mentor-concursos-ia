"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import {
  LayoutDashboard,
  Folder,
  BookOpen,
  FileText,
  CalendarDays,
  RefreshCcw,
  History,
  BarChart3,
  ListCheck,
  Library,
  Trophy,
  Heart,
  ChevronLeft,
  ChevronRight,
  LogOut,
  GraduationCap,
  Menu,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

const navItems = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },

  { href: "/disciplines", label: "Disciplinas", icon: BookOpen },
  { href: "/concursos", label: "Concursos", icon: GraduationCap },
  { href: "/edital", label: "Edital", icon: FileText },
  { href: "/planejamento", label: "Planejamento", icon: CalendarDays },
  { href: "/dashboard/reviews", label: "Revisões", icon: RefreshCcw },
  { href: "/dashboard/history", label: "Histórico", icon: History },
  { href: "/estatisticas", label: "Estatísticas", icon: BarChart3 },
  { href: "/simulados", label: "Simulados", icon: ListCheck },
  { href: "/biblioteca", label: "Biblioteca", icon: Library },
  { href: "/ranking", label: "Ranking", icon: Trophy, isNew: true },
  { href: "/conquistas", label: "Conquistas", icon: Trophy, isNew: true },
  { href: "/doacao", label: "Doação", icon: Heart },
]

interface AppSidebarProps {
  logoutAction: () => Promise<void>
  className?: string
  isOpen?: boolean
  onClose?: () => void
}

export function AppSidebar({ logoutAction, className, isOpen, onClose }: AppSidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard"
    return pathname.startsWith(href)
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex flex-col h-screen bg-[hsl(var(--sidebar-background))] border-r border-[hsl(var(--sidebar-border))] transition-all duration-300 ease-in-out shrink-0",
          collapsed ? "w-[72px]" : "w-[260px]",
          className,
          // Responsivo mobile/tablet: fixed overlay
          "fixed inset-y-0 left-0 z-50 md:relative",
          isOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full md:translate-x-0",
        )}
      >
        {/* Botão fechar mobile */}
        {isOpen && (
          <button
            onClick={onClose}
            className="md:hidden absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        {/* Logo */}
        <div
          className={cn(
            "flex items-center h-16 border-b border-[hsl(var(--sidebar-border))] px-4 shrink-0",
            collapsed ? "justify-center" : "gap-3",
          )}
        >
          <div className="flex items-center justify-center shrink-0">
            <Image
              src="/logo.png"
              alt="Mentor IA Logo"
              width={36}
              height={36}
              className="w-9 h-9 object-contain rounded-xl"
              priority
            />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-bold text-[hsl(var(--sidebar-foreground))] leading-none truncate">
                Mentor IA
              </p>
              <p className="text-xs text-[hsl(var(--sidebar-foreground))/0.5] mt-0.5 truncate">
                Concursos
              </p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          {!collapsed && (
            <p className="text-[10px] uppercase tracking-widest text-[hsl(var(--sidebar-foreground))/0.4] font-semibold px-3 pb-2">
              Menu
            </p>
          )}
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)

            const linkContent = (
              <Link
                href={item.href}
                onClick={onClose as React.MouseEventHandler<HTMLAnchorElement>}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 group",
                  collapsed ? "justify-center" : "",
                  active
                    ? "bg-primary text-white shadow-sm font-bold"
                    : "text-slate-300 hover:bg-slate-800/60 hover:text-white font-medium",
                )}
              >
                <Icon
                  className={cn(
                    "shrink-0",
                    active
                      ? "text-white"
                      : "text-slate-400 group-hover:text-white",
                  )}
                  style={{ width: "18px", height: "18px" }}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            )

            if (collapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                  <TooltipContent side="right" className="ml-2">
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              )
            }

            return <div key={item.href}>{linkContent}</div>
          })}
        </nav>

        {/* Footer: Logout */}
        <div className="border-t border-[hsl(var(--sidebar-border))] p-2 shrink-0">
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="flex w-full items-center justify-center rounded-lg px-3 py-2.5 text-sm font-medium text-[hsl(var(--sidebar-foreground))/0.5] hover:bg-[hsl(var(--sidebar-accent))] hover:text-red-400 transition-colors"
                  >
                    <LogOut style={{ width: "18px", height: "18px" }} />
                  </button>
                </form>
              </TooltipTrigger>
              <TooltipContent side="right">Sair</TooltipContent>
            </Tooltip>
          ) : (
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[hsl(var(--sidebar-foreground))/0.5] hover:bg-[hsl(var(--sidebar-accent))] hover:text-red-400 transition-colors"
              >
                <LogOut style={{ width: "18px", height: "18px" }} />
                <span>Sair</span>
              </button>
            </form>
          )}
        </div>

        {/* Collapse Toggle */}
        <button
          onClick={() => setCollapsed((prev) => !prev)}
          className="absolute -right-3 top-[4.5rem] z-10 flex h-6 w-6 items-center justify-center rounded-full border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-background))] text-[hsl(var(--sidebar-foreground))/0.5] hover:text-[hsl(var(--sidebar-foreground))] shadow-sm transition-colors"
          aria-label={collapsed ? "Expandir menu" : "Colapsar menu"}
        >
          {collapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronLeft className="h-3 w-3" />
          )}
        </button>
      </aside>
    </TooltipProvider>
  )
}
