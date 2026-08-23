import * as React from "react"

import { cn } from "@/lib/utils"

export interface InputProps extends React.ComponentProps<"input"> {
  autoSelectOnFocus?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, autoSelectOnFocus, onFocus, onBlur, onMouseUp, ...props }, ref) => {
    const isNumeric = type === "number" || props.inputMode === "numeric" || autoSelectOnFocus

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      if (isNumeric) {
        const target = e.currentTarget
        // Seleciona todo o conteúdo do input para digitação e substituição imediata
        target.select()
        // Suporte a navegadores mobile (iOS Safari / Android Chrome)
        requestAnimationFrame(() => {
          if (document.activeElement === target) {
            target.select()
          }
        })
      }
      onFocus?.(e)
    }

    const handleMouseUp = (e: React.MouseEvent<HTMLInputElement>) => {
      if (isNumeric && (e.currentTarget.value === "0" || e.currentTarget.value === "")) {
        // Evita que o evento de mouseup no clique inicial desfaça a seleção do valor 0
        e.currentTarget.select()
      }
      onMouseUp?.(e)
    }

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      if (type === "number" || props.inputMode === "numeric") {
        const rawVal = e.target.value
        if (rawVal === "" || rawVal === undefined || isNaN(Number(rawVal))) {
          const fallback = props.min !== undefined && Number(props.min) > 0 ? String(props.min) : "0"
          e.target.value = fallback
          if (props.onChange) {
            const synthEvent = {
              ...e,
              target: e.target,
              currentTarget: e.currentTarget,
              type: "change",
            } as unknown as React.ChangeEvent<HTMLInputElement>
            props.onChange(synthEvent)
          }
        }
      }
      onBlur?.(e)
    }

    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        onFocus={handleFocus}
        onMouseUp={handleMouseUp}
        onBlur={handleBlur}
        {...props}
      />
    )
  },
)
Input.displayName = "Input"

export { Input }
