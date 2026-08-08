import Link from "next/link"
import { ArrowRight, LayoutDashboard, LogIn } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 md:p-24 bg-gradient-to-b from-background via-background to-muted/20">
      <div className="z-10 w-full max-w-3xl items-center justify-center font-sans text-sm flex flex-col space-y-6 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold border border-primary/20">
          🚀 Plataforma SaaS de Gestão de Estudos
        </div>

        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground">
          Mentor Concursos <span className="text-primary">IA</span>
        </h1>

        <p className="text-muted-foreground text-base md:text-lg max-w-xl leading-relaxed">
          Plataforma de alta performance para gerenciamento inteligente de estudos, ciclo rotativo, revisões espaçadas e edital verticalizado.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3 pt-4">
          <Button asChild size="lg" className="gap-2 font-semibold text-sm w-full sm:w-auto">
            <Link href="/dashboard">
              <LayoutDashboard className="h-4 w-4" />
              <span>Acessar Painel / Dashboard</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>

          <Button asChild variant="outline" size="lg" className="gap-2 font-semibold text-sm w-full sm:w-auto">
            <Link href="/login">
              <LogIn className="h-4 w-4" />
              <span>Fazer Login</span>
            </Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
