import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
      <h2 className="text-4xl font-bold">404</h2>
      <p className="text-muted-foreground text-lg">Página não encontrada</p>
      <Button asChild>
        <Link href="/">Voltar para o início</Link>
      </Button>
    </div>
  )
}
