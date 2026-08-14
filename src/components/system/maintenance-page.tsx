"use client"

import { useState } from "react"

import { RefreshCw, Wrench } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Logo } from "@/components/ui/logo"

export function MaintenancePage() {
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = () => {
    setIsRefreshing(true)
    setTimeout(() => {
      window.location.reload()
    }, 500)
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground animate-in fade-in duration-500">
      <header className="flex h-16 items-center px-4 md:px-6">
        <Logo href="#" />
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 space-y-8 text-center animate-in slide-in-from-bottom-8 duration-700">
        <div className="bg-primary/10 text-primary p-6 rounded-full w-24 h-24 flex items-center justify-center relative overflow-hidden group">
          <Wrench className="w-12 h-12 relative z-10 group-hover:rotate-12 transition-transform duration-300" />
        </div>

        <div className="space-y-4 max-w-md">
          <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">
            🚧 Sistema em Manutenção
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            Estamos realizando melhorias na plataforma. Em breve ela estará disponível novamente com
            novas atualizações para impulsionar seus estudos.
          </p>
        </div>

        <Button
          size="lg"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="gap-2 w-full sm:w-auto"
        >
          <RefreshCw className={`w-5 h-5 ${isRefreshing ? "animate-spin" : ""}`} />
          {isRefreshing ? "Atualizando..." : "Atualizar página"}
        </Button>
      </main>

      <footer className="py-6 flex flex-col items-center justify-center border-t text-sm text-muted-foreground">
        <p className="font-medium">Nomeia</p>
        <p>Sua preparação rumo à nomeação.</p>
      </footer>
    </div>
  )
}
