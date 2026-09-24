import type { ConnectionStatus } from "./types"

/**
 * Estado global de conectividade (item 8 do pedido): ONLINE / OFFLINE /
 * SYNCING / SYNC_ERROR, consumido pelo shell do app para mostrar
 * "Sincronizado" / "Offline — alterações salvas neste dispositivo" /
 * "Sincronizando..." / "Há alterações aguardando sincronização".
 *
 * Nesta fase (infraestrutura) só ligamos a detecção básica via
 * `navigator.onLine` + eventos `online`/`offline`. Como o próprio pedido
 * lembra (item 9): `navigator.onLine` não garante que o servidor está
 * realmente acessível — ele só reflete a interface de rede do dispositivo.
 * Por isso os estados SYNCING/SYNC_ERROR não são derivados daqui: são
 * comandados explicitamente por quem de fato tenta falar com o servidor
 * (o worker de sincronização, que chega nas próximas fases) através de
 * `setSyncing()`/`setSyncError()`.
 */

type Listener = (status: ConnectionStatus) => void

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof navigator !== "undefined"
}

function computeStatusFromBrowser(): ConnectionStatus {
  if (!isBrowser()) return "ONLINE" // SSR/Node: nunca deve bloquear render por causa disto
  return navigator.onLine ? "ONLINE" : "OFFLINE"
}

let currentStatus: ConnectionStatus = computeStatusFromBrowser()
const listeners = new Set<Listener>()

function setStatus(next: ConnectionStatus): void {
  if (currentStatus === next) return
  currentStatus = next
  for (const listener of listeners) listener(currentStatus)
}

function handleBrowserOnline(): void {
  setStatus("ONLINE")
}

function handleBrowserOffline(): void {
  setStatus("OFFLINE")
}

if (isBrowser()) {
  window.addEventListener("online", handleBrowserOnline)
  window.addEventListener("offline", handleBrowserOffline)
}

export const connectionState = {
  get(): ConnectionStatus {
    return currentStatus
  },
  /** Retorna uma função de "unsubscribe". */
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  /** Chamado pelo worker de sincronização ao iniciar uma tentativa real de rede. */
  setSyncing(): void {
    setStatus("SYNCING")
  },
  /** Chamado pelo worker de sincronização quando uma tentativa falha por erro real (não só navigator.onLine). */
  setSyncError(): void {
    setStatus("SYNC_ERROR")
  },
  /** Recalcula o status a partir de navigator.onLine — usado depois que uma sincronização termina (com ou sem sucesso). */
  refreshFromBrowser(): void {
    setStatus(computeStatusFromBrowser())
  },
}
