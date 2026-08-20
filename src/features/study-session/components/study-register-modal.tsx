"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { type Resolver, useForm, useWatch } from "react-hook-form"

import { useRouter } from "next/navigation"

import { zodResolver } from "@hookform/resolvers/zod"
import * as Sentry from "@sentry/nextjs"
import {
  Calendar,
  Check,
  CheckCircle2,
  ChevronsUpDown,
  Clock,
  FileText,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import { updateStudySessionAction } from "@/application/study-history/study-history.actions"
import {
  type DisciplineOption,
  getDisciplinesForAutocomplete,
} from "@/application/study-session/get-disciplines.action"
import { saveStudySessionAction } from "@/application/study-session/study-session.action"
import { createCustomTopicAction } from "@/application/topic-catalog/topic-catalog.actions"
import {
  buildIsoFromSaoPauloDateTime,
  currentTimeInSaoPaulo,
  getDayInSaoPaulo,
  getTimeInSaoPaulo,
  todayKeyInSaoPaulo,
} from "@/lib/sao-paulo"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { disciplineColorHex } from "@/domain/disciplines/discipline-colors"
import type { StudyHistory, StudyTechnique } from "@/domain/study-history/study-history.types"
import {
  type SavedStudySession,
  dispatchStudySessionSaved,
} from "@/features/study-session/lib/study-session-events"
import { TopicAutocomplete } from "@/features/topic-catalog/components/topic-autocomplete"
import { cn } from "@/lib/utils"

import { FocusSoundControl } from "./focus-sound-control"
import { useGlobalStudy } from "./study-provider"

const sessionSchema = z
  .object({
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
    manual_hours: z.coerce.number().min(0).max(23).optional(),
    manual_minutes_field: z.coerce.number().min(0).max(59).optional(),
    manual_seconds: z.coerce.number().min(0).max(59).optional(),
    study_date: z.string().optional(),
    study_time: z.string().optional(),
    duration_minutes: z.coerce.number().min(1).optional(),
  })
  .refine(
    (data) => {
      if (data.questions_answered && data.questions_correct)
        return data.questions_correct <= data.questions_answered
      return true
    },
    { message: "Acertos não podem ser maiores que as questões", path: ["questions_correct"] },
  )
  .refine(
    (data) => {
      if (data.flashcards_reviewed && data.flashcards_correct)
        return data.flashcards_correct <= data.flashcards_reviewed
      return true
    },
    { message: "Acertos não podem ser maiores que os revisados", path: ["flashcards_correct"] },
  )
  .refine(
    (data) => {
      if (data.is_manual_mode) {
        const totalSec =
          (data.manual_hours || 0) * 3600 +
          (data.manual_minutes_field || 0) * 60 +
          (data.manual_seconds || 0)
        return totalSec > 0
      }
      return true
    },
    {
      message: "Duração deve ser maior que zero",
      path: ["manual_minutes_field"],
    },
  )

export type SessionFormValues = z.infer<typeof sessionSchema>

interface StudyRegisterModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionToEdit?: SavedStudySession | null
  mode?: "create" | "edit"
}

function formatClock(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

function formatDateBR(dateStr?: string) {
  if (!dateStr) return ""
  try {
    const [y, m, d] = dateStr.split("-")
    if (y && m && d) return `${d}/${m}/${y}`
    return dateStr
  } catch {
    return dateStr
  }
}

const STUDY_TYPE_LABELS: Record<string, string> = {
  TEORIA: "Teoria",
  QUESTOES: "Questões",
  REVISAO: "Revisão",
  FLASHCARDS: "Flashcards",
  AUDIO: "Áudio / Podcast",
  VIDEOAULA: "Videoaula",
  SIMULADO: "Simulado",
  OUTRO: "Outro",
}

export function StudyRegisterModal({
  open,
  onOpenChange,
  sessionToEdit,
  mode = "create",
}: StudyRegisterModalProps) {
  const router = useRouter()
  const isEditMode = mode === "edit" && !!sessionToEdit
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [disciplinePopoverOpen, setDisciplinePopoverOpen] = useState(false)
  const [hasActivePlan, setHasActivePlan] = useState<boolean | null>(null)
  const [planDisciplines, setPlanDisciplines] = useState<DisciplineOption[]>([])
  const [allDisciplines, setAllDisciplines] = useState<DisciplineOption[]>([])

  const form = useForm<SessionFormValues>({
    resolver: zodResolver(sessionSchema) as Resolver<SessionFormValues>,
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
      study_date: todayKeyInSaoPaulo(),
      study_time: currentTimeInSaoPaulo(),
    },
  })

  const watchType = useWatch({ control: form.control, name: "studyType" })
  const watchTechnique = useWatch({ control: form.control, name: "technique" }) as StudyTechnique
  const isManualMode = useWatch({ control: form.control, name: "is_manual_mode" })
  const watchDisciplineId = useWatch({ control: form.control, name: "discipline_id" })
  const watchDisciplineName = useWatch({ control: form.control, name: "discipline_name" })
  const watchManualHours = useWatch({ control: form.control, name: "manual_hours" }) || 0
  const watchManualMinutes = useWatch({ control: form.control, name: "manual_minutes_field" }) || 0
  const watchStudyDate = useWatch({ control: form.control, name: "study_date" })
  const watchStudyTime = useWatch({ control: form.control, name: "study_time" })

  // Pre-fill form when entering edit mode
  useEffect(() => {
    if (isEditMode && sessionToEdit && open) {
      const metadata = sessionToEdit.metadata || {}
      form.reset({
        studyType: sessionToEdit.study_type ?? "TEORIA",
        technique: sessionToEdit.technique ?? "LIVRE",
        discipline_name: sessionToEdit.disciplines?.name ?? "",
        discipline_id: sessionToEdit.discipline_id,
        topic_name: typeof metadata["topic_name"] === "string" ? metadata["topic_name"] : "",
        pages_read: Number(metadata["pages_read"]) || 0,
        questions_answered: Number(metadata["questions_answered"]) || 0,
        questions_correct: Number(metadata["questions_correct"]) || 0,
        audio_name: typeof metadata["audio_name"] === "string" ? metadata["audio_name"] : "",
        audio_author: typeof metadata["audio_author"] === "string" ? metadata["audio_author"] : "",
        audio_platform:
          typeof metadata["audio_platform"] === "string" ? metadata["audio_platform"] : "",
        audio_speed: typeof metadata["audio_speed"] === "string" ? metadata["audio_speed"] : "1x",
        audio_url: typeof metadata["audio_url"] === "string" ? metadata["audio_url"] : "",
        flashcards_reviewed: Number(metadata["flashcards_reviewed"]) || 0,
        flashcards_correct: Number(metadata["flashcards_correct"]) || 0,
        notes: sessionToEdit.notes || "",
        is_manual_mode: true,
        manual_hours: Math.floor((sessionToEdit.duration_minutes || 0) / 60),
        manual_minutes_field: (sessionToEdit.duration_minutes || 0) % 60,
        manual_seconds: 0,
        study_date: sessionToEdit.started_at
          ? getDayInSaoPaulo(sessionToEdit.started_at)
          : todayKeyInSaoPaulo(),
        study_time: sessionToEdit.started_at
          ? getTimeInSaoPaulo(sessionToEdit.started_at)
          : currentTimeInSaoPaulo(),
      })
    } else if (open && !isEditMode) {
      form.reset({
        studyType: "TEORIA",
        technique: "LIVRE",
        discipline_name: "",
        discipline_id: "",
        topic_name: "",
        pages_read: 0,
        questions_answered: 0,
        questions_correct: 0,
        flashcards_reviewed: 0,
        flashcards_correct: 0,
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
        study_date: todayKeyInSaoPaulo(),
        study_time: currentTimeInSaoPaulo(),
      })
    }
  }, [form, open, isEditMode, sessionToEdit])

  const {
    session,
    startSession,
    pauseSession,
    resumeSession,
    endSession,
    resetSession,
    minimizeSession,
    toggleFloatingTimer,
    floatingTimerEnabled,
    finalizeAndSaveSession,
    focusSound: focusSoundId,
    focusSoundVolume,
    focusSoundIsPlaying,
    selectFocusSound,
    changeFocusSoundVolume,
  } = useGlobalStudy()

  const phase = session?.phase ?? "IDLE"
  const activeSeconds = session?.activeSeconds ?? 0
  const pausedSeconds = session?.pausedSeconds ?? 0
  const focusPercentage =
    activeSeconds + pausedSeconds > 0
      ? Math.round((activeSeconds / (activeSeconds + pausedSeconds)) * 100)
      : null

  const loadDisciplines = useCallback(async () => {
    try {
      const result = await getDisciplinesForAutocomplete()
      setPlanDisciplines(result.planDisciplines)
      setAllDisciplines(result.allDisciplines)
      setHasActivePlan(result.hasActivePlan)
    } catch (err) {
      console.error("Erro ao carregar disciplinas:", err)
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { feature: "discipline-selector" },
      })
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const timeoutId = window.setTimeout(() => {
      void loadDisciplines()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [loadDisciplines, open])

  const handleMinimize = () => {
    minimizeSession()
    onOpenChange(false)
    window.dispatchEvent(new CustomEvent("close-study-session-modal"))
  }

  const handleClose = () => {
    if (phase !== "IDLE") {
      // Timer ativo/pausado: minimizar para a barra flutuante continuar visível
      handleMinimize()
      return
    }
    endSession()
    form.reset()
    onOpenChange(false)
    window.dispatchEvent(new CustomEvent("close-study-session-modal"))
  }

  const setMode = (manual: boolean) => {
    if (manual === isManualMode) return
    form.setValue("is_manual_mode", manual, { shouldDirty: true, shouldValidate: true })
  }

  const onSubmit = async (data: SessionFormValues) => {
    setIsSubmitting(true)
    try {
      if (isEditMode && sessionToEdit) {
        // Modo EDIÇÃO: atualizar sessão existente
        const metadata: Record<string, unknown> = {
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

        const updatePayload: Record<string, unknown> = {
          discipline_id: data.discipline_id || sessionToEdit.discipline_id,
          study_type: data.studyType,
          technique: data.technique,
          notes: data.notes || null,
          metadata,
        }

        const totalMinutes =
          (Number(data.manual_hours) || 0) * 60 +
          (Number(data.manual_minutes_field) || 0) +
          Math.round((Number(data.manual_seconds) || 0) / 60)

        updatePayload["duration_minutes"] = totalMinutes
        updatePayload["active_minutes"] = totalMinutes
        updatePayload["paused_minutes"] = 0

        if (data.study_date) {
          const startedAt = buildIsoFromSaoPauloDateTime(data.study_date, data.study_time)
          updatePayload["started_at"] = startedAt
          updatePayload["finished_at"] = new Date(
            new Date(startedAt).getTime() + totalMinutes * 60 * 1000,
          ).toISOString()
        } else if (sessionToEdit.started_at) {
          updatePayload["finished_at"] = new Date(
            new Date(sessionToEdit.started_at).getTime() + totalMinutes * 60 * 1000,
          ).toISOString()
        }

        if (sessionToEdit.metadata?.["focus_percentage"] !== undefined) {
          updatePayload["metadata"] = {
            ...metadata,
            focus_percentage: sessionToEdit.metadata["focus_percentage"],
          }
        }

        const res = await updateStudySessionAction(sessionToEdit.id, updatePayload)

        if (res.error) {
          toast.error("Erro ao atualizar: " + res.error)
          return
        }

        toast.success("Sessão atualizada com sucesso!")
        registerTopicInCatalog(data.topic_name, data.discipline_id)
        if (res.data) {
          dispatchStudySessionSaved(res.data as SavedStudySession)
        }
        form.reset()
        onOpenChange(false)
        window.dispatchEvent(new CustomEvent("close-study-session-modal"))
        router.refresh()
      } else {
        // Modo CRIAÇÃO
        if (!data.discipline_id || !data.discipline_name) {
          toast.error("Selecione uma disciplina existente na lista antes de salvar.")
          return
        }

        if (session && session.isActive) {
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

          if (!res || !res.success) {
            const errMsg = res?.error || "Erro desconhecido ao salvar a sessão."
            console.error("[STUDY_SAVE_CLIENT] Falha ao salvar:", errMsg, res)
            toast.error(errMsg, { duration: 8000 })
            return
          }

          if (res.session) {
            dispatchStudySessionSaved(res.session as SavedStudySession)
          }
        } else {
          // Modo manual: salvar diretamente sem cronômetro ativo
          const manualTotalMinutes =
            (Number(data.manual_hours) || 0) * 60 +
            (Number(data.manual_minutes_field) || 0) +
            Math.round((Number(data.manual_seconds) || 0) / 60)

          const directPayload = {
            is_manual_mode: true,
            discipline_id: data.discipline_id,
            discipline_name: data.discipline_name,
            topic_name: data.topic_name,
            studyType: data.studyType,
            technique: data.technique,
            notes: data.notes,
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
            activeMinutes: manualTotalMinutes,
            pausedMinutes: 0,
            focusPercentage: null,
            completedCycles: 0,
            study_date: data.study_date,
            study_time: data.study_time,
          }

          const res = await saveStudySessionAction(directPayload)

          if (!res || !res.success) {
            const errMsg = res?.error || "Erro desconhecido ao salvar a sessão."
            console.error("[STUDY_SAVE_CLIENT] Falha ao salvar direto:", errMsg, res)
            toast.error(errMsg, { duration: 8000 })
            return
          }

          if (res.session) {
            dispatchStudySessionSaved(res.session as SavedStudySession)
          }
        }

        toast.success("Estudo salvo com sucesso!")
        registerTopicInCatalog(data.topic_name, data.discipline_id)
        form.reset()
        onOpenChange(false)
        window.dispatchEvent(new CustomEvent("close-study-session-modal"))
        router.refresh()
      }
    } catch (error: unknown) {
      console.error("[STUDY_SAVE_CLIENT] Exceção:", error)
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { feature: "study-session" },
      })
      toast.error(error instanceof Error ? error.message : "Erro ao salvar a sessão.", {
        duration: 8000,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const planIds = useMemo(() => new Set(planDisciplines.map((d) => d.id)), [planDisciplines])
  const otherDisciplines = useMemo(
    () => allDisciplines.filter((d) => !planIds.has(d.id)),
    [allDisciplines, planIds],
  )

  const selectedDiscipline = useMemo(() => {
    if (!watchDisciplineId) return null
    return (
      allDisciplines.find((d) => d.id === watchDisciplineId) ||
      planDisciplines.find((d) => d.id === watchDisciplineId) ||
      null
    )
  }, [allDisciplines, planDisciplines, watchDisciplineId])

  const selectedColor = useMemo(() => {
    if (!watchDisciplineId) return "#2563EB"
    return disciplineColorHex(watchDisciplineId, selectedDiscipline?.color_hex)
  }, [selectedDiscipline, watchDisciplineId])

  const handleSelectDiscipline = (disc: DisciplineOption) => {
    form.setValue("discipline_name", disc.name, { shouldValidate: true })
    form.setValue("discipline_id", disc.id)
    setDisciplinePopoverOpen(false)
  }

  const registerTopicInCatalog = (
    topicName: string | undefined,
    disciplineId: string | undefined,
  ) => {
    if (!topicName?.trim() || !disciplineId) return
    void createCustomTopicAction(disciplineId, topicName)
  }

  // Resumo dos minutos manuais
  const manualTotalMinutes = useMemo(() => {
    return Number(watchManualHours) * 60 + Number(watchManualMinutes)
  }, [watchManualHours, watchManualMinutes])

  const renderDynamicFields = () => {
    if (
      watchType === "TEORIA" ||
      watchType === "REVISAO" ||
      watchType === "LEITURA" ||
      watchType === "RESUMO"
    ) {
      return (
        <div className="grid grid-cols-3 gap-2">
          <FormField
            control={form.control}
            name="pages_read"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs text-muted-foreground font-medium truncate block" title="Páginas Estudadas">
                  Páginas
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    className="h-8 text-xs font-mono"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="questions_answered"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs text-muted-foreground font-medium truncate block" title="Questões Respondidas">
                  Questões
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    className="h-8 text-xs font-mono"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="questions_correct"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs text-muted-foreground font-medium truncate block" title="Acertos">
                  Acertos
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    className="h-8 text-xs font-mono"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )
    }
    if (
      watchType === "QUESTOES" ||
      watchType === "SIMULADO" ||
      watchType === "VIDEOAULA" ||
      watchType === "OUTRO"
    ) {
      return (
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="questions_answered"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs text-muted-foreground font-medium">
                  Questões Respondidas
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    className="h-8 text-xs font-mono"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="questions_correct"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs text-muted-foreground font-medium">Acertos</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    className="h-8 text-xs font-mono"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )
    }
    if (watchType === "FLASHCARDS") {
      return (
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="flashcards_reviewed"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs text-muted-foreground font-medium">
                  Flashcards Revisados
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    className="h-8 text-xs font-mono"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="flashcards_correct"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs text-muted-foreground font-medium">Acertos</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    className="h-8 text-xs font-mono"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )
    }
    if (watchType === "AUDIO") {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <FormField
            control={form.control}
            name="audio_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs text-muted-foreground font-medium">
                  Nome do Áudio/Podcast
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="Ex: Aula 03 - Direito Penal"
                    className="h-8 text-xs"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="audio_author"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs text-muted-foreground font-medium">
                  Autor / Professor
                </FormLabel>
                <FormControl>
                  <Input placeholder="Ex: Prof. Silva" className="h-8 text-xs" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="audio_platform"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs text-muted-foreground font-medium">
                  Plataforma (ex: Spotify)
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="Spotify, Gran, YouTube..."
                    className="h-8 text-xs"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="audio_url"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs text-muted-foreground font-medium">
                  Link (Opcional)
                </FormLabel>
                <FormControl>
                  <Input type="url" placeholder="https://..." className="h-8 text-xs" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )
    }
    return null
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-[1020px] w-[96vw] max-h-[92vh] md:h-[86vh] p-0 flex flex-col overflow-hidden bg-background border-border/80 shadow-2xl rounded-2xl z-[150]"
        overlayOnClick={handleMinimize}
      >
        <TooltipProvider delayDuration={200}>
          {/* ═══════════════════════════════════════════════════════════════
              HEADER REFINADO
              ═══════════════════════════════════════════════════════════════ */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/60 bg-muted/20 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex flex-col min-w-0">
                <DialogTitle className="text-sm sm:text-base font-bold tracking-tight text-foreground truncate">
                  Centro Inteligente de Estudos
                </DialogTitle>
                <p className="text-[11px] text-muted-foreground truncate hidden sm:block">
                  Registre, acompanhe e analise cada sessão de estudo.
                </p>
              </div>
            </div>

            {/* Ações do Header */}
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleMinimize}
                    className="w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground"
                    aria-label="Minimizar Central"
                  >
                    <Minimize2 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Minimizar</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleFloatingTimer}
                    className={cn(
                      "w-8 h-8 rounded-lg transition-colors",
                      floatingTimerEnabled
                        ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    aria-label={
                      floatingTimerEnabled ? "Desativar balão flutuante" : "Ativar balão flutuante"
                    }
                  >
                    {floatingTimerEnabled ? (
                      <ToggleRight className="w-4 h-4" />
                    ) : (
                      <ToggleLeft className="w-4 h-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {floatingTimerEnabled ? "Balão flutuante ativado" : "Ativar balão flutuante"}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClose}
                    className="w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-rose-500/10 hover:text-rose-600"
                    aria-label="Fechar"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Fechar</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              BODY (FORMULÁRIO PRINCIPAL)
              ═══════════════════════════════════════════════════════════════ */}
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit, (errors) => {
                const messages = Object.entries(errors)
                  .map(([key, err]) => `${key}: ${(err as { message?: string })?.message}`)
                  .join(", ")
                toast.error(`Verifique os campos obrigatórios: ${messages}`)
              })}
              className="flex flex-col flex-1 overflow-hidden"
            >
              <div className="flex flex-col md:flex-row flex-1 overflow-y-auto p-4 sm:p-5 gap-4 lg:gap-5">
                {/* ═══════════════════════════════════════════════════════════════
                    COLUNA ESQUERDA — CENTRAL DE CONTROLE (320px - 340px)
                    ═══════════════════════════════════════════════════════════════ */}
                <div className="w-full md:w-[320px] lg:w-[340px] shrink-0 flex flex-col gap-3">
                  {/* Segmented Mode Switcher */}
                  <div className="p-1 rounded-xl bg-muted/60 border border-border/50 grid grid-cols-2 gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setMode(false)}
                      className={cn(
                        "flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all select-none",
                        !isManualMode
                          ? "bg-background text-foreground shadow-sm border border-border/40 font-bold"
                          : "text-muted-foreground hover:text-foreground hover:bg-background/40",
                      )}
                    >
                      <Clock className="w-3.5 h-3.5 text-primary" />
                      <span>Cronômetro</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode(true)}
                      className={cn(
                        "flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all select-none",
                        isManualMode
                          ? "bg-background text-foreground shadow-sm border border-border/40 font-bold"
                          : "text-muted-foreground hover:text-foreground hover:bg-background/40",
                      )}
                    >
                      <FileText className="w-3.5 h-3.5 text-primary" />
                      <span>Manual</span>
                    </button>
                  </div>

                  {/* Card da Central de Controle */}
                  <div className="rounded-2xl border border-border/70 bg-card p-4 flex flex-col justify-between flex-1 shadow-sm gap-4">
                    {/* Topo do Card: Status Pill & Disciplina */}
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        {!isManualMode ? (
                          (() => {
                            let badgeColor = "bg-muted text-muted-foreground border-border/40"
                            let dotColor = "bg-muted-foreground/60"
                            let label = "Pronto para estudar"

                            if (phase === "STUDYING") {
                              badgeColor =
                                "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                              dotColor = "bg-emerald-500 animate-pulse"
                              label = "Estudando"
                            } else if (phase === "PAUSED") {
                              badgeColor =
                                "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                              dotColor = "bg-amber-500"
                              label = "Pausado"
                            }

                            return (
                              <span
                                className={cn(
                                  "text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1.5 border",
                                  badgeColor,
                                )}
                              >
                                <span className={cn("w-1.5 h-1.5 rounded-full", dotColor)} />
                                {label}
                              </span>
                            )
                          })()
                        ) : (
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                            Lançamento Manual
                          </span>
                        )}

                        <span className="text-[10px] uppercase font-bold text-muted-foreground/80 tracking-wider">
                          Central
                        </span>
                      </div>

                      {/* Disciplina Selecionada Badge */}
                      {watchDisciplineName && (
                        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-muted/30 border border-border/40 min-h-[32px]">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                            style={{ backgroundColor: selectedColor }}
                          />
                          <span className="text-xs font-semibold text-foreground truncate">
                            {watchDisciplineName}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Meio do Card: Display do Tempo / Inputs Manuais */}
                    {!isManualMode ? (
                      /* ─── CRONÔMETRO DISPLAY ─── */
                      <div className="flex flex-col items-center justify-center my-auto py-2 gap-3">
                        <div className="text-4xl sm:text-5xl font-mono font-black tracking-tight tabular-nums text-foreground select-none">
                          {formatClock(activeSeconds)}
                        </div>
                        <span className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground">
                          {phase === "PAUSED" ? "Tempo congelado" : "Tempo ativo"}
                        </span>

                        {/* Controles do Cronômetro */}
                        <div className="flex items-center gap-2 w-full pt-1">
                          {phase === "IDLE" || phase === "PAUSED" ? (
                            <Button
                              size="sm"
                              type="button"
                              onClick={() => {
                                if (phase === "IDLE") {
                                  const discId = form.getValues("discipline_id")
                                  const discName = form.getValues("discipline_name")
                                  if (!discId || !discName) {
                                    toast.error(
                                      "Selecione uma disciplina existente na lista antes de iniciar.",
                                    )
                                    return
                                  }
                                  startSession({
                                    disciplineName: discName,
                                    disciplineId: discId,
                                    topicName: form.getValues("topic_name"),
                                    studyType: form.getValues("studyType"),
                                    technique: watchTechnique,
                                  })
                                } else {
                                  resumeSession()
                                }
                              }}
                              className="flex-1 gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold h-10 rounded-xl shadow-sm"
                            >
                              <Play className="h-4 w-4 fill-current" />
                              <span>{phase === "PAUSED" ? "Retomar" : "Iniciar"}</span>
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              type="button"
                              onClick={pauseSession}
                              className="flex-1 gap-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold h-10 rounded-xl shadow-sm"
                            >
                              <Pause className="h-4 w-4 fill-current" />
                              <span>Pausar</span>
                            </Button>
                          )}

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="icon"
                                type="button"
                                onClick={resetSession}
                                className="h-10 w-10 rounded-xl border-border/70 text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 hover:border-rose-500/30 shrink-0"
                                aria-label="Resetar cronômetro"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">Zerar cronômetro</TooltipContent>
                          </Tooltip>
                        </div>

                        {/* Técnica & Som de Foco Compactos */}
                        <div className="w-full flex flex-col gap-2 pt-2 border-t border-border/40">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground">
                              Técnica
                            </span>
                            <FormField
                              control={form.control}
                              name="technique"
                              render={({ field }) => (
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <SelectTrigger className="h-7 text-[11px] w-[130px] rounded-lg">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="z-[200]">
                                    <SelectItem value="LIVRE">Livre</SelectItem>
                                    <SelectItem value="POMODORO_25_5">Pomodoro 25/5</SelectItem>
                                    <SelectItem value="POMODORO_50_10">Pomodoro 50/10</SelectItem>
                                    <SelectItem value="FLOWTIME">Flowtime</SelectItem>
                                    <SelectItem value="DEEP_WORK">Deep Work 90m</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </div>

                          <FocusSoundControl
                            selectedSound={focusSoundId}
                            volume={focusSoundVolume}
                            isPlaying={focusSoundIsPlaying}
                            onSelectSound={selectFocusSound}
                            onVolumeChange={changeFocusSoundVolume}
                          />
                        </div>
                      </div>
                    ) : (
                      /* ─── MANUAL INPUTS DISPLAY ─── */
                      <div className="flex flex-col gap-3 my-auto py-1">
                        <div>
                          <Label className="text-[11px] font-bold uppercase text-muted-foreground tracking-wider mb-1.5 block">
                            Duração Estudada
                          </Label>
                          {/* Segmented Digital Input */}
                          <div className="grid grid-cols-3 gap-2">
                            <FormField
                              control={form.control}
                              name="manual_hours"
                              render={({ field }) => (
                                <FormItem className="space-y-0">
                                  <FormControl>
                                    <div className="flex flex-col items-center bg-muted/30 border border-border/60 rounded-xl p-1.5 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary">
                                      <Input
                                        type="number"
                                        min={0}
                                        max={23}
                                        placeholder="0"
                                        className="text-center font-mono font-bold text-lg h-7 border-0 p-0 shadow-none bg-transparent focus-visible:ring-0"
                                        {...field}
                                        value={field.value ?? 0}
                                      />
                                      <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">
                                        Horas
                                      </span>
                                    </div>
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="manual_minutes_field"
                              render={({ field }) => (
                                <FormItem className="space-y-0">
                                  <FormControl>
                                    <div className="flex flex-col items-center bg-muted/30 border border-border/60 rounded-xl p-1.5 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary">
                                      <Input
                                        type="number"
                                        min={0}
                                        max={59}
                                        placeholder="30"
                                        className="text-center font-mono font-bold text-lg h-7 border-0 p-0 shadow-none bg-transparent focus-visible:ring-0"
                                        {...field}
                                        value={field.value ?? 0}
                                      />
                                      <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">
                                        Minutos
                                      </span>
                                    </div>
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="manual_seconds"
                              render={({ field }) => (
                                <FormItem className="space-y-0">
                                  <FormControl>
                                    <div className="flex flex-col items-center bg-muted/30 border border-border/60 rounded-xl p-1.5 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary">
                                      <Input
                                        type="number"
                                        min={0}
                                        max={59}
                                        placeholder="0"
                                        className="text-center font-mono font-bold text-lg h-7 border-0 p-0 shadow-none bg-transparent focus-visible:ring-0"
                                        {...field}
                                        value={field.value ?? 0}
                                      />
                                      <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">
                                        Segundos
                                      </span>
                                    </div>
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <Label className="text-[11px] font-bold uppercase text-muted-foreground tracking-wider mb-1.5 block">
                              Data do Estudo
                            </Label>
                            <FormField
                              control={form.control}
                              name="study_date"
                              render={({ field }) => (
                                <FormItem className="space-y-0">
                                  <FormControl>
                                    <div className="flex items-center gap-2 bg-muted/30 border border-border/60 rounded-xl px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary">
                                      <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                      <Input
                                        type="date"
                                        className="h-6 p-0 border-0 text-xs font-mono bg-transparent shadow-none focus-visible:ring-0 w-full"
                                        {...field}
                                      />
                                    </div>
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <div>
                            <Label className="text-[11px] font-bold uppercase text-muted-foreground tracking-wider mb-1.5 block">
                              Horário de Início
                            </Label>
                            <FormField
                              control={form.control}
                              name="study_time"
                              render={({ field }) => (
                                <FormItem className="space-y-0">
                                  <FormControl>
                                    <div className="flex items-center gap-2 bg-muted/30 border border-border/60 rounded-xl px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary">
                                      <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                      <Input
                                        type="time"
                                        className="h-6 p-0 border-0 text-xs font-mono bg-transparent shadow-none focus-visible:ring-0 w-full"
                                        {...field}
                                      />
                                    </div>
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Rodapé do Card: 3 Métricas Balanceadas */}
                    <div className="grid grid-cols-3 divide-x divide-border/50 bg-muted/20 border border-border/40 rounded-xl p-2 text-center shrink-0">
                      {!isManualMode ? (
                        <>
                          <div>
                            <p className="text-[9px] font-bold uppercase text-muted-foreground">
                              Ativo
                            </p>
                            <p className="font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400 truncate">
                              {formatClock(activeSeconds)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[9px] font-bold uppercase text-muted-foreground">
                              Pausa
                            </p>
                            <p className="font-mono font-bold text-xs text-amber-600 dark:text-amber-400 truncate">
                              {formatClock(pausedSeconds)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[9px] font-bold uppercase text-muted-foreground">
                              Foco
                            </p>
                            <p className="font-mono font-bold text-xs text-primary truncate">
                              {focusPercentage !== null ? `${focusPercentage}%` : "—"}
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <p className="text-[9px] font-bold uppercase text-muted-foreground">
                              Duração
                            </p>
                            <p className="font-mono font-bold text-xs text-foreground truncate">
                              {manualTotalMinutes > 0 ? `${manualTotalMinutes} min` : "0 min"}
                            </p>
                          </div>
                          <div>
                            <p className="text-[9px] font-bold uppercase text-muted-foreground">
                              Data
                            </p>
                            <p className="font-mono font-bold text-xs text-foreground truncate">
                              {formatDateBR(watchStudyDate)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[9px] font-bold uppercase text-muted-foreground">
                              Foco
                            </p>
                            <p className="font-mono font-bold text-xs text-muted-foreground truncate">
                              —
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* ═══════════════════════════════════════════════════════════════
                    COLUNA DIREITA — DETALHES DA SESSÃO
                    ═══════════════════════════════════════════════════════════════ */}
                <div className="flex-1 flex flex-col justify-between gap-3.5 min-w-0">
                  <div className="flex flex-col gap-3.5">
                    {/* Linha 1: Disciplina & Tópico */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Disciplina Combobox */}
                      <FormField
                        control={form.control}
                        name="discipline_name"
                        render={({ field }) => (
                          <FormItem className="flex flex-col space-y-1.5">
                            <FormLabel className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                              <span>Disciplina</span>
                              <span className="text-rose-500">*</span>
                            </FormLabel>
                            <Popover
                              open={disciplinePopoverOpen}
                              onOpenChange={setDisciplinePopoverOpen}
                            >
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    role="combobox"
                                    className={cn(
                                      "w-full justify-between font-normal h-9 text-xs sm:text-sm rounded-xl border-border/70 hover:border-primary/40 relative z-[160]",
                                      !field.value && "text-muted-foreground",
                                    )}
                                  >
                                    <div className="flex items-center gap-2 truncate">
                                      {field.value && (
                                        <span
                                          className="w-2.5 h-2.5 rounded-full shrink-0"
                                          style={{ backgroundColor: selectedColor }}
                                        />
                                      )}
                                      <span className="truncate">
                                        {field.value || "Selecione uma disciplina..."}
                                      </span>
                                    </div>
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent
                                className="w-[min(380px,calc(100vw-2rem))] p-0 z-[200] rounded-xl shadow-xl border-border/80"
                                align="start"
                                sideOffset={4}
                                onWheel={(e) => e.stopPropagation()}
                              >
                                <Command className="w-full max-h-[300px]" shouldFilter={true}>
                                  <CommandInput
                                    placeholder="Buscar disciplina..."
                                    value={field.value}
                                    onValueChange={(search) => {
                                      field.onChange(search)
                                      const found = allDisciplines.find(
                                        (d) => d.name.toLowerCase() === search.toLowerCase(),
                                      )
                                      form.setValue("discipline_id", found ? found.id : "")
                                    }}
                                  />
                                  <CommandList className="max-h-[250px] overflow-y-auto">
                                    <CommandEmpty>Nenhuma disciplina encontrada.</CommandEmpty>
                                    <CommandGroup heading="Sugestões do Plano">
                                      {planDisciplines.length > 0 ? (
                                        planDisciplines.map((disc) => (
                                          <CommandItem
                                            key={`plan-${disc.id}`}
                                            value={disc.name}
                                            onSelect={() => handleSelectDiscipline(disc)}
                                            className="cursor-pointer flex items-center justify-between"
                                          >
                                            <div className="flex items-center gap-2 min-w-0">
                                              <Check
                                                className={cn(
                                                  "h-4 w-4 shrink-0 text-primary",
                                                  field.value === disc.name
                                                    ? "opacity-100"
                                                    : "opacity-0",
                                                )}
                                              />
                                              <span
                                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                                style={{
                                                  backgroundColor: disciplineColorHex(
                                                    disc.id,
                                                    disc.color_hex,
                                                  ),
                                                }}
                                              />
                                              <span className="truncate">{disc.name}</span>
                                            </div>
                                            {disc.area && (
                                              <span className="text-[10px] text-muted-foreground ml-auto pl-2 truncate max-w-[120px]">
                                                {disc.area}
                                              </span>
                                            )}
                                          </CommandItem>
                                        ))
                                      ) : (
                                        <div className="px-3 py-2 text-xs text-muted-foreground italic">
                                          {hasActivePlan === false
                                            ? "Nenhum planejamento ativo. Crie um planejamento para receber sugestões personalizadas."
                                            : "Seu planejamento ainda não possui disciplinas."}
                                        </div>
                                      )}
                                    </CommandGroup>

                                    {otherDisciplines.length > 0 && (
                                      <CommandGroup heading="Todas as Disciplinas">
                                        {otherDisciplines.map((disc) => (
                                          <CommandItem
                                            key={`all-${disc.id}`}
                                            value={disc.name}
                                            onSelect={() => handleSelectDiscipline(disc)}
                                            className="cursor-pointer flex items-center justify-between"
                                          >
                                            <div className="flex items-center gap-2 min-w-0">
                                              <Check
                                                className={cn(
                                                  "h-4 w-4 shrink-0 text-primary",
                                                  field.value === disc.name
                                                    ? "opacity-100"
                                                    : "opacity-0",
                                                )}
                                              />
                                              <span
                                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                                style={{
                                                  backgroundColor: disciplineColorHex(
                                                    disc.id,
                                                    disc.color_hex,
                                                  ),
                                                }}
                                              />
                                              <span className="truncate">{disc.name}</span>
                                            </div>
                                            {disc.area && (
                                              <span className="text-[10px] text-muted-foreground ml-auto pl-2 truncate max-w-[120px]">
                                                {disc.area}
                                              </span>
                                            )}
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
                        )}
                      />

                      {/* Tópico Autocomplete */}
                      <FormField
                        control={form.control}
                        name="topic_name"
                        render={({ field }) => (
                          <FormItem className="flex flex-col space-y-1.5">
                            <FormLabel className="text-xs font-semibold text-foreground">
                              Tópico
                            </FormLabel>
                            <TopicAutocomplete
                              value={field.value ?? ""}
                              onChange={field.onChange}
                              disciplineId={watchDisciplineId}
                              placeholder={
                                watchDisciplineName
                                  ? "Ex: Direitos Fundamentais"
                                  : "Selecione uma disciplina primeiro"
                              }
                              className="relative z-[160]"
                            />
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Linha 2: Tipo de Estudo & Dados Complementares */}
                    <div className="p-3.5 border border-border/60 rounded-2xl bg-muted/20 flex flex-col gap-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                        <FormField
                          control={form.control}
                          name="studyType"
                          render={({ field }) => (
                            <FormItem className="space-y-1.5">
                              <FormLabel className="text-xs font-semibold text-foreground">
                                Formato do Estudo
                              </FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger className="font-medium h-9 text-xs sm:text-sm rounded-xl border-border/70 bg-background relative z-[160]">
                                    <SelectValue placeholder="Selecione o tipo..." />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent className="z-[200]">
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
                          )}
                        />

                        {/* Dynamic contextual fields (pages, questions, audio) */}
                        {renderDynamicFields() && (
                          <div className="flex flex-col justify-end">{renderDynamicFields()}</div>
                        )}
                      </div>
                    </div>

                    {/* Linha 3: Anotações da Sessão */}
                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem className="space-y-1.5">
                          <FormLabel className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <span>Anotações</span>
                            <span className="text-[10px] text-muted-foreground font-normal">
                              (opcional)
                            </span>
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Anote conceitos-chave, resumos, dúvidas ou links importantes..."
                              className="min-h-[80px] max-h-[140px] resize-none text-xs sm:text-sm font-sans bg-muted/10 rounded-xl border-border/60 focus-visible:ring-primary/20"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* ═══════════════════════════════════════════════════════════════
                      RODAPÉ DIREITO: RESUMO DA SESSÃO & BOTÕES
                      ═══════════════════════════════════════════════════════════════ */}
                  <div className="flex flex-col gap-2.5 pt-2 border-t border-border/50 shrink-0">
                    {/* Resumo da Sessão */}
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/30 border border-border/40 text-xs text-muted-foreground flex-wrap">
                      <div className="flex items-center gap-1.5 font-semibold text-foreground">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: selectedColor }}
                        />
                        <span className="truncate max-w-[150px]">
                          {watchDisciplineName || "Sem disciplina"}
                        </span>
                      </div>
                      <span>•</span>
                      <span className="font-medium text-foreground">
                        {!isManualMode ? formatClock(activeSeconds) : `${manualTotalMinutes} min`}
                      </span>
                      <span>•</span>
                      <span>{STUDY_TYPE_LABELS[watchType] || watchType}</span>
                      <span>•</span>
                      <span>
                        {formatDateBR(watchStudyDate)}
                        {isManualMode && watchStudyTime ? ` às ${watchStudyTime}` : ""}
                      </span>
                    </div>

                    {/* Botões de Ação */}
                    <div className="flex items-center justify-end gap-2.5">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={handleClose}
                        className="h-9 px-4 rounded-xl text-muted-foreground hover:text-foreground text-xs sm:text-sm"
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="h-9 px-6 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-xs sm:text-sm shadow-sm flex items-center gap-2"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        <span>{isSubmitting ? "Salvando..." : "Salvar estudo"}</span>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </Form>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  )
}
