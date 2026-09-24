import Image from "next/image"
import Link from "next/link"

import { Check } from "lucide-react"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-12 bg-background font-sans">
      {/* Lado esquerdo — apresentação sóbria do produto (Redesign 2.0).
          Removidos: gradiente radial, manchas desfocadas, selo com ícone de
          "brilho", depoimento sem fonte verificável ("Aluno Aprovado · 1º
          Lugar", 5 estrelas) e o selo "Ambiente 100% Seguro". */}
      <div className="hidden lg:flex lg:col-span-6 xl:col-span-7 relative flex-col justify-between p-12 bg-[hsl(220_20%_12%)] text-white">
        <div className="flex items-center justify-between">
          <Link
            href="/login"
            className="flex items-center gap-2.5 font-semibold text-lg tracking-tight text-white hover:opacity-90 transition-opacity"
          >
            <Image
              src="/branding/nomeia-icon.png"
              alt="NomeIA"
              width={32}
              height={32}
              className="w-8 h-8 rounded-md object-contain"
              priority
            />
            <span className="text-white flex items-center">
              <span>Nome</span>
              <span className="text-accent">IA</span>
            </span>
          </Link>
        </div>

        <div className="max-w-lg space-y-8 my-auto py-12">
          <div className="space-y-4">
            <h1 className="text-[32px] xl:text-[36px] font-semibold tracking-tight text-white leading-[1.2]">
              Sua preparação rumo à nomeação.
            </h1>
            <p className="text-white/65 text-base leading-relaxed">
              Ciclos de estudo, revisões espaçadas, edital verticalizado e histórico
              completo — organizados em um só lugar.
            </p>
          </div>

          <ul className="space-y-3 border-t border-white/10 pt-6">
            {[
              "Ciclo rotativo de estudos com metas por matéria",
              "Revisões espaçadas agendadas automaticamente",
              "Edital verticalizado com acompanhamento por tópico",
              "Registro de estudos e análise de desempenho",
            ].map((feature, i) => (
              <li key={i} className="flex items-center gap-3 text-white/80 text-sm">
                <Check aria-hidden className="w-4 h-4 shrink-0 text-accent" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="text-xs text-white/45 border-t border-white/10 pt-6">
          <p>© {new Date().getFullYear()} NomeIA. Todos os direitos reservados.</p>
        </div>
      </div>

      {/* Lado Direito - Container de Formulários (5 cols) */}
      <div className="lg:col-span-6 xl:col-span-5 flex flex-col justify-between p-6 sm:p-12 lg:p-16 min-h-screen">
        {/* Top Header Mobile */}
        <div className="flex items-center justify-between lg:hidden mb-8">
          <Link href="/login" className="flex items-center gap-3 font-semibold text-lg text-foreground">
            <Image
              src="/branding/nomeia-icon.png"
              alt="NomeIA"
              width={36}
              height={36}
              className="w-8 h-8 rounded-md object-contain"
              priority
            />
            <span className="text-foreground flex items-center">
              <span>Nome</span>
              <span className="text-primary">IA</span>
            </span>
          </Link>
        </div>

        <div className="w-full max-w-md mx-auto my-auto space-y-6">{children}</div>

        {/* Footer Mobile */}
        <div className="mt-8 text-center text-xs text-muted-foreground lg:hidden">
          © {new Date().getFullYear()} NomeIA. Todos os direitos reservados.
        </div>
      </div>
    </div>
  )
}
