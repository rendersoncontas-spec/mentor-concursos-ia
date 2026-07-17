export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Lado Esquerdo - Decorativo */}
      <div className="hidden lg:flex flex-col justify-between bg-muted p-12 text-muted-foreground">
        <div className="flex items-center gap-2 font-bold text-2xl text-foreground">
          <div className="size-8 rounded-lg bg-primary" />
          Mentor Concursos IA
        </div>
        <div className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            A plataforma definitiva para sua aprovação.
          </h1>
          <p className="text-lg">
            Inteligência artificial, cronogramas dinâmicos e banco de questões em um só lugar.
          </p>
        </div>
        <div className="text-sm">© {new Date().getFullYear()} Mentor Concursos IA.</div>
      </div>

      {/* Lado Direito - Formulários */}
      <div className="flex flex-col items-center justify-center p-8 sm:p-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex items-center justify-center gap-2 font-bold text-2xl lg:hidden mb-8">
            <div className="size-8 rounded-lg bg-primary" />
            Mentor
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
