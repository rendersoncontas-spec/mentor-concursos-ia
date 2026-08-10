"use client"

import { useState, useRef, useEffect, useTransition, useCallback } from "react"
import { useRouter } from "next/navigation"
import { GraduationCap, ChevronDown, Check, Plus, Calendar, BookOpen, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getUserTargetsAction, switchActiveTargetAction, type UserTargetSummary } from "@/application/dashboard/target.action"
import { RenderConcursoIcon } from "@/features/concursos/components/concursos-manager-view"

export interface TargetSelectorDropdownProps {
  initialActiveTargetName?: string | null
  className?: string
}

export function TargetSelectorDropdown({ initialActiveTargetName, className }: TargetSelectorDropdownProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [targets, setTargets] = useState<UserTargetSummary[]>([])
  const [loadingTargets, setLoadingTargets] = useState(false)
  const [isPending, startTransition] = useTransition()
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})

  // Calcular posicionamento responsivo do dropdown
  const updateDropdownPosition = useCallback(() => {
    if (!dropdownRef.current || !buttonRef.current) return

    const buttonRect = buttonRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    // Largura responsiva: full width no mobile, fixa no desktop
    const isMobile = viewportWidth < 640 // sm breakpoint
    const dropdownWidth = isMobile ? Math.min(viewportWidth - 32, 320) : 384 // w-96 = 384px

    // Posicionamento horizontal: right-aligned mas não transborda
    let left = buttonRect.right - dropdownWidth
    if (left < 16) left = 16 // margem esquerda mínima
    if (left + dropdownWidth > viewportWidth - 16) {
      left = viewportWidth - dropdownWidth - 16
    }

    // Posicionamento vertical: abre para cima se não houver espaço embaixo
    const spaceBelow = viewportHeight - buttonRect.bottom
    const spaceAbove = buttonRect.top
    const estimatedHeight = Math.min(400, spaceBelow - 16) // max-h-72 + padding
    const openUpward = spaceBelow < estimatedHeight && spaceAbove > spaceBelow

    setDropdownStyle({
      position: "fixed",
      left: `${left}px`,
      top: openUpward ? `${buttonRect.top - estimatedHeight - 8}px` : `${buttonRect.bottom + 8}px`,
      width: `${dropdownWidth}px`,
      maxHeight: `${estimatedHeight}px`,
      zIndex: 50,
    })
  }, [])

  // Atualizar posição ao abrir/redimensionar
  useEffect(() => {
    if (isOpen) {
      updateDropdownPosition()
      window.addEventListener("resize", updateDropdownPosition)
      window.addEventListener("scroll", updateDropdownPosition, true)
    }
    return () => {
      window.removeEventListener("resize", updateDropdownPosition)
      window.removeEventListener("scroll", updateDropdownPosition, true)
    }
  }, [isOpen, updateDropdownPosition])

  // Nome do concurso ativo exibido no botão
  const activeTarget = targets.find((t) => t.is_active)
  const buttonLabel = activeTarget
    ? `${activeTarget.exam_name || activeTarget.target_exam}${activeTarget.target_role ? ` - ${activeTarget.target_role}` : ""}`
    : initialActiveTargetName || "Selecionar Concurso"

  // Buscar lista de concursos ao abrir
  const loadTargets = async () => {
    setLoadingTargets(true)
    try {
      const res = await getUserTargetsAction()
      if (res.success && res.targets) {
        setTargets(res.targets)
      }
    } catch {
      // Ignorar falha de busca em background
    } finally {
      setLoadingTargets(false)
    }
  }

  const toggleDropdown = () => {
    if (!isOpen) {
      loadTargets()
    }
    setIsOpen((prev) => !prev)
  }

  // Fechar ao clicar fora ou pressionar ESC
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      document.addEventListener("keydown", handleKeyDown)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen])

  // Trocar de concurso ativo
  const handleSelectTarget = (targetId: string, targetName: string) => {
    startTransition(async () => {
      try {
        const res = await switchActiveTargetAction(targetId)
        if (res.success) {
          toast.success(`Concurso ativo alterado para ${targetName}!`)
          setIsOpen(false)
          setTargets(prev => prev.map(t => ({
            ...t,
            is_active: t.id === targetId
          })))
          router.refresh()
        } else {
          toast.error(res.error || "Erro ao trocar de concurso.")
        }
      } catch {
        toast.error("Erro inesperado ao alterar o concurso ativo.")
      }
    })
  }

  // Navegar para gerenciador de concursos
  const handleAddNewExam = () => {
    setIsOpen(false)
    router.push("/concursos")
  }

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Botão Trigger Principal */}
      <Button
        ref={buttonRef}
        variant="outline"
        onClick={toggleDropdown}
        disabled={isPending}
        className={cn(
          "border-[#2563EB] text-[#2563EB] hover:bg-[#2563EB]/10 font-bold text-xs gap-2 cursor-pointer transition-all shadow-2xs",
          isOpen && "bg-[#2563EB]/15 ring-2 ring-[#2563EB]/30",
          className
        )}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin text-[#2563EB]" />
        ) : (
          <GraduationCap className="h-4 w-4 shrink-0" />
        )}
        <span className="truncate max-w-[200px] sm:max-w-[260px]">{buttonLabel}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", isOpen && "rotate-180")}
        />
      </Button>

      {/* Menu Dropdown Inteligente */}
      {isOpen && (
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200"
        >
          {/* Cabeçalho do Dropdown */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-border px-1">
            <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider">
              MEUS CONCURSOS
            </span>
            <span className="text-[10px] font-mono font-bold bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
              {targets.length} {targets.length === 1 ? "cadastrado" : "cadastrados"}
            </span>
          </div>

          {/* Estado de Carregando */}
          {loadingTargets && targets.length === 0 && (
            <div className="flex items-center justify-center py-6 text-muted-foreground gap-2 text-xs font-semibold">
              <Loader2 className="h-4 w-4 animate-spin text-[#2563EB]" />
              Carregando seus concursos...
            </div>
          )}

          {/* Lista de Concursos Cadastrados */}
          {!loadingTargets && targets.length > 0 && (
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {targets.map((target) => {
                const isActive = target.is_active
                const displayName = target.exam_name || target.target_exam

                let countdownStr = "Data não definida"
                if (target.daysRemaining !== null && target.daysRemaining !== undefined) {
                  if (target.daysRemaining > 0) {
                    countdownStr = `Prova em ${target.daysRemaining} ${target.daysRemaining === 1 ? "dia" : "dias"}`
                  } else if (target.daysRemaining === 0) {
                    countdownStr = "Hoje é o dia da prova!"
                  } else {
                    countdownStr = `Prova há ${Math.abs(target.daysRemaining)} dias`
                  }
                }

                return (
                  <div
                    key={target.id}
                    onClick={() => !isActive && handleSelectTarget(target.id, displayName)}
                    className={cn(
                      "group flex items-start gap-3 p-2.5 rounded-lg transition-all cursor-pointer border text-left",
                      isActive
                        ? "border-[#2563EB]/40 bg-[#2563EB]/10 shadow-2xs"
                        : "border-transparent hover:bg-muted/80 hover:border-border"
                    )}
                  >
                    {/* Ícone de Selecionado e Logo do Concurso */}
                    <div className="mt-0.5 shrink-0 flex items-center gap-2">
                      <div className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center overflow-hidden border shadow-2xs",
                        isActive ? "bg-[#2563EB]/20 border-[#2563EB]/40 text-[#2563EB]" : "bg-muted border-border text-muted-foreground"
                      )}>
                        <RenderConcursoIcon iconKey={target.icon} className="h-4 w-4" />
                      </div>
                      {isActive ? (
                        <div className="w-4 h-4 rounded-full bg-[#2563EB] text-white flex items-center justify-center shadow-xs">
                          <Check className="h-3 w-3 stroke-[3]" />
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-muted-foreground/30 group-hover:border-foreground transition-colors" />
                      )}
                    </div>

                    {/* Informações Rápidas do Concurso */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn("font-bold text-xs truncate", isActive ? "text-foreground font-black" : "text-foreground/90")}>
                          {displayName}
                          {target.target_role ? ` - ${target.target_role}` : ""}
                        </p>

                        <span
                          className={cn(
                            "px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider shrink-0",
                            isActive
                              ? "bg-[#2563EB] text-white shadow-2xs"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {isActive ? "Ativo" : "Inativo"}
                        </span>
                      </div>

                      {/* Metadados: Data da prova + Progresso do Edital */}
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-medium flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-[#2563EB]" />
                          {countdownStr}
                        </span>
                        <span className="flex items-center gap-1">
                          <BookOpen className="h-3 w-3 text-blue-500" />
                          {target.editalProgress ?? 0}% do edital
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Empty State se o Usuário não tiver Concursos */}
          {!loadingTargets && targets.length === 0 && (
            <div className="py-6 text-center space-y-3 px-2">
              <p className="text-xs font-semibold text-muted-foreground">
                Você ainda não possui nenhum concurso cadastrado.
              </p>
              <Button
                onClick={handleAddNewExam}
                size="sm"
                className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs gap-1.5 w-full cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                Adicionar Concurso
              </Button>
            </div>
          )}

          {/* Rodapé do Dropdown: Adicionar Novo Concurso */}
          {targets.length > 0 && (
            <>
              <div className="border-t border-border my-2" />
              <button
                type="button"
                onClick={handleAddNewExam}
                className="w-full flex items-center justify-center gap-2 p-2 rounded-lg text-xs font-bold text-[#2563EB] hover:bg-[#2563EB]/10 transition-colors cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                Adicionar Novo Concurso
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

