"use client"

import { useCallback, useEffect, useSyncExternalStore } from "react"

import {
  getBrowserInstallController,
  serverInstallSnapshot,
  type InstallOutcome,
  type InstallSnapshot,
} from "./install-prompt"

const noopSubscribe = () => () => undefined

/**
 * UX-PWA-01 — estado de instalação para componentes React. Usa o controle
 * único da página (os ouvintes são registrados uma vez e liberados quando o
 * último componente desmonta).
 */
export function useInstallApp(): { snapshot: InstallSnapshot; promptInstall: () => Promise<InstallOutcome> } {
  const controller = getBrowserInstallController()
  useEffect(() => {
    if (!controller) return undefined
    controller.acquire()
    return () => controller.release()
  }, [controller])
  const snapshot = useSyncExternalStore(
    controller ? controller.subscribe : noopSubscribe,
    controller ? controller.getSnapshot : serverInstallSnapshot,
    serverInstallSnapshot,
  )
  const promptInstall = useCallback(
    () => (controller ? controller.promptInstall() : Promise.resolve<InstallOutcome>("unavailable")),
    [controller],
  )
  return { snapshot, promptInstall }
}
