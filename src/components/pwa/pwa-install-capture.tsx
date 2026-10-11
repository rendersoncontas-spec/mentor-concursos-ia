"use client"

import { useEffect, useRef } from "react"

import { toast } from "sonner"

import { useInstallApp } from "@/lib/pwa/use-install-app"

/**
 * UX-PWA-01 — montado uma vez nos Providers (raiz do app), para que o evento
 * beforeinstallprompt seja guardado assim que o navegador o disparar, mesmo
 * antes de o menu da conta existir na tela. Não renderiza nada.
 *
 * Mostra o aviso de sucesso SOMENTE quando o navegador confirma a instalação
 * (appinstalled) — nunca por conta própria.
 */
export function PwaInstallCapture() {
  const { snapshot } = useInstallApp()
  const wasInstalled = useRef<boolean | null>(null)

  useEffect(() => {
    if (wasInstalled.current === null) {
      wasInstalled.current = snapshot.installed
      return
    }
    if (!wasInstalled.current && snapshot.installed) {
      toast.success("NomeIA instalado. O atalho fica na tela inicial do seu dispositivo.")
    }
    wasInstalled.current = snapshot.installed
  }, [snapshot.installed])

  return null
}
