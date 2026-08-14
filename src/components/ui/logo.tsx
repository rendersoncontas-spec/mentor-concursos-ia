import React from "react"

import Image from "next/image"
import Link from "next/link"

import { cn } from "@/lib/utils"

type LogoProps = Omit<React.ComponentPropsWithoutRef<typeof Link>, "href"> & {
  href?: string
  size?: number
  showText?: boolean
}

export function Logo({ className, href = "/", size = 32, showText = true, ...props }: LogoProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 font-display text-xl font-bold tracking-tight",
        className,
      )}
      {...props}
    >
      <div className="relative shrink-0 flex items-center justify-center">
        <Image
          src="/logo.png"
          alt="Nomeia Logo"
          width={size}
          height={size}
          className="object-contain rounded-xl"
          priority
        />
      </div>
      {showText && (
        <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Nomeia
        </span>
      )}
    </Link>
  )
}
