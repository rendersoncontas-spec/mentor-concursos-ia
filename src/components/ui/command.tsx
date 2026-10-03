"use client"

import * as React from "react"
import { type DialogProps } from "@radix-ui/react-dialog"
import { Command as CommandPrimitive } from "cmdk"
import { Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { Dialog, DialogContent } from "@/components/ui/dialog"

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      "flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground",
      className
    )}
    {...props}
  />
))
Command.displayName = CommandPrimitive.displayName

const CommandDialog = ({ children, ...props }: DialogProps) => {
  return (
    <Dialog {...props}>
      <DialogContent className="overflow-hidden p-0">
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  )
}

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div className="flex items-center border-b px-3" data-cmdk-input-wrapper="">
    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  </div>
))

CommandInput.displayName = CommandPrimitive.Input.displayName

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => {
  const innerRef = React.useRef<HTMLDivElement>(null)
  const combinedRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      (innerRef as React.MutableRefObject<HTMLDivElement | null>).current = node
      if (typeof ref === "function") ref(node)
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
    },
    [ref],
  )

  React.useEffect(() => {
    const el = innerRef.current
    if (!el) return

    let startY = 0

    const handleTouchStart = (e: TouchEvent) => {
      startY = e.touches[0]?.clientY ?? 0
    }

    const handleTouchMove = (e: TouchEvent) => {
      const currentY = e.touches[0]?.clientY ?? 0
      const deltaY = currentY - startY
      const { scrollTop, scrollHeight, clientHeight } = el
      const isScrollable = scrollHeight > clientHeight

      if (isScrollable) {
        const atTop = scrollTop <= 0 && deltaY > 0
        const atBottom = Math.ceil(scrollTop + clientHeight) >= scrollHeight && deltaY < 0

        if (!atTop && !atBottom) {
          e.stopPropagation()
        }
      }
    }

    // Quando este Command está dentro de um Popover que, por sua vez, está
    // dentro de um Dialog (ex.: seletor de disciplina no modal de registro
    // manual de estudo), o bloqueio de scroll do corpo da página que o
    // Dialog ativa (via react-remove-scroll) intercepta o evento de "wheel"
    // antes dele chegar aqui e cancela a rolagem nativa do navegador —
    // mesmo esta lista tendo seu próprio `overflow-y-auto` com espaço pra
    // rolar. `preventDefault()` de um evento cancela a ação padrão (rolar)
    // inteira, não só para quem chamou — por isso a lista fica "travada"
    // mesmo sendo scrollável. A correção é rolar manualmente via JS
    // (`scrollTop`), que não depende da ação padrão do navegador e por isso
    // não é afetado por esse bloqueio externo.
    const handleWheel = (e: WheelEvent) => {
      const { scrollTop, scrollHeight, clientHeight } = el
      const isScrollable = scrollHeight > clientHeight
      if (!isScrollable) return

      const atTop = scrollTop <= 0 && e.deltaY < 0
      const atBottom = Math.ceil(scrollTop + clientHeight) >= scrollHeight && e.deltaY > 0
      // Já no limite: deixa o comportamento padrão seguir (ex.: rolar a
      // página por trás, se for o caso) em vez de prender o scroll aqui.
      if (atTop || atBottom) return

      e.preventDefault()
      el.scrollTop += e.deltaY
    }

    el.addEventListener("touchstart", handleTouchStart, { passive: true })
    el.addEventListener("touchmove", handleTouchMove, { capture: true, passive: true })
    el.addEventListener("wheel", handleWheel, { passive: false })
    return () => {
      el.removeEventListener("touchstart", handleTouchStart)
      el.removeEventListener("touchmove", handleTouchMove, { capture: true } as EventListenerOptions)
      el.removeEventListener("wheel", handleWheel)
    }
  }, [])

  return (
    <CommandPrimitive.List
      ref={combinedRef}
      className={cn(
        "max-h-[300px] overflow-y-auto overflow-x-hidden p-1",
        "overscroll-contain [touch-action:pan-y] [-webkit-overflow-scrolling:touch]",
        "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20",
        className,
      )}
      {...props}
    />
  )
})

CommandList.displayName = CommandPrimitive.List.displayName

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className="py-6 text-center text-sm"
    {...props}
  />
))

CommandEmpty.displayName = CommandPrimitive.Empty.displayName

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      "overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground",
      className
    )}
    {...props}
  />
))

CommandGroup.displayName = CommandPrimitive.Group.displayName

const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 h-px bg-border", className)}
    {...props}
  />
))
CommandSeparator.displayName = CommandPrimitive.Separator.displayName

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-default gap-2 select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-muted data-[selected=true]:text-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
      className
    )}
    {...props}
  />
))

CommandItem.displayName = CommandPrimitive.Item.displayName

const CommandShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}
CommandShortcut.displayName = "CommandShortcut"

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
}
