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
  CircleDot,
  FileText,
  GraduationCap,
  Heart,
  History,
  LayoutDashboard,
  Library,
  ListCheck,
  Medal,
  RefreshCcw,
  ShieldCheck,
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

type NavItem = {
  href: string
  label: string
  icon: LucideIcon
}

interface AppSidebarProps {
  className?: string
  isOpen?: boolean
  onClose?: () => void
  userRole?: string
}

export function AppSidebar({ className, isOpen, onClose, userRole }: AppSidebarProps) {
  const pathname = usePathname()

  const navGroups: { label: string; items: NavItem[] }[] = [
    {
      label: "Estudos",
      items: [
        { href: "/dashboard", label: "Home", icon: LayoutDashboard },
        { href: "/disciplines", label: "Disciplinas", icon: BookOpen },
        { href: "/ciclos", label: "Ciclos", icon: CircleDot },
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
    ...(userRole === "admin" || userRole === "moderator"
      ? [
          {
            label: "Gestão",
            items: [
              {
                href: "/admin",
                label: "Administração",
                icon: ShieldCheck,
              },
            ],
          },
        ]
      : []),
    {
      label: "Outros",
      items: [{ href: "/doacao", label: "Doação", icon: Heart }],
    },
  ]
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
          "relative flex h-screen flex-col shrink-0 border-r border-border bg-[hsl(var(--sidebar-background))] transition-[width,transform] duration-200 ease-out",
          effectiveCollapsed ? "w-[var(--sidebar-width-collapsed)]" : "w-[280px] max-w-[85vw] md:w-[var(--sidebar-width)]",
          // Mobile/tablet: drawer fixo com overlay. Desktop: estático.
          "fixed inset-y-0 left-0 z-50 md:relative",
          isOpen ? "translate-x-0 shadow-xl md:shadow-none" : "-translate-x-full md:translate-x-0",
          className,
        )}
      >
        {/* Botão fechar mobile */}
        {isOpen && (
          <button
            onClick={onClose}
            className="absolute top-3.5 right-3 z-10 h-9 w-9 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors md:hidden flex items-center justify-center"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* ── Cabeçalho: Logo oficial do NomeIA como Botão de Abrir/Fechar Sidebar ── */}
        {effectiveCollapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label="Abrir menu"
                className={cn(
                  "group relative flex items-center justify-center h-14 w-full shrink-0 border-b border-border px-0 transition-colors duration-150",
                  "cursor-pointer hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                )}
              >
                <div className="flex items-center justify-center shrink-0 transition-colors duration-150">
                  <Image
                    src="/branding/nomeia-icon.png"
                    alt="NomeIA"
                    width={30}
                    height={30}
                    className="w-[30px] h-[30px] object-contain rounded-md"
                    priority
                  />
                </div>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={12}>
              Abrir menu
            </TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={isDesktop ? toggleCollapsed : onClose}
                aria-label="Fechar menu"
                className={cn(
                  "group relative flex items-center h-14 w-full shrink-0 border-b border-border px-4 gap-2.5 transition-colors duration-150 text-left",
                  "cursor-pointer hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                )}
              >
                <div className="flex items-center justify-center shrink-0 transition-colors duration-150">
                  <Image
                    src="/branding/nomeia-icon.png"
                    alt="NomeIA"
                    width={30}
                    height={30}
                    className="w-[30px] h-[30px] object-contain rounded-md"
                    priority
                  />
                </div>
                <div className="min-w-0 flex-1 leading-tight pr-6 md:pr-0">
                  <p className="text-[15px] font-semibold tracking-tight text-foreground flex items-center">
                    <span>Nome</span>
                    <span className="text-primary">
                      IA
                    </span>
                  </p>
                </div>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6} className="hidden md:block">
              Fechar menu
            </TooltipContent>
          </Tooltip>
        )}

        {/* ── Navegação agrupada ─────────────────────────────────────────── */}
        <nav
          aria-label="Menu principal"
          className="relative flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-3 space-y-4"
        >
          {navGroups.map((group, groupIndex) => (
            <div key={group.label} className="space-y-0.5">
              {effectiveCollapsed ? (
                groupIndex > 0 && (
                  <div aria-hidden className="mx-3 my-3 h-px bg-border" />
                )
              ) : (
                <p className="type-label px-2.5 pb-1">
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
                      "group relative flex items-center gap-2.5 h-10 md:h-9 rounded-md px-2.5 text-[13px] font-medium transition-colors duration-150 outline-none",
                      effectiveCollapsed ? "justify-center px-0" : "",
                      active
                        ? "bg-primary/[0.08] text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card",
                    )}
                  >
                    {/* Indicação lateral sutil do item ativo */}
                    <span
                      aria-hidden
                      className={cn(
                        "absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-primary transition-opacity duration-150",
                        active ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <Icon
                      aria-hidden
                      className={cn(
                        "shrink-0 transition-colors duration-150",
                        active
                          ? "text-primary"
                          : "text-muted-foreground/70 group-hover:text-foreground",
                      )}
                      style={{ width: 16, height: 16 }}
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
        </nav>
      </aside>
    </TooltipProvider>
  )
}
