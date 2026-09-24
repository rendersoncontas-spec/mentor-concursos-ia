"use client"

import { useEffect, useState } from "react"

import { Check, Copy, Heart, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
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
    toast.success("Chave PIX copiada para a área de transferência!")
    setTimeout(() => setCopied(false), 3000)
  }

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        icon={Heart}
        title="Apoie o projeto"
        description="Ajude a manter a plataforma no ar e evoluindo"
      />
      <div className="flex-1 page-container py-5 space-y-5">

        {/* Main Donation Card */}
        <div className="rounded-lg border border-border bg-card p-5 md:p-6 space-y-5">

          <div className="space-y-3">
            <Badge>Doação voluntária</Badge>
            <h2 className="type-h2 text-foreground">
              O NomeIA é um projeto feito de concurseiro para concurseiro
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed font-medium">
              O <strong>NomeIA</strong> nasceu com o objetivo de oferecer uma ferramenta completa,
              moderna e 100% focada na aprovação: com edital verticalizado, gestão por ciclos de
              estudo, estatísticas de desempenho, cronômetro e controle de constância.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed font-medium">
              Se a plataforma tem ajudado na sua rotina diária e você deseja apoiar a manutenção do
              servidor e a criação de novas funcionalidades, qualquer contribuição é imensamente
              bem-vinda.
            </p>
          </div>

          {/* PIX Box */}
          <div className="max-w-2xl rounded-lg border border-border bg-muted/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="type-label block">
                Chave Pix (e-mail)
              </span>
              <span className="text-[11px] font-semibold text-primary flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" /> Pix Seguro
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card border border-border p-3 rounded-md">
              <span className="tabular-nums text-sm sm:text-base font-semibold text-foreground tracking-wide">
                {pixKey}
              </span>

              <Button
                onClick={handleCopyPix}
                size="sm"
                variant={copied ? "outline" : "default"}
                className="w-full sm:w-auto"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copiar chave Pix
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Profile & Account Management Info */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h3 className="text-[13px] font-semibold text-foreground">
            Sua Conta
          </h3>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t pt-4">
            <div>
              <p className="text-xs text-muted-foreground font-semibold">Conta Ativa</p>
              <p className="text-sm font-semibold text-foreground">{userEmail ?? "Carregando..."}</p>
            </div>

            <LogoutButton />
          </div>
        </div>
      </div>
    </div>
  )
}
