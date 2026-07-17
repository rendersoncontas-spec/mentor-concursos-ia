export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm flex flex-col space-y-4">
        <h1 className="text-4xl font-bold gradient-text-brand">Mentor Concursos IA</h1>
        <p className="text-muted-foreground text-lg text-center max-w-2xl">
          Fundação da aplicação inicializada com sucesso. Next.js 15, Tailwind, shadcn/ui e Clean
          Architecture configurados.
        </p>
      </div>
    </main>
  )
}
