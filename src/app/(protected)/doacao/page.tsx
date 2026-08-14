"use client"

import { useEffect, useState } from "react"

import { Check, Copy, Heart, ShieldCheck, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LogoutButton } from "@/features/auth/components/logout-button"
import { createClient } from "@/infrastructure/supabase/client"

export default function DoacaoPage() {
  const [copied, setCopied] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const pixKey = "rendersonluan@gmail.com"

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data?.user?.email ?? null)
    })
  }, [])

  const handleCopyPix = () => {
    navigator.clipboard.writeText(pixKey)
    setCopied(true)
    toast.success("Chave PIX copiada para a área de transferência! 🎉")
    setTimeout(() => setCopied(false), 3000)
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full space-y-8">
        {/* Top Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-500">
            <Heart className="h-7 w-7 fill-rose-500" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              Apoie o Projeto Nomeia
            </h1>
            <p className="text-xs text-muted-foreground font-semibold">
              Ajude a manter a plataforma no ar e evoluindo para a comunidade de concurseiros
            </p>
          </div>
        </div>

        {/* Main Donation Card */}
        <div className="rounded-2xl border bg-card p-6 md:p-8 shadow-sm space-y-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -z-10" />

          <div className="space-y-3">
            <Badge className="bg-[#dbeafe] text-[#2563EB] hover:bg-[#2563EB] hover:text-white font-extrabold text-[10px] uppercase px-3 py-1 border-0">
              <Sparkles className="h-3 w-3 mr-1 inline" /> Doação Voluntária
            </Badge>
            <h2 className="text-xl font-extrabold text-foreground">
              O Nomeia é um projeto feito de concurseiro para concurseiro! 🚀
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed font-medium">
              O <strong>Nomeia</strong> nasceu com o objetivo de oferecer uma ferramenta completa,
              moderna e 100% focada na aprovação: com edital verticalizado, gestão por ciclos de
              estudo, estatísticas de desempenho, cronômetro inteligente e controle de constância.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed font-medium">
              Se a plataforma tem ajudado na sua rotina diária e você deseja apoiar a manutenção do
              servidor e a criação de novas funcionalidades, qualquer contribuição é imensamente
              bem-vinda! ❤️
            </p>
          </div>

          {/* PIX Box */}
          <div className="rounded-xl border border-[#2563EB]/40 bg-[#dbeafe]/20 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
                CHAVE PIX (E-MAIL)
              </span>
              <span className="text-[11px] font-bold text-[#2563EB] flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" /> Pix Seguro
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-card border p-4 rounded-xl">
              <span className="font-mono text-sm sm:text-base font-extrabold text-foreground tracking-wide">
                {pixKey}
              </span>

              <Button
                onClick={handleCopyPix}
                className={`w-full sm:w-auto font-bold text-xs px-6 h-10 gap-2 transition-all ${
                  copied
                    ? "bg-emerald-600 text-white"
                    : "bg-[#2563EB] hover:bg-[#1D4ED8] text-white shadow-xs"
                }`}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    Copiado com Sucesso!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copiar Chave PIX
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Profile & Account Management Info */}
        <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-extrabold uppercase text-muted-foreground tracking-wider">
            Sua Conta
          </h3>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t pt-4">
            <div>
              <p className="text-xs text-muted-foreground font-semibold">Conta Ativa</p>
              <p className="text-sm font-bold text-foreground">{userEmail ?? "Carregando..."}</p>
            </div>

            <LogoutButton />
          </div>
        </div>
      </div>
    </div>
  )
}
