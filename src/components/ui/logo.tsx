import React from "react"

import Image from "next/image"
import Link from "next/link"

import { cn } from "@/lib/utils"

export type LogoVariant = "full" | "compact" | "icon" | "image"

interface LogoProps extends Omit<React.ComponentPropsWithoutRef<typeof Link>, "href"> {
  href?: string
  variant?: LogoVariant
  size?: number
  showText?: boolean
  showTagline?: boolean
  className?: string
  priority?: boolean
}

/**
 * Componente Oficial de Branding — NomeIA
 * "Sua preparação rumo à nomeação."
 */
export function Logo({
  className,
  href = "/",
  variant = "compact",
  size = 36,
  showText = true,
  showTagline = false,
  priority = false,
  ...props
}: LogoProps) {
  // Variação 1: Imagem Completa Oficial (Horizontal)
  if (variant === "image" || variant === "full") {
    return (
      <Link
        href={href}
        className={cn(
          "inline-flex items-center transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg",
          className,
        )}
        aria-label="NomeIA — Sua preparação rumo à nomeação"
        {...props}
      >
        <Image
          src="/branding/nomeia-logo.png"
          alt="NomeIA — Sua preparação rumo à nomeação"
          width={size * 3.5}
          height={size}
          className="h-auto w-auto max-h-[48px] object-contain"
          priority={priority}
        />
      </Link>
    )
  }

  // Variação 2: Somente o Símbolo / Ícone
  if (variant === "icon") {
    return (
      <Link
        href={href}
        className={cn(
          "inline-flex items-center justify-center transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl",
          className,
        )}
        aria-label="NomeIA"
        {...props}
      >
        <Image
          src="/branding/nomeia-icon.png"
          alt="NomeIA"
          width={size}
          height={size}
          className="object-contain rounded-xl shadow-xs"
          style={{ width: `${size}px`, height: `${size}px` }}
          priority={priority}
        />
      </Link>
    )
  }

  // Variação 3: Compacto (Símbolo + Tipografia Oficial NomeIA)
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2.5 transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl select-none",
        className,
      )}
      aria-label="NomeIA"
      {...props}
    >
      <div className="relative shrink-0 flex items-center justify-center">
        <Image
          src="/branding/nomeia-icon.png"
          alt="NomeIA"
          width={size}
          height={size}
          className="object-contain rounded-xl shadow-xs"
          style={{ width: `${size}px`, height: `${size}px` }}
          priority={priority}
        />
      </div>

      {showText && (
        <div className="flex flex-col min-w-0 leading-none">
          <span className="font-extrabold tracking-tight text-foreground text-lg sm:text-xl flex items-center">
            <span>Nome</span>
            <span className="bg-gradient-to-r from-[#2563EB] to-[#38BDF8] bg-clip-text text-transparent">
              IA
            </span>
          </span>
          {showTagline && (
            <span className="text-[10px] font-medium text-muted-foreground tracking-normal truncate mt-0.5">
              Sua preparação rumo à nomeação.
            </span>
          )}
        </div>
      )}
    </Link>
  )
}
