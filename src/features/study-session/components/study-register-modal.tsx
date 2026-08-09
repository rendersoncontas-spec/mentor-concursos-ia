"use client"

import { useRouter } from "next/navigation"

import { useState, useEffect, useCallback } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Minimize2, X, Timer, Play, Pause, RotateCcw, CheckCircle2, Square, ChevronsUpDown, Check } from "lucide-react"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"

import { useGlobalStudy } from "./study-provider"
import { StudyTechnique } from "@/domain/study-history/study-history.types"
import { saveStudySessionAction } from "@/application/study-session/study-session.action"
import { getDisciplinesForAutocomplete, type DisciplineOption } from "@/application/study-session/get-disciplines.action"

const sessionSchema = z.object({
  studyType: z.string().min(1, "Obrigatório"),
  technique: z.string().min(1, "Obrigatório"),
  discipline_name: z.string().min(1, "Disciplina é obrigatória"),
  discipline_id: z.string().optional(),
  topic_name: z.string().optional().default(""),
  pages_read: z.coerce.number().min(0).optional(),
  questions_answered: z.coerce.number().min(0).optional(),
  questions_correct: z.coerce.number().min(0).optional(),
  audio_name: z.string().optional(),
  audio_author: z.string().optional(),
  audio_platform: z.string().optional(),
  audio_speed: z.string().optional(),
  audio_url: z.string().url("URL inválida").optional().or(z.literal("")),
  notes: z.string().optional(),
  is_manual_mode: z.boolean().default(false),
  manual_hours: z.coerce.number().min(0).optional(),
  manual_minutes_field: z.coerce.number().min(0).max(59).optional(),
  manual_seconds: z.coerce.number().min(0).max(59).optional(),
  study_date: z.string().optional()
}).refine(data => {
  if (data.questions_answered && data.questions_correct) return data.questions_correct <= data.questions_answered
  return true
}, { message: "Acertos não podem ser maiores que as questões", path: ["questions_correct"] })
.refine(data => {
  if (data.is_manual_mode) {
    const totalMinutes = (data.manual_hours || 0) * 60 + (data.manual_minutes_field || 0) + (data.manual_seconds || 0) / 60
    return totalMinutes >= 1
  }
  return true
}, { message: "Tempo mínimo de 1 minuto", path: ["manual_minutes_field"] })

type SessionFormValues = z.infer<typeof sessionSchema>

interface StudyRegisterModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export function StudyRegisterModal({ open, onOpenChange }: StudyRegisterModalProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [disciplinePopoverOpen, setDisciplinePopoverOpen] = useState(false)
  const [planDisciplines, setPlanDisciplines] = useState<DisciplineOption[]>([])
  const [allDisciplines, setAllDisciplines] = useState<DisciplineOption[]>([])
  const [disciplinesLoaded, setDisciplinesLoaded] = useState(false)

  const form = useForm<SessionFormValues>({
    resolver: zodResolver(sessionSchema) as any,
    defaultValues: {
      studyType: "TEORIA", technique: "LIVRE", discipline_name: "", discipline_id: "",
      topic_name: "", pages_read: 0, questions_answered: 0, questions_correct: 0,
      audio_name: "", audio_author: "", audio_platform: "", audio_speed: "1x", audio_url: "",
      notes: "", is_manual_mode: false, manual_hours: 0, manual_minutes_field: 0,
      manual_seconds: 0, study_date: new Date().toISOString().split("T")[0]
    }
  })

  const watchType = form.watch("studyType")
  const watchTechnique = form.watch("technique") as StudyTechnique
  const watchTopic = form.watch("topic_name")
  const watchDiscipline = form.watch("discipline_name")
  const isManualMode = form.watch("is_manual_mode")

  const { session, startSession, pauseSession, resumeSession, endSession } = useGlobalStudy()

  const phase = session?.phase ?? 'IDLE'
  const activeSeconds = session?.activeSeconds ?? 0
  const pausedSeconds = session?.pausedSeconds ?? 0
  const focusPercentage = activeSeconds + pausedSeconds > 0 ? Math.round((activeSeconds / (activeSeconds + pausedSeconds)) * 100) : 0

  const loadDisciplines = useCallback(async () => {
    if (disciplinesLoaded) return
    try {
      const result = await getDisciplinesForAutocomplete()
      setPlanDisciplines(result.planDisciplines)
      setAllDisciplines(result.allDisciplines)
      setDisciplinesLoaded(true)
    } catch (err) {
      console.error("Erro ao carregar disciplinas:", err)
    }
  }, [disciplinesLoaded])

  useEffect(() => {
    if (open) loadDisciplines()
  }, [open, loadDisciplines])

  const handleMinimize = () => onOpenChange(false)

  const handleClose = () => {
    if (phase !== 'IDLE') {
      onOpenChange(false)
      return
    }
    endSession()
    form.reset()
    onOpenChange(false)
  }

  const onSubmit = async (data: SessionFormValues) => {
    setIsSubmitting(true)
    try {
      const manualTotalMinutes = data.is_manual_mode
        ? Math.round((data.manual_hours || 0) * 60 + (data.manual_minutes_field || 0) + (data.manual_seconds || 0) / 60)
        : 0
      const payload = {
        ...data,
        activeMinutes: data.is_manual_mode ? manualTotalMinutes : Math.round(activeSeconds / 60),
        pausedMinutes: data.is_manual_mode ? 0 : Math.round(pausedSeconds / 60),
        focusPercentage: data.is_manual_mode ? 100 : focusPercentage,
        completedCycles: 0
      }
      const res = await saveStudySessionAction(payload)
      if (!res.success) { toast.error(res.error || "Erro ao salvar a sessão."); return }
      toast.success("Sessão salva com sucesso!")
      endSession()
      form.reset()
      onOpenChange(false)
      router.refresh()
    } catch (error: any) {
      toast.error(error?.message || "Erro ao salvar a sessão.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const planIds = new Set(planDisciplines.map(d => d.id))
  const otherDisciplines = allDisciplines.filter(d => !planIds.has(d.id))

  const handleSelectDiscipline = (disc: DisciplineOption) => {
    form.setValue("discipline_name", disc.name, { shouldValidate: true })
    form.setValue("discipline_id", disc.id)
    setDisciplinePopoverOpen(false)
  }

  const renderDynamicFields = () => {
    if (watchType === 'QUESTOES' || watchType === 'SIMULADO') {
      return (
        <>
          <FormField control={form.control as any} name="questions_answered" render={({field}) => (
            <FormItem><FormLabel>Questões Respondidas</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control as any} name="questions_correct" render={({field}) => (
            <FormItem><FormLabel>Acertos</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </>
      )
    }
    if (watchType === 'AUDIO') {
      return (
        <>
          <FormField control={form.control as any} name="audio_name" render={({field}) => (
            <FormItem><FormLabel>Nome do Áudio/Podcast</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control as any} name="audio_author" render={({field}) => (
            <FormItem><FormLabel>Autor / Professor</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control as any} name="audio_platform" render={({field}) => (
            <FormItem><FormLabel>Plataforma (ex: Spotify)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control as any} name="audio_url" render={({field}) => (
            <FormItem><FormLabel>Link (Opcional)</FormLabel><FormControl><Input type="url" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </>
      )
    }
    if (watchType === 'TEORIA' || watchType === 'LEITURA') {
      return (
        <FormField control={form.control as any} name="pages_read" render={({field}) => (
          <FormItem><FormLabel>Páginas Estudadas</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
      )
    }
    return null
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[1000px] w-[95vw] h-[85vh] p-0 flex flex-col overflow-hidden bg-background border-border">
        {/* Header Simplificado */}
        <div className="flex items-center justify-between p-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            Centro Inteligente de Estudos
          </DialogTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={handleMinimize} className="w-8 h-8 text-muted-foreground hover:text-foreground" title="Minimizar">
              <Minimize2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleClose} className="w-8 h-8 text-muted-foreground hover:text-foreground" title="Fechar">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col lg:flex-row p-4 gap-4 flex-1 overflow-hidden">
          {/* Timer Left */}
          <div className="lg:w-[280px] flex flex-col shrink-0">
            <div className="rounded-xl border bg-muted/20 p-4 flex flex-col justify-between h-full shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Timer className="h-3.5 w-3.5 text-primary" />
                  {isManualMode ? "Manual" : (phase === 'STUDYING' ? 'Estudando' : phase === 'PAUSED' ? 'Pausado' : 'Pronto')}
                </div>
              </div>

              {isManualMode ? (
                <div className="flex-1 flex flex-col justify-center gap-4">
                  <FormField control={form.control as any} name="study_date" render={({field}) => (
                    <FormItem><FormLabel className="text-xs">Data</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <div>
                    <Label className="text-xs font-medium">Tempo</Label>
                    <div className="grid grid-cols-3 gap-1.5 mt-1">
                      <FormField control={form.control as any} name="manual_hours" render={({field}) => (
                        <FormItem><FormControl><Input type="number" min={0} max={23} placeholder="0" className="pr-6 text-center text-sm" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control as any} name="manual_minutes_field" render={({field}) => (
                        <FormItem><FormControl><Input type="number" min={0} max={59} placeholder="0" className="pr-8 text-center text-sm" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control as any} name="manual_seconds" render={({field}) => (
                        <FormItem><FormControl><Input type="number" min={0} max={59} placeholder="0" className="pr-7 text-center text-sm" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center mb-3">
                    <Button variant="outline" size="sm" onClick={() => form.setValue("is_manual_mode", !isManualMode)} className="text-xs h-9 px-3">
                      {isManualMode ? "Cronômetro" : "Manual"}
                    </Button>
                    <FormField control={form.control as any} name="technique" render={({field}) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger className="h-9 text-xs w-[130px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="LIVRE">Livre</SelectItem>
                          <SelectItem value="POMODORO_25_5">Pomodoro 25/5</SelectItem>
                          <SelectItem value="POMODORO_50_10">Pomodoro 50/10</SelectItem>
                          <SelectItem value="FLOWTIME">Flowtime</SelectItem>
                          <SelectItem value="DEEP_WORK">Deep Work 90m</SelectItem>
                        </SelectContent>
                      </Select>
                    )} />
                  </div>

                  <div className="flex flex-col items-center gap-4 flex-1 justify-center">
                    <div className="text-4xl font-mono font-bold tracking-tight tabular-nums text-primary w-[120px] text-center">
                      {formatTime(activeSeconds)}
                    </div>
                    <div className="flex items-center gap-2">
                      {phase === 'IDLE' || phase === 'PAUSED' ? (
                        <Button size="sm" onClick={() => {
                          if (phase === 'IDLE') startSession({ disciplineName: form.getValues("discipline_name") || "Estudo", topicName: form.getValues("topic_name"), studyType: form.getValues("studyType"), technique: watchTechnique })
                          else resumeSession()
                        }} className="gap-1.5 w-24 bg-blue-600 hover:bg-blue-700 h-9">
                          <Play className="h-4 w-4" /> {phase === 'PAUSED' ? 'Continuar' : 'Iniciar'}
                        </Button>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={pauseSession} className="gap-1.5 w-24 h-9">
                          <Pause className="h-4 w-4" /> Pausar
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => { endSession(); form.reset() }} className="gap-1.5 w-24 h-9">
                        <RotateCcw className="h-3.5 w-3.5" /> Resetar
                      </Button>
                    </div>
                  </div>

                  <div className="flex gap-4 text-xs text-center w-full justify-center pt-3 border-t mt-2">
                    <div><p className="text-muted-foreground text-[9px] font-bold uppercase">Ativo</p><p className="font-semibold text-green-600 font-mono">{formatTime(activeSeconds)}</p></div>
                    <div><p className="text-muted-foreground text-[9px] font-bold uppercase">Pausa</p><p className="font-semibold text-amber-600 font-mono">{formatTime(pausedSeconds)}</p></div>
                    <div><p className="text-muted-foreground text-[9px] font-bold uppercase">Foco</p><p className="font-semibold text-blue-600 font-mono">{focusPercentage}%</p></div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right: Form with FormProvider */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit as any, (errors) => {
                const messages = Object.entries(errors).map(([key, err]) => `${key}: ${(err as any)?.message}`).join(", ")
                toast.error(`Campos obrigatórios: ${messages}`)
              })} className="flex flex-col h-full gap-3 overflow-y-auto">

                {/* Manual mode fields - moved here to be inside FormProvider */}
                {isManualMode && (
                  <div className="space-y-3 p-3 border rounded-lg bg-muted/20">
                    <FormField control={form.control as any} name="study_date" render={({field}) => (
                      <FormItem><FormLabel className="text-xs">Data</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <div>
                      <Label className="text-xs font-medium">Tempo</Label>
                      <div className="grid grid-cols-3 gap-1.5 mt-1">
                        <FormField control={form.control as any} name="manual_hours" render={({field}) => (
                          <FormItem><FormControl><Input type="number" min={0} max={23} placeholder="0h" className="text-center text-sm h-9" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control as any} name="manual_minutes_field" render={({field}) => (
                          <FormItem><FormControl><Input type="number" min={0} max={59} placeholder="0m" className="text-center text-sm h-9" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control as any} name="manual_seconds" render={({field}) => (
                          <FormItem><FormControl><Input type="number" min={0} max={59} placeholder="0s" className="text-center text-sm h-9" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                        )} />
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">
                  <FormField control={form.control as any} name="discipline_name" render={({field}) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className="text-xs">Disciplina</FormLabel>
                      <Popover open={disciplinePopoverOpen} onOpenChange={setDisciplinePopoverOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button variant="outline" role="combobox" className={cn("w-full justify-between font-normal h-9 text-sm", !field.value && "text-muted-foreground")}>
                              {field.value || "Selecionar..."}<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0 max-h-[250px] overflow-hidden flex flex-col" align="start">
                          <Command className="w-full h-full flex flex-col">
                            <CommandInput placeholder="Buscar..." onValueChange={(search) => { if (search) { form.setValue("discipline_name", search, { shouldValidate: true }); form.setValue("discipline_id", "") } }} />
                            <CommandList className="max-h-[200px] overflow-y-auto">
                              <CommandEmpty><p className="text-sm p-2">Nenhuma encontrada.</p></CommandEmpty>
                              {planDisciplines.length > 0 && (
                                <CommandGroup heading="Plano">
                                  {planDisciplines.map((disc) => (
                                    <CommandItem key={`plan-${disc.id}`} value={disc.name} onSelect={() => handleSelectDiscipline(disc)} className="cursor-pointer">
                                      <Check className={cn("mr-2 h-4 w-4", field.value === disc.name ? "opacity-100" : "opacity-0")} />
                                      <span className="font-medium text-sm">{disc.name}</span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )}
                              {otherDisciplines.length > 0 && (
                                <CommandGroup heading="Todas">
                                  {otherDisciplines.map((disc) => (
                                    <CommandItem key={`all-${disc.id}`} value={disc.name} onSelect={() => handleSelectDiscipline(disc)} className="cursor-pointer">
                                      <Check className={cn("mr-2 h-4 w-4", field.value === disc.name ? "opacity-100" : "opacity-0")} />
                                      <span className="text-sm">{disc.name}</span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control as any} name="topic_name" render={({field}) => (
                    <FormItem><FormLabel className="text-xs">Tópico</FormLabel><FormControl><Input placeholder="Ex: Direitos Fundamentais" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>

                <div className="p-3 border rounded-lg bg-card shrink-0">
                  <FormField control={form.control as any} name="studyType" render={({field}) => (
                    <FormItem>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <SelectTrigger className="font-medium h-9 text-sm"><SelectValue placeholder="Tipo..." /></SelectTrigger>
                        <SelectContent className="max-h-[200px]">
                          <SelectItem value="TEORIA">📖 Teoria</SelectItem>
                          <SelectItem value="QUESTOES">✍️ Questões</SelectItem>
                          <SelectItem value="REVISAO">🔁 Revisão</SelectItem>
                          <SelectItem value="AUDIO">🎧 Áudio</SelectItem>
                          <SelectItem value="VIDEOAULA">🎥 Videoaula</SelectItem>
                          <SelectItem value="SIMULADO">🧪 Simulado</SelectItem>
                          <SelectItem value="OUTRO">⭐ Outro</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  {renderDynamicFields() && (
                    <div className="grid grid-cols-2 gap-2 pt-2">{renderDynamicFields()}</div>
                  )}
                </div>

                <FormField control={form.control as any} name="notes" render={({field}) => (
                  <FormItem className="flex-1 flex flex-col min-h-[80px]">
                    <FormLabel className="text-xs shrink-0">Anotações</FormLabel>
                    <FormControl className="flex-1">
                      <Textarea placeholder="Resumos, conceitos ou links..." className="flex-1 resize-none font-mono text-sm bg-muted/10" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="flex gap-2 justify-end pt-2 shrink-0">
                  <Button type="button" variant="ghost" onClick={handleClose} className="h-9">Cancelar</Button>
                  <Button type="submit" disabled={isSubmitting} className="gap-1.5 bg-primary h-9 px-6">
                    <Square className="h-3.5 w-3.5 fill-current" />
                    {isSubmitting ? "Salvando..." : "Finalizar & Salvar"}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
