import Image from "next/image"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Lado Esquerdo - Decorativo */}
      <div className="hidden lg:flex flex-col justify-between bg-muted p-12 text-muted-foreground">
        <div className="flex items-center gap-3 font-bold text-2xl text-foreground">
          <Image
            src="/logo.png"
            alt="Mentor Concursos IA Logo"
            width={40}
            height={40}
            className="w-10 h-10 rounded-xl object-cover shadow-sm"
            priority
          />
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
          <div className="flex items-center justify-center gap-3 font-bold text-2xl lg:hidden mb-8">
            <Image
              src="/logo.png"
              alt="Mentor Concursos IA Logo"
              width={36}
              height={36}
              className="w-9 h-9 rounded-xl object-cover shadow-sm"
              priority
            />
            Mentor IA
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
