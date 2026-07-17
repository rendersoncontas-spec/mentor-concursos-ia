"use client"

import { useEffect } from "react"

import { Button } from "@/components/ui/button"

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Aqui no futuro será enviado para o Sentry/Datadog
    console.error(error)
  }, [error])

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center space-y-4">
      <h2 className="text-2xl font-bold text-destructive">Algo deu errado!</h2>
      <p className="text-muted-foreground text-sm max-w-md text-center">
        Ocorreu um erro inesperado. Nossa equipe técnica já foi notificada.
      </p>
      <Button variant="outline" onClick={() => reset()}>
        Tentar novamente
      </Button>
    </div>
  )
}
