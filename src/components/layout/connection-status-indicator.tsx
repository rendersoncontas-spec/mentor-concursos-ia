"use client"

import { useEffect, useState } from "react"

import { AlertCircle, RefreshCw, Wifi, WifiOff } from "lucide-react"

import { connectionState, type ConnectionStatus } from "@/infrastructure/offline"

/**
 * Fase C (offline-first), item 14 — estado visual global discreto, ligado
 * diretamente ao `connectionState` (Fase B) e ao worker de sincronização
 * (Fase C): nenhum dado próprio, só reflete o que o resto da camada offline
 * já sabe. Ícone + texto curto, sem cor de alarme fora de SYNC_ERROR.
 */
const STATUS_CONFIG: Record<
  ConnectionStatus,
  { label: string; Icon: typeof Wifi; className: string; spin?: boolean }
> = {
  ONLINE: { label: "Sincronizado", Icon: Wifi, className: "text-muted-foreground" },
  OFFLINE: {
    label: "Offline — alterações serão sincronizadas",
    Icon: WifiOff,
    className: "text-muted-foreground",
  },
  SYNCING: { label: "Sincronizando...", Icon: RefreshCw, className: "text-primary", spin: true },
  SYNC_ERROR: {
    label: "Há alterações aguardando sincronização",
    Icon: AlertCircle,
    className: "text-amber-600 dark:text-amber-400",
  },
}

export function ConnectionStatusIndicator() {
  const [status, setStatus] = useState<ConnectionStatus>(() => connectionState.get())

  useEffect(() => {
    setStatus(connectionState.get())
    return connectionState.subscribe(setStatus)
  }, [])

  const { label, Icon, className, spin } = STATUS_CONFIG[status]

  return (
    <div
      role="status"
      aria-live="polite"
      className={`hidden shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium sm:flex ${className}`}
      title={label}
    >
      <Icon className={`h-3.5 w-3.5 ${spin ? "animate-spin" : ""}`} />
      <span className="hidden md:inline">{label}</span>
    </div>
  )
}
