"use client"

import { EllipsisVertical, Share, SquarePlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useInstallApp } from "@/lib/pwa/use-install-app"

import type { InstallHelpVariant } from "./install-app-menu-item"

/**
 * UX-PWA-01 — instruções para adicionar o NomeIA à tela inicial quando o
 * navegador não oferece o prompt nativo (iPhone/iPad sempre; outros
 * navegadores quando o evento não existe). Nunca diz que a instalação aconteceu.
 * Altura limitada à tela (rolagem interna) e fechamento por botão, Esc e "Fechar".
 */
export function InstallAppDialog({
  variant,
  onClose,
  onCloseAutoFocus,
}: {
  variant: InstallHelpVariant | null
  onClose: () => void
  /** G2.20: para onde o foco volta ao fechar (o item do menu já não existe). */
  onCloseAutoFocus?: (event: Event) => void
}) {
  const { snapshot } = useInstallApp()
  const ios = variant === "ios"

  return (
    <Dialog open={variant !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-[420px]" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>Adicione o NomeIA à tela inicial</DialogTitle>
          <DialogDescription>
            Você ganha um atalho que abre o NomeIA como aplicativo. É o mesmo site, com a sua conta — não é um app da loja e
            continua precisando de internet.
          </DialogDescription>
        </DialogHeader>

        {snapshot.inAppBrowser && (
          <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-foreground">
            Você está num navegador dentro de outro aplicativo. Abra este endereço no navegador do celular
            {ios ? " (Safari)" : ""} para ver a opção de adicionar à tela inicial.
          </p>
        )}

        {ios ? (
          <ol className="space-y-3 text-sm text-foreground">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden="true">1</span>
              <span>
                Toque em <strong>Compartilhar</strong>{" "}
                <Share className="inline h-4 w-4 align-text-bottom" aria-label="ícone Compartilhar" role="img" /> na barra do navegador.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden="true">2</span>
              <span>
                Escolha <strong>Adicionar à Tela de Início</strong>{" "}
                <SquarePlus className="inline h-4 w-4 align-text-bottom" aria-label="ícone Adicionar" role="img" />. Se não aparecer, role a lista de opções.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden="true">3</span>
              <span>Confirme em <strong>Adicionar</strong>.</span>
            </li>
          </ol>
        ) : (
          <ol className="space-y-3 text-sm text-foreground">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden="true">1</span>
              <span>
                Abra o menu do navegador{" "}
                <EllipsisVertical className="inline h-4 w-4 align-text-bottom" aria-label="ícone de menu" role="img" />.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden="true">2</span>
              <span>
                Procure por <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>. O nome da opção varia
                conforme o navegador.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden="true">3</span>
              <span>Confirme. No computador, a opção também pode aparecer como um ícone de instalação na barra de endereço.</span>
            </li>
          </ol>
        )}

        {ios && snapshot.iosNonSafari && (
          <p className="text-xs text-muted-foreground">
            Se a opção não aparecer neste navegador, abra o NomeIA no <strong>Safari</strong> e repita os passos.
          </p>
        )}
        {!ios && (
          <p className="text-xs text-muted-foreground">
            Se o navegador não tiver essa opção, use um navegador atualizado, como Chrome, Edge ou Samsung Internet.
          </p>
        )}

        <DialogFooter>
          <Button type="button" size="sm" onClick={onClose} className="w-full sm:w-auto">
            Entendi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
