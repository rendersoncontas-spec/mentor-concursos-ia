"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import type { MouseEventHandler } from "react"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  BarChart3,
  BookOpen,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  FileText,
  GraduationCap,
  Heart,
  History,
  LayoutDashboard,
  Library,
  ListCheck,
  Medal,
  RefreshCcw,
  Trophy,
  X,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const COLLAPSE_KEY = "mentor-sidebar-collapsed"

// Detecta telas ≥768px (onde a sidebar é estática). Seguro para SSR.
function subscribeMediaQuery(callback: () => void) {
  const mq = window.matchMedia("(min-width: 768px)")
  mq.addEventListener("change", callback)
  return () => mq.removeEventListener("change", callback)
}

function useIsDesktop() {
  return useSyncExternalStore(
    subscribeMediaQuery,
    () => window.matchMedia("(min-width: 768px)").matches,
    () => false,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MENU — agrupado por contexto. Rotas e ordem de exibição.
// Badges inteligentes só devem ser adicionados com dados reais (nada fictício).
// ─────────────────────────────────────────────────────────────────────────────
type NavItem = {
  href: string
  label: string
  icon: LucideIcon
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Estudos",
    items: [
      { href: "/dashboard", label: "Home", icon: LayoutDashboard },
      { href: "/disciplines", label: "Disciplinas", icon: BookOpen },
      { href: "/planejamento", label: "Planejamento", icon: CalendarDays },
      { href: "/dashboard/reviews", label: "Revisões", icon: RefreshCcw },
      { href: "/dashboard/history", label: "Histórico", icon: History },
      { href: "/estatisticas", label: "Estatísticas", icon: BarChart3 },
    ],
  },
  {
    label: "Preparação",
    items: [
      { href: "/concursos", label: "Concursos", icon: GraduationCap },
      { href: "/edital", label: "Edital", icon: FileText },
      { href: "/planos", label: "Planos", icon: CalendarRange },
      { href: "/simulados", label: "Simulados", icon: ListCheck },
      { href: "/biblioteca", label: "Biblioteca", icon: Library },
    ],
  },
  {
    label: "Comunidade",
    items: [
      { href: "/ranking", label: "Ranking", icon: Trophy },
      { href: "/conquistas", label: "Conquistas", icon: Medal },
    ],
  },
  {
    label: "Outros",
    items: [{ href: "/doacao", label: "Doação", icon: Heart }],
  },
]

interface AppSidebarProps {
  className?: string
  isOpen?: boolean
  onClose?: () => void
}

export function AppSidebar({ className, isOpen, onClose }: AppSidebarProps) {
  const pathname = usePathname()
  // Estado inicial fixo para evitar mismatch de hydration (não ler window/localStorage aqui).
  // A preferência salva ou o auto-colapso em telas médias é aplicado no efeito abaixo.
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    // Aplica a preferência salva ou o auto-colapso em telas médias (768–1279px)
    // após a montagem no cliente — nunca durante a renderização/hydration.
    const timer = setTimeout(() => {
      try {
        const saved = localStorage.getItem(COLLAPSE_KEY)
        if (saved !== null) {
          setCollapsed(saved === "1")
        } else if (window.innerWidth >= 768 && window.innerWidth < 1280) {
          setCollapsed(true)
        }
      } catch {
        // localStorage indisponível
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [])
  const isDesktop = useIsDesktop()

  // Estado recolhido persistente
  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0")
      } catch {
        // localStorage indisponível: segue apenas em memória
      }
      return next
    })
  }

  // No drawer mobile a sidebar sempre abre completa
  const effectiveCollapsed = isDesktop ? collapsed : false

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard"
    return pathname.startsWith(href)
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "relative flex h-screen flex-col shrink-0 border-r border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-background))] transition-[width,transform] duration-300 ease-in-out",
          effectiveCollapsed ? "w-[var(--sidebar-width-collapsed)]" : "w-[var(--sidebar-width)]",
          // Mobile/tablet: drawer fixo com overlay. Desktop: estático.
          "fixed inset-y-0 left-0 z-50 md:relative",
          isOpen ? "translate-x-0 shadow-2xl md:shadow-none" : "-translate-x-full md:translate-x-0",
          className,
        )}
      >
        {/* Brilho/gradiente sutil de identidade azul */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#2563EB]/[0.07] via-transparent to-transparent dark:from-[#2563EB]/[0.09]"
        />

        {/* Botão fechar mobile */}
        {isOpen && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 rounded-lg p-1.5 text-[hsl(var(--sidebar-foreground))/0.6] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-foreground))] transition-colors md:hidden"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* ── Cabeçalho: Logo (atalho para a Home /dashboard) ────────────── */}
        <Link
          href="/dashboard"
          onClick={(event) => {
            // Já estando na Home, apenas fecha o menu mobile sem re-navegar
            if (pathname === "/dashboard") event.preventDefault()
            onClose?.()
          }}
          aria-label="Ir para a página inicial"
          title="Ir para a página inicial"
          className={cn(
            "group relative flex items-center h-[72px] shrink-0 border-b border-[hsl(var(--sidebar-border))/70] px-4 transition-colors duration-150",
            effectiveCollapsed ? "justify-center px-0" : "gap-3",
            "cursor-pointer hover:bg-[hsl(var(--sidebar-accent))/60] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          )}
        >
          <div className="flex items-center justify-center shrink-0">
            <Image
              src="/branding/nomeia-icon.png"
              alt="NomeIA"
              width={38}
              height={38}
              className="w-[38px] h-[38px] object-contain rounded-xl shadow-xs"
              priority
            />
          </div>
          {!effectiveCollapsed && (
            <div className="min-w-0 leading-tight">
              <p className="text-[16px] font-extrabold tracking-tight text-[hsl(var(--sidebar-foreground))] truncate flex items-center">
                <span>Nome</span>
                <span className="bg-gradient-to-r from-[#2563EB] to-[#38BDF8] bg-clip-text text-transparent">
                  IA
                </span>
              </p>
              <p className="text-[10px] font-medium text-[hsl(var(--sidebar-foreground))/0.6] truncate">
                Sua preparação rumo à nomeação.
              </p>
            </div>
          )}
        </Link>

        {/* ── Navegação agrupada ─────────────────────────────────────────── */}
        <nav
          aria-label="Menu principal"
          className="relative flex-1 overflow-y-auto overflow-x-hidden px-3 py-5 space-y-5"
        >
          {NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.label} className="space-y-1">
              {effectiveCollapsed ? (
                groupIndex > 0 && (
                  <div aria-hidden className="mx-3 my-2 h-px bg-[hsl(var(--sidebar-border))/70]" />
                )
              ) : (
                <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--sidebar-foreground))/0.4]">
                  {group.label}
                </p>
              )}

              {group.items.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)

                const linkContent = (
                  <Link
                    href={item.href}
                    onClick={onClose as MouseEventHandler<HTMLAnchorElement>}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 h-11 rounded-lg px-3 text-[13px] font-medium transition-colors duration-150 outline-none",
                      effectiveCollapsed ? "justify-center px-0" : "",
                      active
                        ? "bg-[hsl(var(--sidebar-primary))] text-white font-semibold shadow-sm"
                        : "text-[hsl(var(--sidebar-foreground))/0.75] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-foreground))]",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-[hsl(var(--sidebar-background))]",
                    )}
                  >
                    {/* Indicação lateral sutil do item ativo */}
                    <span
                      aria-hidden
                      className={cn(
                        "absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-white/90 transition-opacity duration-150",
                        active ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <Icon
                      aria-hidden
                      className={cn(
                        "shrink-0 transition-colors duration-150",
                        active
                          ? "text-white"
                          : "text-[hsl(var(--sidebar-foreground))/0.55] group-hover:text-[hsl(var(--sidebar-foreground))]",
                      )}
                      style={{ width: 18, height: 18 }}
                    />
                    {!effectiveCollapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                )

                if (effectiveCollapsed) {
                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                      <TooltipContent side="right" sideOffset={12}>
                        {item.label}
                      </TooltipContent>
                    </Tooltip>
                  )
                }

                return <div key={item.href}>{linkContent}</div>
              })}
            </div>
          ))}

          {/* ── Seção: Acesso Rápido (em Drawer Mobile ou Sidebar Expandida) ── */}
          {!effectiveCollapsed && (
            <div className="pt-4 border-t border-[hsl(var(--sidebar-border))/60] space-y-1.5 pb-6">
              <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--sidebar-foreground))/0.4]">
                Acesso Rápido
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose?.()
                  window.dispatchEvent(new CustomEvent("open-study-session-modal"))
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-[#2563EB] hover:bg-[#2563EB]/10 rounded-lg transition-colors text-left cursor-pointer"
              >
                <span className="w-5 h-5 rounded-md bg-[#2563EB]/15 flex items-center justify-center text-[#2563EB] font-bold text-xs">
                  +
                </span>
                <span>Adicionar Estudo</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose?.()
                  window.dispatchEvent(new CustomEvent("study-center-opened"))
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors text-left cursor-pointer"
              >
                <span className="w-5 h-5 rounded-md bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                  ▶
                </span>
                <span>Iniciar Cronômetro</span>
              </button>
              <Link
                href="/dashboard/history"
                onClick={onClose as MouseEventHandler<HTMLAnchorElement>}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--sidebar-accent))] rounded-lg transition-colors text-left cursor-pointer"
              >
                <span className="w-5 h-5 rounded-md bg-muted flex items-center justify-center text-muted-foreground font-bold text-xs">
                  ↑
                </span>
                <span>Importar Histórico</span>
              </Link>
            </div>
          )}
        </nav>

        {/* ── Botão recolher/expandir ────────────────────────────────────── */}
        <button
          onClick={toggleCollapsed}
          className="absolute -right-3 top-[5.25rem] z-10 hidden md:flex h-6 w-6 items-center justify-center rounded-full border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-background))] text-[hsl(var(--sidebar-foreground))/0.6] shadow-sm hover:text-[hsl(var(--sidebar-foreground))] transition-all duration-150 hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={collapsed ? "Expandir menu" : "Colapsar menu"}
          title={collapsed ? "Expandir menu" : "Colapsar menu"}
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>
      </aside>
    </TooltipProvider>
  )
}
