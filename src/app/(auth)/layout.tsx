import Image from "next/image"
import Link from "next/link"

import { CheckCircle2, ShieldCheck, Sparkles, Star } from "lucide-react"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-12 bg-background font-sans">
      {/* Lado Esquerdo - Visual SaaS Pro (7 cols) */}
      <div className="hidden lg:flex lg:col-span-7 relative flex-col justify-between p-12 overflow-hidden bg-slate-950 text-white">
        {/* Background Gradients & Ambient Effects */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(37,99,235,0.35),rgba(255,255,255,0))]" />
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-blue-600/25 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-80 h-80 bg-sky-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Header Superior com Logo */}
        <div className="relative z-10 flex items-center justify-between">
          <Link
            href="/login"
            className="flex items-center gap-3 font-bold text-xl tracking-tight text-white hover:opacity-90 transition-opacity"
          >
            <Image
              src="/logo.png"
              alt="Nomeia Logo"
              width={44}
              height={44}
              className="w-11 h-11 rounded-xl object-cover shadow-md ring-2 ring-white/10"
              priority
            />
            <span className="text-white">Nomeia</span>
          </Link>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-400/20 text-blue-300 text-xs font-medium backdrop-blur-sm">
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            <span>Sua preparação rumo à nomeação.</span>
          </div>
        </div>

        {/* Conteúdo Central / Proposta de Valor */}
        <div className="relative z-10 max-w-xl space-y-8 my-auto py-12">
          <div className="space-y-4">
            <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tight text-white leading-[1.15]">
              Sua preparação rumo à{" "}
              <span className="bg-gradient-to-r from-blue-400 via-sky-300 to-blue-200 bg-clip-text text-transparent">
                nomeação
              </span>
              .
            </h1>
            <p className="text-slate-300 text-base xl:text-lg leading-relaxed">
              Gerencie seus estudos com ciclos adaptativos, revisões espaçadas automatizadas e
              editais verticalizados inteligentes.
            </p>
          </div>

          {/* Lista de Recursos Principais */}
          <div className="space-y-3 pt-2">
            {[
              "Ciclo rotativo de estudos personalizado",
              "Revisões espaçadas automáticas (Spaced Repetition)",
              "Editais verticalizados e acompanhamento por matéria",
              "Análise de desempenho e foco estratégico",
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-3 text-slate-200 text-sm xl:text-base">
                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-sky-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
                <span>{feature}</span>
              </div>
            ))}
          </div>

          {/* Depoimento / Prova Social */}
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md shadow-2xl space-y-3">
            <div className="flex items-center gap-1 text-amber-400">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-4 h-4 fill-amber-400" />
              ))}
            </div>
            <p className="text-slate-300 text-sm italic leading-relaxed">
              &quot;O Nomeia organizou minha rotina de forma cirúrgica. Consegui cobrir todo o
              edital e ser aprovado no meu concurso dos sonhos!&quot;
            </p>
            <div className="flex items-center gap-3 pt-1">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-sky-400 flex items-center justify-center text-white font-bold text-xs shadow-md">
                NM
              </div>
              <div>
                <p className="text-xs font-semibold text-white">Aluno Aprovado</p>
                <p className="text-[11px] text-slate-400">Concurso Federal • 1º Lugar</p>
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé do Lado Esquerdo */}
        <div className="relative z-10 flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/80 pt-6">
          <p>© {new Date().getFullYear()} Nomeia. Todos os direitos reservados.</p>
          <div className="flex items-center gap-2 text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Ambiente 100% Seguro</span>
          </div>
        </div>
      </div>

      {/* Lado Direito - Container de Formulários (5 cols) */}
      <div className="lg:col-span-5 flex flex-col justify-between p-6 sm:p-12 lg:p-16 min-h-screen">
        {/* Top Header Mobile */}
        <div className="flex items-center justify-between lg:hidden mb-8">
          <Link href="/login" className="flex items-center gap-3 font-bold text-lg text-foreground">
            <Image
              src="/logo.png"
              alt="Nomeia Logo"
              width={36}
              height={36}
              className="w-9 h-9 rounded-xl object-cover shadow-sm"
              priority
            />
            <span className="text-foreground">Nomeia</span>
          </Link>
        </div>

        <div className="w-full max-w-md mx-auto my-auto space-y-6">{children}</div>

        {/* Footer Mobile */}
        <div className="mt-8 text-center text-xs text-muted-foreground lg:hidden">
          © {new Date().getFullYear()} Nomeia. Todos os direitos reservados.
        </div>
      </div>
    </div>
  )
}
