"use client"

import { useRouter } from "next/navigation"

import { useState, useEffect, useCallback, useRef } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Timer, Play, Pause, RotateCcw, CheckCircle2, Car, Bot, Square, ChevronsUpDown, Check, BookOpen } from "lucide-react"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"

import { useStudyTimer } from "../hooks/use-study-timer"
import { StudyAIAssistant } from "./study-ai-assistant"
import { DrivingModeView } from "./driving-mode-view"
import { StudyTechnique, StudyType } from "@/domain/study-history/study-history.types"
import { saveStudySessionAction } from "@/application/study-session/study-session.action"
import { getDisciplinesForAutocomplete, type DisciplineOption } from "@/application/study-session/get-disciplines.action"

// --- Zod Schema ---
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
  if (data.questions_answered && data.questions_correct) {
    return data.questions_correct <= data.questions_answered
  }
  return true
}, {
  message: "Acertos não podem ser maiores que as questões",
  path: ["questions_correct"]
}).refine(data => {
  if (data.is_manual_mode) {
    const totalMinutes = (data.manual_hours || 0) * 60 + (data.manual_minutes_field || 0) + (data.manual_seconds || 0) / 60
    return totalMinutes >= 1
  }
  return true
}, {
  message: "Tempo mínimo de 1 minuto",
  path: ["manual_minutes_field"]
})

type SessionFormValues = z.infer<typeof sessionSchema>

interface StudyRegisterModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export function StudyRegisterModal({ open, onOpenChange }: StudyRegisterModalProps) {
  const router = useRouter()
  const [isDrivingMode, setIsDrivingMode] = useState(false)
  const [isAIOpen, setIsAIOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Discipline autocomplete state
  const [disciplinePopoverOpen, setDisciplinePopoverOpen] = useState(false)
  const [planDisciplines, setPlanDisciplines] = useState<DisciplineOption[]>([])
  const [allDisciplines, setAllDisciplines] = useState<DisciplineOption[]>([])
  const [disciplinesLoaded, setDisciplinesLoaded] = useState(false)

  const form = useForm<SessionFormValues>({
    resolver: zodResolver(sessionSchema) as any,
    defaultValues: {
      studyType: "TEORIA",
      technique: "LIVRE",
      discipline_name: "",
      discipline_id: "",
      topic_name: "",
      pages_read: 0,
      questions_answered: 0,
      questions_correct: 0,
      audio_name: "",
      audio_author: "",
      audio_platform: "",
      audio_speed: "1x",
      audio_url: "",
      notes: "",
      is_manual_mode: false,
      manual_hours: 0,
      manual_minutes_field: 0,
      manual_seconds: 0,
      study_date: new Date().toISOString().split("T")[0]
    }
  })

  const watchType = form.watch("studyType")
  const watchTechnique = form.watch("technique") as StudyTechnique
  const watchTopic = form.watch("topic_name")
  const watchDiscipline = form.watch("discipline_name")
  const isManualMode = form.watch("is_manual_mode")

  const {
    phase,
    activeSeconds,
    pausedSeconds,
    techniqueCountdown,
    completedCycles,
    focusPercentage,
    startTimer,
    pauseTimer,
    resetTimer,
  } = useStudyTimer({
    technique: watchTechnique,
  })

  // Carrega as disciplinas quando o modal abre
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
    if (open) {
      loadDisciplines()
    }
  }, [open, loadDisciplines])

  // Sincroniza o timer com o título da aba do navegador
  useEffect(() => {
    if (open && !isManualMode && phase !== 'IDLE') {
      const timeStr = techniqueCountdown !== null ? formatTime(techniqueCountdown) : formatTime(activeSeconds)
      document.title = `⏱ ${timeStr} - Estudando`
    } else {
      document.title = "Home - Mentor Concursos IA"
    }

    return () => {
      document.title = "Home - Mentor Concursos IA"
    }
  }, [open, isManualMode, phase, activeSeconds, techniqueCountdown])

  const handleClose = () => {
    resetTimer()
    setIsDrivingMode(false)
    setIsAIOpen(false)
    form.reset()
    onOpenChange(false)
  }

  const onSubmit = async (data: SessionFormValues) => {
    setIsSubmitting(true)
    try {
      // Calcula minutos totais do modo manual
      const manualTotalMinutes = data.is_manual_mode 
        ? Math.round((data.manual_hours || 0) * 60 + (data.manual_minutes_field || 0) + (data.manual_seconds || 0) / 60)
        : 0

      const payload = {
        ...data,
        activeMinutes: data.is_manual_mode ? manualTotalMinutes : Math.round(activeSeconds / 60),
        pausedMinutes: data.is_manual_mode ? 0 : Math.round(pausedSeconds / 60),
        focusPercentage: data.is_manual_mode ? 100 : focusPercentage,
        completedCycles: data.is_manual_mode ? 0 : completedCycles
      }
      
      console.log("[StudyModal] Enviando payload:", payload)
      const res = await saveStudySessionAction(payload)
      
      if (!res.success) {
        console.error("[StudyModal] Erro do servidor:", res.error)
        toast.error(res.error || "Erro ao salvar a sessão.")
        return
      }
      
      toast.success("Sessão salva com sucesso!")
      handleClose()
      router.refresh()
    } catch (error: any) {
      console.error("[StudyModal] Erro inesperado:", error)
      toast.error(error?.message || "Erro ao salvar a sessão.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleDrivingMode = () => {
    if (!isDrivingMode) {
      form.setValue("studyType", "AUDIO")
    }
    setIsDrivingMode(!isDrivingMode)
  }

  // Filtra disciplinas que NÃO estão no plano (para evitar duplicatas no dropdown)
  const planIds = new Set(planDisciplines.map(d => d.id))
  const otherDisciplines = allDisciplines.filter(d => !planIds.has(d.id))

  // Seleciona uma disciplina do autocomplete
  const handleSelectDiscipline = (disc: DisciplineOption) => {
    form.setValue("discipline_name", disc.name, { shouldValidate: true })
    form.setValue("discipline_id", disc.id)
    setDisciplinePopoverOpen(false)
  }

  // --- Renderização Condicional de Campos ---
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

  // UI PRINCIPAL
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[1000px] w-[95vw] h-[90vh] p-0 flex flex-col md:flex-row overflow-hidden bg-background border-border">
        
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col h-full overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Centro Inteligente de Estudos
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={toggleDrivingMode} className="gap-2 text-blue-600 border-blue-200 hover:bg-blue-50">
                <Car className="w-4 h-4" />
                Modo Dirigindo
              </Button>
              <Button variant={isAIOpen ? "secondary" : "outline"} size="sm" onClick={() => setIsAIOpen(!isAIOpen)} className="gap-2">
                <Bot className="w-4 h-4 text-purple-500" />
                IA
              </Button>
            </div>
          </div>

          {/* Body */}
          {isDrivingMode ? (
            <DrivingModeView 
              phase={phase}
              formattedTime={techniqueCountdown !== null ? formatTime(techniqueCountdown) : formatTime(activeSeconds)}
              onStart={startTimer}
              onPause={pauseTimer}
              onStop={() => {
                pauseTimer()
                setIsDrivingMode(false)
              }}
            />
          ) : (
            <div className="flex flex-col lg:flex-row p-4 gap-6 h-full overflow-hidden">
              
              {/* Esquerda: Timer ou Input Manual */}
              <div className="lg:w-[350px] flex flex-col gap-4 shrink-0 h-full">
                <div className="rounded-xl border bg-muted/20 p-5 relative overflow-hidden flex flex-col justify-between h-full shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                      <Timer className="h-4 w-4 text-primary" />
                      {isManualMode ? "Lançamento Manual" : `Timer: ${phase}`}
                    </div>
                    
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => form.setValue("is_manual_mode", !isManualMode)}
                      className="text-xs h-7"
                    >
                      {isManualMode ? "Usar Cronômetro" : "Lançamento Manual"}
                    </Button>
                  </div>

                  {isManualMode ? (
                    <div className="flex-1 flex flex-col justify-center gap-6">
                      <Form {...form}>
                        <FormField control={form.control as any} name="study_date" render={({field}) => (
                          <FormItem><FormLabel>Data do Estudo</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        
                        {/* Tempo Estudado: Horas / Minutos / Segundos */}
                        <div>
                          <Label className="text-sm font-medium">Tempo Estudado</Label>
                          <div className="grid grid-cols-3 gap-2 mt-1.5">
                            <FormField control={form.control as any} name="manual_hours" render={({field}) => (
                              <FormItem>
                                <FormControl>
                                  <div className="relative">
                                    <Input 
                                      type="number" 
                                      min={0}
                                      max={23}
                                      placeholder="0" 
                                      className="pr-7 text-center"
                                      {...field} 
                                      value={field.value || ""} 
                                    />
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">h</span>
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )} />
                            <FormField control={form.control as any} name="manual_minutes_field" render={({field}) => (
                              <FormItem>
                                <FormControl>
                                  <div className="relative">
                                    <Input 
                                      type="number" 
                                      min={0}
                                      max={59}
                                      placeholder="0" 
                                      className="pr-10 text-center"
                                      {...field} 
                                      value={field.value || ""} 
                                    />
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">min</span>
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )} />
                            <FormField control={form.control as any} name="manual_seconds" render={({field}) => (
                              <FormItem>
                                <FormControl>
                                  <div className="relative">
                                    <Input 
                                      type="number" 
                                      min={0}
                                      max={59}
                                      placeholder="0" 
                                      className="pr-8 text-center"
                                      {...field} 
                                      value={field.value || ""} 
                                    />
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">seg</span>
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )} />
                          </div>
                        </div>
                      </Form>
                      <div className="text-center text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg mt-4">
                        Ao lançar manualmente, o percentual de foco é definido automaticamente como 100%.
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-end mb-6">
                        <FormField control={form.control as any} name="technique" render={({field}) => (
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue /></SelectTrigger>
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

                      <div className="flex flex-col items-center gap-6 flex-1 justify-center">
                        <div className="text-6xl font-mono font-bold tracking-tight tabular-nums text-primary drop-shadow-sm">
                          {techniqueCountdown !== null ? formatTime(techniqueCountdown) : formatTime(activeSeconds)}
                        </div>

                        <div className="flex items-center gap-3">
                          {phase === 'IDLE' || phase === 'PAUSED' ? (
                            <Button size="lg" onClick={startTimer} className="gap-2 w-32 bg-blue-600 hover:bg-blue-700">
                              <Play className="h-5 w-5" /> Iniciar
                            </Button>
                          ) : (
                            <Button size="lg" variant="secondary" onClick={pauseTimer} className="gap-2 w-32">
                              <Pause className="h-5 w-5" /> Pausar
                            </Button>
                          )}
                          
                          <Button variant="outline" size="lg" onClick={resetTimer} className="gap-2 w-32">
                            <RotateCcw className="h-4 w-4" /> Resetar
                          </Button>
                        </div>
                      </div>

                      <div className="flex gap-8 text-sm text-center w-full justify-center pt-6 border-t mt-auto">
                        <div>
                          <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">Ativo</p>
                          <p className="font-semibold text-green-600 font-mono">{formatTime(activeSeconds)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">Pausa</p>
                          <p className="font-semibold text-amber-600 font-mono">{formatTime(pausedSeconds)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">Foco</p>
                          <p className="font-semibold text-blue-600 font-mono">{focusPercentage}%</p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Direita: Formulário Metadados */}
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit as any, (errors) => {
                  console.error("[StudyModal] Erros de validação:", errors)
                  const messages = Object.entries(errors).map(([key, err]) => `${key}: ${(err as any)?.message}`).join(", ")
                  toast.error(`Campos obrigatórios: ${messages}`)
                })} className="flex flex-col h-full gap-4">
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
                    {/* Discipline Combobox com Autocomplete */}
                    <FormField control={form.control as any} name="discipline_name" render={({field}) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Disciplina</FormLabel>
                        <Popover open={disciplinePopoverOpen} onOpenChange={setDisciplinePopoverOpen}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={disciplinePopoverOpen}
                                className={cn(
                                  "w-full justify-between font-normal h-9",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value || "Selecione a disciplina..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent 
                            className="w-[--radix-popover-trigger-width] p-0 max-h-[300px] overflow-hidden flex flex-col" 
                            align="start"
                            onWheel={(e) => e.stopPropagation()}
                            onTouchMove={(e) => e.stopPropagation()}
                          >
                            <Command className="w-full h-full flex flex-col">
                              <CommandInput 
                                placeholder="Buscar disciplina..." 
                                onValueChange={(search) => {
                                  if (search) {
                                    form.setValue("discipline_name", search, { shouldValidate: true })
                                    form.setValue("discipline_id", "")
                                  }
                                }}
                              />
                              <CommandList className="max-h-[250px] overflow-y-auto pointer-events-auto shrink-0 touch-pan-y">
                                <CommandEmpty>
                                  <div className="flex flex-col items-center gap-1 py-2">
                                    <p className="text-sm">Nenhuma disciplina encontrada.</p>
                                    {field.value && (
                                      <p className="text-xs text-muted-foreground">
                                        &quot;{field.value}&quot; será cadastrada automaticamente.
                                      </p>
                                    )}
                                  </div>
                                </CommandEmpty>
                                
                                {/* Disciplinas do Plano de Estudos */}
                                {planDisciplines.length > 0 && (
                                  <CommandGroup heading="📚 Matérias do seu Plano">
                                    {planDisciplines.map((disc) => (
                                      <CommandItem
                                        key={`plan-${disc.id}`}
                                        value={disc.name}
                                        onSelect={() => handleSelectDiscipline(disc)}
                                        className="cursor-pointer"
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            field.value === disc.name ? "opacity-100" : "opacity-0"
                                          )}
                                        />
                                        <div className="flex flex-col">
                                          <span className="font-medium">{disc.name}</span>
                                          {disc.area && (
                                            <span className="text-[10px] text-muted-foreground">{disc.area}</span>
                                          )}
                                        </div>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                )}
                                
                                {/* Todas as outras disciplinas */}
                                {otherDisciplines.length > 0 && (
                                  <CommandGroup heading="📖 Todas as Disciplinas">
                                    {otherDisciplines.map((disc) => (
                                      <CommandItem
                                        key={`all-${disc.id}`}
                                        value={disc.name}
                                        onSelect={() => handleSelectDiscipline(disc)}
                                        className="cursor-pointer"
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            field.value === disc.name ? "opacity-100" : "opacity-0"
                                          )}
                                        />
                                        <div className="flex flex-col">
                                          <span>{disc.name}</span>
                                          {disc.area && (
                                            <span className="text-[10px] text-muted-foreground">{disc.area}</span>
                                          )}
                                        </div>
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
                      <FormItem><FormLabel>Tópico</FormLabel><FormControl><Input placeholder="Ex: Direitos e Garantias Fundamentais" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>

                  <div className="p-4 border rounded-lg bg-card shrink-0 shadow-sm">
                    <h3 className="font-semibold text-[10px] text-muted-foreground mb-3 uppercase tracking-wider">Metadados do Estudo</h3>
                    
                    <div className="flex flex-col gap-3">
                      <FormField control={form.control as any} name="studyType" render={({field}) => (
                        <FormItem>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <SelectTrigger className="font-medium"><SelectValue placeholder="Selecione o tipo..." /></SelectTrigger>
                            <SelectContent className="max-h-[250px]">
                              <SelectItem value="TEORIA">📖 Teoria</SelectItem>
                              <SelectItem value="QUESTOES">✍️ Questões</SelectItem>
                              <SelectItem value="REVISAO">🔁 Revisão</SelectItem>
                              <SelectItem value="MAPA_MENTAL">🧠 Mapa Mental</SelectItem>
                              <SelectItem value="AUDIO">🎧 Áudio / Podcast</SelectItem>
                              <SelectItem value="VIDEOAULA">🎥 Videoaula</SelectItem>
                              <SelectItem value="FLASHCARDS">🃏 Flashcards</SelectItem>
                              <SelectItem value="LEI_SECA">📄 Lei Seca</SelectItem>
                              <SelectItem value="JURISPRUDENCIA">⚖️ Jurisprudência</SelectItem>
                              <SelectItem value="SIMULADO">🧪 Simulado</SelectItem>
                              <SelectItem value="ESTUDO_IA">🤖 Estudo com IA</SelectItem>
                              <SelectItem value="OUTRO">⭐ Outro</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />

                      {renderDynamicFields() && (
                        <div className="grid grid-cols-2 gap-3 pt-2">
                          {renderDynamicFields()}
                        </div>
                      )}
                    </div>
                  </div>

                  <FormField control={form.control as any} name="notes" render={({field}) => (
                    <FormItem className="flex-1 flex flex-col min-h-[100px]">
                      <FormLabel className="shrink-0 flex justify-between items-center">
                        <span>Anotações (Markdown Suportado)</span>
                      </FormLabel>
                      <FormControl className="flex-1">
                        <Textarea 
                          placeholder="Digite seus resumos, conceitos difíceis ou links úteis aqui..." 
                          className="h-full resize-none font-mono text-sm bg-muted/10" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="flex gap-3 justify-end pt-3 shrink-0">
                    <Button type="button" variant="ghost" onClick={handleClose}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={isSubmitting} className="gap-2 bg-primary w-[200px]">
                      <Square className="h-4 w-4 fill-current" />
                      {isSubmitting ? "Salvando..." : "Finalizar & Salvar"}
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          </div>
          )}
        </div>

        {/* AI Assistant Drawer */}
        {isAIOpen && !isDrivingMode && (
          <StudyAIAssistant topicName={watchTopic} disciplineName={watchDiscipline} />
        )}
      </DialogContent>
    </Dialog>
  )
}

