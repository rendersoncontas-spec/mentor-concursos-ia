import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Fase E — cabeçalho de página único do produto.
 *
 * Barra fixa no topo da área de conteúdo (logo abaixo do header global),
 * com ícone neutro, título, descrição curta e ações à direita. O conteúdo
 * interno usa `.page-container`, então o título fica alinhado com o corpo da
 * página em qualquer largura de tela. Antes, este mesmo markup estava
 * copiado em cada página, com pequenas variações de espaçamento.
 *
 * Pode ser usado em Server Components (ícone passado como componente) e em
 * Client Components (quando as ações dependem de estado da tela).
 */
export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title: React.ReactNode
  description?: React.ReactNode | undefined
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }> | undefined
  actions?: React.ReactNode | undefined
}

export function PageHeader({ title, description, icon: Icon, actions, className, ...props }: PageHeaderProps) {
  return (
    <header
      className={cn("sticky top-0 z-20 border-b border-border bg-background", className)}
      {...props}
    >
      <div className="page-container flex min-h-14 items-center justify-between gap-3 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && <Icon aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold leading-tight text-foreground">{title}</h1>
            {/* No mobile a descrição some: o cabeçalho é fixo e cada linha dele
                é espaço a menos para o conteúdo. */}
            {description && <div className="mt-0.5 hidden text-xs text-muted-foreground sm:block">{description}</div>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}
