"use client"

import { CircleCheck, Smartphone } from "lucide-react"
import { toast } from "sonner"

import { resolveInstallAction } from "@/lib/pwa/install-prompt"
import { useInstallApp } from "@/lib/pwa/use-install-app"

export type InstallHelpVariant = "ios" | "browser"

/**
 * UX-PWA-01 — item "Instalar aplicativo" do menu da conta.
 *
 * - Prompt nativo disponível (Android/desktop compatíveis): abre o prompt do
 *   navegador no toque. Cancelado → aviso discreto. Aceito → nada é afirmado
 *   até o navegador confirmar (appinstalled, ver PwaInstallCapture).
 * - iPhone/iPad: abre as instruções do "Adicionar à Tela de Início".
 * - Sem prompt (navegador sem suporte ou evento ainda não disparado): abre as
 *   instruções genéricas do menu do navegador.
 * - Já instalado (rodando como app): mostra "Aplicativo instalado", sem ação.
 *
 * As instruções são renderizadas FORA do menu (pelo cabeçalho), porque o menu
 * fecha ao tocar no item.
 */
export function InstallAppMenuItem({
  onCloseMenu,
  onShowInstructions,
}: {
  onCloseMenu: () => void
  onShowInstructions: (variant: InstallHelpVariant) => void
}) {
  const { snapshot, promptInstall } = useInstallApp()
  const action = resolveInstallAction(snapshot)

  if (action === "hidden-installed") {
    return (
      <div
        role="menuitem"
        aria-disabled="true"
        className="w-full flex items-center gap-2.5 px-2.5 py-2 text-[13px] rounded-md text-muted-foreground"
      >
        <CircleCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        Aplicativo instalado
      </div>
    )
  }

  const handleClick = async () => {
    onCloseMenu()
    if (action === "ios-instructions") return onShowInstructions("ios")
    if (action === "browser-instructions") return onShowInstructions("browser")
    const outcome = await promptInstall()
    if (outcome === "dismissed") toast.info("Instalação cancelada. Você pode instalar depois pelo menu da conta.")
    else if (outcome === "unavailable") onShowInstructions(snapshot.platform === "ios" ? "ios" : "browser")
    return undefined
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      role="menuitem"
      aria-haspopup={action === "native-prompt" ? undefined : "dialog"}
      disabled={snapshot.prompting}
      className="w-full flex items-center gap-2.5 px-2.5 py-2 text-[13px] rounded-md hover:bg-muted transition-colors text-left disabled:opacity-60"
    >
      <Smartphone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      Instalar aplicativo
    </button>
  )
}
