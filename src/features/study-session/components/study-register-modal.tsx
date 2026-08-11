"use client"

import { useRouter } from "next/navigation"

import { useState, useEffect, useCallback } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Minimize2, X, Timer, Play, Pause, RotateCcw, CheckCircle2, Square, ChevronsUpDown, Check, Circle, ToggleLeft } from "lucide-react"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"

import { useGlobalStudy } from "./study-provider"
import { StudyTechnique } from "@/domain/study-history/study-history.types"
import { saveStudySessionAction } from "@/application/study-session/study-session.action"
import { updateStudySessionAction } from "@/application/study-history/study-history.actions"
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
  flashcards_reviewed: z.coerce.number().min(0).optional(),
  flashcards_correct: z.coerce.number().min(0).optional(),
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
  study_date: z.string().optional(),
  duration_minutes: z.coerce.number().min(1).optional()
}).refine(data => {
  if (data.questions_answered && data.questions_correct) return data.questions_correct <= data.questions_answered
  return true
}, { message: "Acertos não podem ser maiores que as questões", path: ["questions_correct"] })
.refine(data => {
  if (data.flashcards_reviewed && data.flashcards_correct) return data.flashcards_correct <= data.flashcards_reviewed
  return true
}, { message: "Acertos não podem ser maiores que os revisados", path: ["flashcards_correct"] })
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
  sessionToEdit?: any
  mode?: "create" | "edit"
}

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export function StudyRegisterModal({ open, onOpenChange, sessionToEdit, mode = "create" }: StudyRegisterModalProps) {
  const router = useRouter()
  const isEditMode = mode === "edit" && !!sessionToEdit
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
  const isManualMode = form.watch("is_manual_mode")

  // Pre-fill form when entering edit mode
  useEffect(() => {
    if (isEditMode && sessionToEdit && open) {
      const metadata = sessionToEdit.metadata || {}
      form.reset({
        studyType: sessionToEdit.study_type || "TEORIA",
        technique: sessionToEdit.technique || "LIVRE",
        discipline_name: sessionToEdit.disciplines?.name || "",
        discipline_id: sessionToEdit.discipline_id || "",
        topic_name: metadata.topic_name || "",
        pages_read: metadata.pages_read ?? 0,
        questions_answered: metadata.questions_answered ?? 0,
        questions_correct: metadata.questions_correct ?? 0,
        audio_name: metadata.audio_name || "",
        audio_author: metadata.audio_author || "",
        audio_platform: metadata.audio_platform || "",
        audio_speed: metadata.audio_speed || "1x",
        audio_url: metadata.audio_url || "",
        flashcards_reviewed: metadata.flashcards_reviewed ?? 0,
        flashcards_correct: metadata.flashcards_correct ?? 0,
        notes: sessionToEdit.notes || "",
        is_manual_mode: true,
        manual_hours: Math.floor((sessionToEdit.duration_minutes || 0) / 60),
        manual_minutes_field: (sessionToEdit.duration_minutes || 0) % 60,
        manual_seconds: 0,
        study_date: sessionToEdit.started_at ? new Date(sessionToEdit.started_at).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]
      })
    } else if (open && !isEditMode) {
      form.reset({
        studyType: "TEORIA", technique: "LIVRE", discipline_name: "", discipline_id: "",
        topic_name: "", pages_read: 0, questions_answered: 0, questions_correct: 0,
        flashcards_reviewed: 0, flashcards_correct: 0,
        audio_name: "", audio_author: "", audio_platform: "", audio_speed: "1x", audio_url: "",
        notes: "", is_manual_mode: false, manual_hours: 0, manual_minutes_field: 0,
        manual_seconds: 0, study_date: new Date().toISOString().split("T")[0]
      })
    }
  }, [open, isEditMode, sessionToEdit])

  const toggleManualMode = () => {
    const newVal = !isManualMode
    form.setValue("is_manual_mode", newVal, { shouldDirty: true, shouldValidate: true })
  }

  const { session, startSession, pauseSession, resumeSession, endSession, minimizeSession, toggleFloatingTimer, floatingTimerEnabled, finalizeAndSaveSession } = useGlobalStudy()

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
  }, [])

  useEffect(() => {
    if (open) {
      loadDisciplines()
    }
  }, [open])

  // Também carrega na montagem caso o modal já venha aberto
  useEffect(() => {
    loadDisciplines()
  }, [loadDisciplines])

  const handleMinimize = () => {
    minimizeSession()
    onOpenChange(false)
    window.dispatchEvent(new CustomEvent("close-study-session-modal"))
  }

  const handleClose = () => {
    if (phase !== 'IDLE') {
      onOpenChange(false)
      return
    }
    endSession()
    form.reset()
    onOpenChange(false)
    window.dispatchEvent(new CustomEvent("close-study-session-modal"))
  }

  const onSubmit = async (data: SessionFormValues) => {
    console.log("[STUDY_SAVE_CLIENT] onSubmit iniciado", { 
      isEditMode, discipline: data.discipline_name, studyType: data.studyType 
    })
    
    setIsSubmitting(true)
    try {
      if (isEditMode && sessionToEdit) {
        // Modo EDIÇÃO: atualizar sessão existente
        const metadata: Record<string, any> = {
          ...(sessionToEdit.metadata || {}),
          topic_name: data.topic_name || null,
          pages_read: data.pages_read || 0,
          questions_answered: data.questions_answered || 0,
          questions_correct: data.questions_correct || 0,
          flashcards_reviewed: data.flashcards_reviewed || 0,
          flashcards_correct: data.flashcards_correct || 0,
          audio_name: data.audio_name || null,
          audio_author: data.audio_author || null,
          audio_platform: data.audio_platform || null,
          audio_speed: data.audio_speed || null,
          audio_url: data.audio_url || null,
        }

        const updatePayload: Record<string, any> = {
          discipline_id: data.discipline_id || sessionToEdit.discipline_id,
          study_type: data.studyType,
          technique: data.technique,
          notes: data.notes || null,
          metadata,
        }

        // Handle date change
        if (data.study_date) {
          updatePayload["started_at"] = new Date(data.study_date + "T12:00:00").toISOString()
        }

        // Handle duration change from manual time inputs
        const totalMinutes = (Number(data.manual_hours) || 0) * 60 + (Number(data.manual_minutes_field) || 0) + Math.round((Number(data.manual_seconds) || 0) / 60)
        
        updatePayload["duration_minutes"] = totalMinutes
        updatePayload["active_minutes"] = totalMinutes
        updatePayload["paused_minutes"] = 0
        
        const startDateStr = updatePayload["started_at"] || sessionToEdit.started_at
        if (startDateStr) {
          updatePayload["finished_at"] = new Date(
            new Date(startDateStr).getTime() + (totalMinutes * 60 * 1000)
          ).toISOString()
        }

        // Preserve focus_score if it was in original metadata
        if (sessionToEdit.metadata?.focus_percentage !== undefined) {
          updatePayload["metadata"] = {
            ...metadata,
            focus_percentage: sessionToEdit.metadata.focus_percentage,
          }
        }

        const res = await updateStudySessionAction(sessionToEdit.id, updatePayload)
        
        if (res.error) {
          toast.error("Erro ao atualizar: " + res.error)
          return
        }
        
        toast.success("Sessão atualizada com sucesso!")
        form.reset()
        onOpenChange(false)
        window.dispatchEvent(new CustomEvent("close-study-session-modal"))
        router.refresh()
      } else {
        // Modo CRIAÇÃO: salvar nova sessão via cronômetro
        const res = await finalizeAndSaveSession({
          pages_read: data.pages_read,
          questions_answered: data.questions_answered,
          questions_correct: data.questions_correct,
          flashcards_reviewed: data.flashcards_reviewed,
          flashcards_correct: data.flashcards_correct,
          audio_name: data.audio_name,
          audio_author: data.audio_author,
          audio_platform: data.audio_platform,
          audio_speed: data.audio_speed,
          audio_url: data.audio_url,
          notes: data.notes,
          topic_name: data.topic_name,
          studyType: data.studyType,
          technique: data.technique,
          discipline_id: data.discipline_id,
        })
        
        console.log("[STUDY_SAVE_CLIENT] Resposta do servidor:", res)
        
        if (!res || !res.success) {
          const errMsg = res?.error || "Erro desconhecido ao salvar a sessão."
          console.error("[STUDY_SAVE_CLIENT] Falha ao salvar:", errMsg, res)
          toast.error(errMsg, { duration: 8000 })
          return
        }
        
        toast.success("Estudo salvo com sucesso!")
        form.reset()
        onOpenChange(false)
        window.dispatchEvent(new CustomEvent("close-study-session-modal"))
        router.refresh()
      }
    } catch (error: any) {
      console.error("[STUDY_SAVE_CLIENT] Exceção:", error)
      toast.error(error?.message || "Erro ao salvar a sessão.", { duration: 8000 })
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
    if (watchType === 'QUESTOES' || watchType === 'SIMULADO' || watchType === 'VIDEOAULA' || watchType === 'RESUMO') {
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
    if (watchType === 'FLASHCARDS') {
      return (
        <>
          <FormField control={form.control as any} name="flashcards_reviewed" render={({field}) => (
            <FormItem><FormLabel>Flashcards Revisados</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control as any} name="flashcards_correct" render={({field}) => (
            <FormItem><FormLabel>Flashcards Acertados</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
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
    if (watchType === 'TEORIA' || watchType === 'LEITURA' || watchType === 'RESUMO') {
      return (
        <FormField control={form.control as any} name="pages_read" render={({field}) => (
          <FormItem><FormLabel>Páginas Estudadas</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
      )
    }
    if (watchType === 'OUTRO') {
      return (
        <>
          <FormField control={form.control as any} name="pages_read" render={({field}) => (
            <FormItem><FormLabel>Páginas Estudadas</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control as any} name="questions_answered" render={({field}) => (
            <FormItem><FormLabel>Questões Respondidas</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control as any} name="questions_correct" render={({field}) => (
            <FormItem><FormLabel>Acertos</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control as any} name="flashcards_reviewed" render={({field}) => (
            <FormItem><FormLabel>Flashcards Revisados</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control as any} name="flashcards_correct" render={({field}) => (
            <FormItem><FormLabel>Flashcards Acertados</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
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
    return null
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[1000px] w-[95vw] max-h-[90vh] h-[85vh] p-0 flex flex-col overflow-y-auto bg-background border-border z-[150]" overlayOnClick={handleMinimize}>
        {/* Header Simplificado */}
        <div className="flex items-center justify-between p-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            Centro Inteligente de Estudos
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleMinimize} className="w-8 h-8 text-muted-foreground hover:text-foreground" title="Minimizar">
              <Minimize2 className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              onClick={() => {
                console.log("[TOGGLE_BTN] clicked, floatingTimerEnabled:", floatingTimerEnabled);
                toggleFloatingTimer();
              }}
              className={cn(
                "w-8 h-8 rounded-lg transition-all",
                floatingTimerEnabled
                  ? "bg-emerald-500 text-white hover:bg-emerald-600"
                  : "bg-rose-500 text-white hover:bg-rose-600"
              )}
              title={floatingTimerEnabled ? "Desativar balão flutuante" : "Ativar balão flutuante"}
            >
              <ToggleLeft className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleClose} className="w-8 h-8 text-muted-foreground hover:text-foreground" title="Fechar">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit as any, (errors) => {
            const messages = Object.entries(errors).map(([key, err]) => `${key}: ${(err as any)?.message}`).join(", ")
            toast.error(`Campos obrigatórios: ${messages}`)
          })} className="flex flex-col h-full gap-3 p-4 overflow-y-auto">

            <div className="flex flex-col lg:flex-row gap-4 flex-1">
              {/* Timer Left */}
              <div className="lg:w-[280px] flex flex-col shrink-0">
                <div className="rounded-xl border bg-muted/20 p-4 flex flex-col justify-between h-full shadow-sm">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded-md">
                        <Timer className="h-3.5 w-3.5" />
                        {isManualMode ? "Modo Manual" : "Cronômetro"}
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        type="button" 
                        onClick={toggleManualMode} 
                        className="text-[11px] h-7 px-2 text-muted-foreground hover:text-foreground"
                      >
                        {isManualMode ? "← Voltar ao Cronômetro" : "Alternar para Manual"}
                      </Button>
                    </div>

                    {!isManualMode && (
                      <div className="flex justify-center">
                        <FormField control={form.control as any} name="technique" render={({field}) => (
                          <Select onValueChange={(val) => { field.onChange(val); }} value={field.value}>
                            <SelectTrigger className="h-8 text-xs w-full"><SelectValue /></SelectTrigger>
                            <SelectContent className="z-[200]">
                              <SelectItem value="LIVRE">Livre</SelectItem>
                              <SelectItem value="POMODORO_25_5">Pomodoro 25/5</SelectItem>
                              <SelectItem value="POMODORO_50_10">Pomodoro 50/10</SelectItem>
                              <SelectItem value="FLOWTIME">Flowtime</SelectItem>
                              <SelectItem value="DEEP_WORK">Deep Work 90m</SelectItem>
                            </SelectContent>
                          </Select>
                        )} />
                      </div>
                    )}
                  </div>

                  {isManualMode ? (
                    <div className="flex flex-col gap-3 justify-center my-auto bg-card p-3 rounded-xl border">
                      <div className="text-xs font-bold text-foreground mb-1 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-primary inline-block"></span> Lançamento Manual
                      </div>
                      <div>
                        <Label className="text-[10px] font-bold text-muted-foreground uppercase">Tempo Estudado</Label>
                        <div className="grid grid-cols-3 gap-1 mt-1">
                          <FormField control={form.control as any} name="manual_hours" render={({field}) => (
                            <FormItem><FormControl><Input type="number" min={0} max={23} placeholder="0h" className="text-center text-xs h-8 font-mono" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control as any} name="manual_minutes_field" render={({field}) => (
                            <FormItem><FormControl><Input type="number" min={0} max={59} placeholder="0m" className="text-center text-xs h-8 font-mono" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control as any} name="manual_seconds" render={({field}) => (
                            <FormItem><FormControl><Input type="number" min={0} max={59} placeholder="0s" className="text-center text-xs h-8 font-mono" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                          )} />
                        </div>
                      </div>
                      <div>
                        <Label className="text-[10px] font-bold text-muted-foreground uppercase">Data</Label>
                        <FormField control={form.control as any} name="study_date" render={({field}) => (
                          <FormItem><FormControl><Input type="date" className="h-8 text-xs font-mono" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col items-center gap-4 flex-1 justify-center">
                        <div className="text-4xl font-mono font-bold tracking-tight tabular-nums text-primary w-[120px] text-center">
                          {formatTime(activeSeconds)}
                        </div>
                        <div className="flex items-center gap-2">
                          {phase === 'IDLE' || phase === 'PAUSED' ? (
                            <Button size="sm" type="button" onClick={() => {
                              if (phase === 'IDLE') startSession({ disciplineName: form.getValues("discipline_name") || "Estudo", topicName: form.getValues("topic_name"), studyType: form.getValues("studyType"), technique: watchTechnique })
                              else resumeSession()
                            }} className="gap-1.5 w-24 bg-blue-600 hover:bg-blue-700 h-9">
                              <Play className="h-4 w-4" /> {phase === 'PAUSED' ? 'Continuar' : 'Iniciar'}
                            </Button>
                          ) : (
                            <Button size="sm" type="button" variant="secondary" onClick={pauseSession} className="gap-1.5 w-24 h-9">
                              <Pause className="h-4 w-4" /> Pausar
                            </Button>
                          )}
                          <Button variant="outline" size="sm" type="button" onClick={() => { endSession(); form.reset() }} className="gap-1.5 w-24 h-9">
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

              {/* Right: Form */}
              <div className="flex-1 flex flex-col gap-3 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">
                  <FormField control={form.control as any} name="discipline_name" render={({field}) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className="text-xs">Disciplina</FormLabel>
                      <Popover open={disciplinePopoverOpen} onOpenChange={setDisciplinePopoverOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              className={cn(
                                "w-full justify-between font-normal h-9 text-sm relative z-[160]",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value || "Selecionar..."}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent 
                          className="w-[400px] p-0 z-[200] pointer-events-auto" 
                          align="start" 
                          sideOffset={4}
                          onWheel={(e) => e.stopPropagation()}
                        >
                          <Command className="w-full flex flex-col max-h-[300px] overflow-hidden rounded-md border shadow-md" shouldFilter={true}>
                            <CommandInput 
                              placeholder="Digite para buscar ou adicionar..." 
                              value={field.value}
                              onValueChange={(search) => {
                                field.onChange(search);
                                form.setValue("discipline_id", "");
                              }}
                            />
                            <CommandList className="max-h-[300px] overflow-y-auto">
                              <CommandEmpty>Pressione Enter para usar "{field.value}"</CommandEmpty>
                              {planDisciplines.length > 0 && (
                                <CommandGroup heading="Sugestões do Plano">
                                  {planDisciplines.map((disc) => (
                                    <CommandItem
                                      key={`plan-${disc.id}`}
                                      value={disc.name}
                                      onSelect={() => {
                                        handleSelectDiscipline(disc);
                                      }}
                                      className="cursor-pointer"
                                    >
                                      <Check className={cn("mr-2 h-4 w-4", field.value === disc.name ? "opacity-100" : "opacity-0")} />
                                      {disc.name}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )}
                              {otherDisciplines.length > 0 && (
                                <CommandGroup heading="Todas as Disciplinas">
                                  {otherDisciplines.map((disc) => (
                                    <CommandItem
                                      key={`all-${disc.id}`}
                                      value={disc.name}
                                      onSelect={() => {
                                        handleSelectDiscipline(disc);
                                      }}
                                      className="cursor-pointer"
                                    >
                                      <Check className={cn("mr-2 h-4 w-4", field.value === disc.name ? "opacity-100" : "opacity-0")} />
                                      {disc.name}
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
                    <FormItem>
                      <FormLabel className="text-xs">Tópico</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Ex: Direitos Fundamentais" 
                          {...field} 
                          className="relative z-[160]"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="p-3 border rounded-lg bg-card shrink-0">
                  <FormField control={form.control as any} name="studyType" render={({field}) => (
                    <FormItem>
                      <Select onValueChange={(value) => { field.onChange(value); console.log("Tipo selecionado:", value); }} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="font-medium h-9 text-sm relative z-[160]">
                            <SelectValue placeholder="Tipo..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="z-[200] max-h-[200px]">
                          <SelectItem value="TEORIA">📖 Teoria</SelectItem>
                          <SelectItem value="QUESTOES">✍️ Questões</SelectItem>
                          <SelectItem value="REVISAO">🔁 Revisão</SelectItem>
                          <SelectItem value="FLASHCARDS">🎴 Flashcards</SelectItem>
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
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
