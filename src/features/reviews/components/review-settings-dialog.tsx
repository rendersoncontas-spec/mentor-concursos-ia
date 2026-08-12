"use client"

import { useEffect, useState } from "react"
import { CalendarDays, Flame, Leaf, Loader2, Rocket, Settings2, Shield } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import type { ReviewProfile, ReviewSettings } from "@/domain/reviews/models"
import { REVIEW_PROFILE_LABEL } from "@/domain/reviews/models"
import { getReviewSettingsAction, updateReviewSettingsAction } from "@/application/review-engine/review.actions"
import { toast } from "sonner"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (settings: ReviewSettings) => void
}

const PRESETS: { profile: ReviewProfile; description: string }[] = [
  { profile: "EQUILIBRADO", description: "90% de retenção, 20 novos/dia" },
  { profile: "ALTA_RETENCAO", description: "95% de retenção, menos cartões novos" },
  { profile: "RETA_FINAL", description: "Foco total nos próximos dias de prova" },
  { profile: "LEVE", description: "Carga mínima, retenção 85%" },
]

function profileIcon(profile: ReviewProfile) {
  if (profile === "RETA_FINAL") return <Flame className="h-4 w-4 text-orange-500" />
  if (profile === "LEVE") return <Leaf className="h-4 w-4 text-green-600" />
  if (profile === "ALTA_RETENCAO") return <Shield className="h-4 w-4 text-blue-600" />
  return <Rocket className="h-4 w-4 text-primary" />
}

export function ReviewSettingsDialog({ open, onOpenChange, onSaved }: Props) {
  const [settings, setSettings] = useState<ReviewSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmPreset, setConfirmPreset] = useState<ReviewProfile | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      const res = await getReviewSettingsAction()
      if (!cancelled && res.data) setSettings(res.data)
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  if (!settings) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajustes de Revisão</DialogTitle>
            <DialogDescription>Carregando configurações…</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )
  }

  const applyPreset = async (profile: ReviewProfile) => {
    setSaving(true)
    const res = await updateReviewSettingsAction({ review_profile: profile })
    setSaving(false)
    setConfirmPreset(null)
    if (res.data) {
      setSettings(res.data)
      onSaved(res.data)
      toast.success(`Perfil "${REVIEW_PROFILE_LABEL[profile]}" aplicado.`)
    } else {
      toast.error(res.error ?? "Erro ao aplicar perfil.")
    }
  }

  const save = async (patch: Partial<ReviewSettings>) => {
    setSaving(true)
    const res = await updateReviewSettingsAction(patch)
    setSaving(false)
    if (res.data) {
      setSettings(res.data)
      onSaved(res.data)
      toast.success("Configurações salvas.")
    } else {
      toast.error(res.error ?? "Erro ao salvar.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            Ajustes de Revisão
          </DialogTitle>
          <DialogDescription>Controla a carga diária e a retenção desejada do FSRS.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Perfis */}
          <section>
            <p className="text-sm font-semibold mb-2">Perfil de revisão</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PRESETS.map(({ profile, description }) => (
                <button
                  key={profile}
                  type="button"
                  onClick={() => setConfirmPreset(profile)}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-all",
                    settings.review_profile === profile ? "border-primary bg-primary/5" : "hover:border-primary/40"
                  )}
                >
                  <p className="text-sm font-semibold flex items-center gap-1.5">
                    {profileIcon(profile)}
                    {REVIEW_PROFILE_LABEL[profile]}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                </button>
              ))}
            </div>
          </section>

          {/* Retenção desejada */}
          <section>
            <Label>Retenção desejada: {Math.round(settings.desired_retention * 100)}%</Label>
            <Slider
              className="mt-3"
              min={80}
              max={95}
              step={1}
              value={[Math.round(settings.desired_retention * 100)]}
              onValueChange={(v) => {
                const value = v[0]
                if (value === undefined) return
                setSettings({ ...settings, desired_retention: value / 100 })
              }}
              onValueCommit={(v) => {
                const value = v[0]
                if (value !== undefined) void save({ desired_retention: value / 100 })
              }}
            />
            <p className="text-xs text-muted-foreground mt-2">Quanto maior a retenção, mais frequentes (e numerosas) as revisões.</p>
          </section>

          {/* Carga */}
          <section className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="new-per-day">Novos cartões/dia</Label>
              <Input
                id="new-per-day"
                type="number"
                min={1}
                max={100}
                value={settings.new_cards_per_day}
                onChange={(e) => setSettings({ ...settings, new_cards_per_day: Number(e.target.value) || 1 })}
                onBlur={() => void save({ new_cards_per_day: settings.new_cards_per_day })}
              />
            </div>
            <div>
              <Label htmlFor="max-review">Máx. revisões/dia</Label>
              <Input
                id="max-review"
                type="number"
                min={1}
                max={1000}
                value={settings.max_reviews_per_day}
                onChange={(e) => setSettings({ ...settings, max_reviews_per_day: Number(e.target.value) || 1 })}
                onBlur={() => void save({ max_reviews_per_day: settings.max_reviews_per_day })}
              />
            </div>
          </section>

          {/* Data da prova */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="exam-date" className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                Data da prova
              </Label>
              <Input
                id="exam-date"
                type="date"
                value={settings.exam_date ?? ""}
                onChange={(e) => setSettings({ ...settings, exam_date: e.target.value || null })}
                onBlur={() => void save({ exam_date: settings.exam_date })}
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                className={cn("w-full", settings.reta_final && "border-orange-400 text-orange-600")}
                disabled={!settings.exam_date}
                onClick={() => {
                  const next = !settings.reta_final
                  void save({ reta_final: next, review_profile: next ? "RETA_FINAL" : settings.review_profile })
                }}
              >
                <Flame className="h-4 w-4" />
                {settings.reta_final ? "Reta Final ativa" : "Ativar Reta Final"}
              </Button>
            </div>
          </section>
          {!settings.exam_date && (
            <p className="text-xs text-muted-foreground -mt-3">Defina uma data de prova para habilitar a Reta Final.</p>
          )}

          {settings.reta_final && settings.exam_date && (
            <Badge className="bg-orange-500/10 border-orange-500/40 text-orange-600">
              Reta Final: prioriza tópicos fracos, erros e vencidas até {settings.exam_date.slice(0, 10)}.
            </Badge>
          )}
        </div>

        {/* Confirmação de perfil */}
        <Dialog open={confirmPreset !== null} onOpenChange={(open) => !open && setConfirmPreset(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Aplicar perfil {confirmPreset ? REVIEW_PROFILE_LABEL[confirmPreset] : ""}?</DialogTitle>
              <DialogDescription>
                Isso altera retenção desejada, limite de novos cartões e metas do dia. Você pode voltar ao perfil anterior a qualquer momento.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmPreset(null)}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  if (confirmPreset) void applyPreset(confirmPreset)
                }}
                disabled={saving}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Aplicar
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="text-xs text-muted-foreground border-t pt-3">
          Erros de simulados são adicionados às revisões por padrão (config {settings.auto_add_errors ? "ativada" : "desativada"}).
        </div>
      </DialogContent>
    </Dialog>
  )
}