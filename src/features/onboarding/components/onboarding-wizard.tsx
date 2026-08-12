"use client"

import { useState, useTransition, useEffect } from "react"
import { useForm, useWatch, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { Loader2, BookOpen, Clock, CheckCircle2, Check, ChevronsUpDown, Search, GraduationCap, Plus } from "lucide-react"
import { toast } from "sonner"

import { completeOnboardingAction } from "@/application/onboarding/complete-onboarding.action"
import { searchExamsAction } from "@/application/disciplines/search-exams.action"
import { createExamAction } from "@/application/disciplines/create-exam.action"
import { type OnboardingInput, onboardingSchema } from "@/domain/onboarding/onboarding.schemas"
import { type Exam } from "@/domain/disciplines/disciplines.types"
import { useDebounce } from "@/hooks/use-debounce"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

const steps = [
  { id: "objetivo", title: "Seu Objetivo", icon: BookOpen },
  { id: "ritmo", title: "Seu Ritmo", icon: Clock },
  { id: "bagagem", title: "Sua Bagagem", icon: CheckCircle2 },
]

export function OnboardingWizard() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [isPending, startTransition] = useTransition()

  // Estado da Busca Inteligente
  const [exams, setExams] = useState<Exam[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const debouncedSearch = useDebounce(searchQuery, 300)
  const [openCombobox, setOpenCombobox] = useState(false)

  // Estado do Modal de Novo Concurso
  const [isNewExamModalOpen, setIsNewExamModalOpen] = useState(false)
  const [newExamName, setNewExamName] = useState("")
  const [newExamRole, setNewExamRole] = useState("")
  const [newExamOrganizer, setNewExamOrganizer] = useState("")
  const [isCreatingExam, setIsCreatingExam] = useState(false)

  const form = useForm<OnboardingInput, unknown, OnboardingInput>({
    resolver: zodResolver(onboardingSchema) as Resolver<OnboardingInput, unknown, OnboardingInput>,
    defaultValues: {
      examId: "",
      targetRole: "",
      mainStudySource: "",
      weeklyStudyHours: 20,
      workRegime: "FULL_TIME",
      experienceLevel: "BEGINNER",
      studiedDisciplines: [],
    },
  })

  useEffect(() => {
    let active = true
    const searchTimer = setTimeout(() => setIsSearching(true), 0)
    searchExamsAction(debouncedSearch).then((results) => {
      if (active) {
        setExams(results)
        setIsSearching(false)
      }
    })
    return () => {
      active = false
      clearTimeout(searchTimer)
    }
  }, [debouncedSearch])

  async function handleCreateExam() {
    if (!newExamName || newExamName.trim().length < 2) {
      toast.error("Nome do concurso inválido.")
      return
    }
    if (!newExamRole || newExamRole.trim().length < 2) {
      toast.error("Cargo desejado é obrigatório.")
      return
    }
    
    setIsCreatingExam(true)
    const res = await createExamAction(newExamName, newExamOrganizer)
    setIsCreatingExam(false)
    
    if (!res.success || !res.data) {
      toast.error(res.error || "Erro ao criar concurso.")
      return
    }

    const createdExam = res.data

    toast.success("Concurso adicionado com sucesso!")
    setExams((prev) => [createdExam, ...prev])
    form.setValue("examId", res.data.id, { shouldValidate: true })
    form.setValue("targetRole", newExamRole, { shouldValidate: true })
    setIsNewExamModalOpen(false)
    setOpenCombobox(false)
    
    // Limpar estados
    setNewExamName("")
    setNewExamRole("")
    setNewExamOrganizer("")
  }

  // Validação manual de cada step antes de avançar
  async function handleNext() {
    let fieldsToValidate: (keyof OnboardingInput)[] = []
    
    if (currentStep === 0) {
      fieldsToValidate = ["examId", "targetRole", "mainStudySource"]
    } else if (currentStep === 1) {
      fieldsToValidate = ["weeklyStudyHours", "workRegime", "experienceLevel"]
    }

    const isValid = await form.trigger(fieldsToValidate)
    if (isValid) {
      setCurrentStep((prev) => prev + 1)
    }
  }

  function handleBack() {
    setCurrentStep((prev) => prev - 1)
  }

  function onSubmit(values: OnboardingInput) {
    startTransition(async () => {
      const response = await completeOnboardingAction(values)

      if (!response.success) {
        toast.error(response.error)
        return
      }

      toast.success("Perfil configurado com sucesso! Vamos começar.")
      router.push("/dashboard")
      router.refresh()
    })
  }

  function onError(errors: Record<string, unknown>) {
    console.error("Erros de validação do form:", errors)
    toast.error("Preencha todos os campos corretamente.")
  }

  const selectedExamId = useWatch({ control: form.control, name: "examId" })
  const selectedTargetRole = useWatch({ control: form.control, name: "targetRole" })
  const mainStudySource = useWatch({ control: form.control, name: "mainStudySource" })
  const selectedExam = exams.find((e) => e.id === selectedExamId)
  
  // Habilita/Desabilita o botão próximo baseado no Step 1
  const isStep1Valid = selectedExamId && selectedTargetRole && mainStudySource

  return (
    <div className="w-full">
      {/* Modal Adicionar Concurso */}
      <Dialog open={isNewExamModalOpen} onOpenChange={setIsNewExamModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Adicionar concurso</DialogTitle>
            <DialogDescription>
              Cadastre o concurso e o cargo desejado. O concurso será salvo e selecionado automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Nome
              </Label>
              <Input
                id="name"
                placeholder="Ex: Receita Federal"
                className="col-span-3"
                value={newExamName}
                onChange={(e) => setNewExamName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="role" className="text-right">
                Cargo
              </Label>
              <Input
                id="role"
                placeholder="Ex: Analista-Tributário"
                className="col-span-3"
                value={newExamRole}
                onChange={(e) => setNewExamRole(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="organizer" className="text-right">
                Órgão (Opcional)
              </Label>
              <Input
                id="organizer"
                placeholder="Ex: RFB"
                className="col-span-3"
                value={newExamOrganizer}
                onChange={(e) => setNewExamOrganizer(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewExamModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateExam} disabled={isCreatingExam}>
              {isCreatingExam && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cadastrar concurso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stepper Header */}
      <div className="mb-8 flex justify-between relative">
        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-border -z-10 -translate-y-1/2" />
        {steps.map((step, index) => {
          const Icon = step.icon
          const isActive = index === currentStep
          const isCompleted = index < currentStep
          
          let circleClasses = "border-muted-foreground/30 bg-card text-muted-foreground"
          if (isActive) {
            circleClasses = "border-primary bg-primary text-primary-foreground"
          } else if (isCompleted) {
            circleClasses = "border-primary bg-primary/20 text-primary"
          }

          return (
            <div key={step.id} className="flex flex-col items-center gap-2 bg-card px-2">
              <div 
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors ${circleClasses}`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <span className={`text-xs font-medium ${isActive || isCompleted ? "text-foreground" : "text-muted-foreground"}`}>
                {step.title}
              </span>
            </div>
          )
        })}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, onError)} className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          
          {/* STEP 1: OBJETIVO */}
          {currentStep === 0 && (
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="examId"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Qual concurso você quer passar?</FormLabel>
                    <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={openCombobox}
                            className={cn(
                              "w-full justify-between font-normal h-auto py-3 transition-all hover:bg-muted/50 focus:ring-2 focus:ring-primary/20",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              <div className="flex items-center">
                                <div className="bg-primary/10 p-2 rounded-full mr-3">
                                  <GraduationCap className="h-5 w-5 text-primary" />
                                </div>
                                <div className="flex flex-col text-left">
                                  <span className="font-semibold text-foreground text-sm">
                                    {selectedExam?.name || "Concurso Selecionado"}
                                  </span>
                                  {selectedTargetRole && (
                                    <span className="text-xs text-muted-foreground font-medium mt-0.5">
                                      {selectedTargetRole}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="flex items-center gap-2">
                                <Search className="h-4 w-4 opacity-50" /> 
                                Selecione o concurso...
                              </span>
                            )}
                            {field.value && <Check className="ml-2 h-4 w-4 shrink-0 text-primary" />}
                            {!field.value && <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[320px] sm:w-[400px] p-0 shadow-lg border-muted/60" align="start">
                        <Command shouldFilter={false}>
                          <div className="flex items-center border-b px-3">
                            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                            <CommandInput 
                              placeholder="Buscar concurso..." 
                              value={searchQuery}
                              onValueChange={setSearchQuery}
                              className="border-0 focus:ring-0 outline-none flex-1 py-3 bg-transparent text-sm"
                            />
                            {isSearching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                          </div>
                          
                          <CommandList className="max-h-[280px] overflow-y-auto p-1">
                            {exams.length === 0 && !isSearching && (
                              <div className="py-6 text-center text-sm text-muted-foreground flex flex-col items-center">
                                <p className="mb-4">Nenhum concurso encontrado.</p>
                                <Button 
                                  variant="secondary" 
                                  size="sm" 
                                  className="w-[80%]"
                                  onClick={() => {
                                    setOpenCombobox(false)
                                    setIsNewExamModalOpen(true)
                                  }}
                                >
                                  <Plus className="mr-2 h-4 w-4" />
                                  Cadastrar novo concurso
                                </Button>
                              </div>
                            )}

                            {exams.length > 0 && (
                              <CommandGroup>
                                {exams.map((exam) => (
                                  <CommandItem
                                    value={exam.id}
                                    key={exam.id}
                                    onSelect={() => {
                                      form.setValue("examId", exam.id, { shouldValidate: true })
                                      setOpenCombobox(false)
                                    }}
                                    className="cursor-pointer py-3 rounded-md mb-1 aria-selected:bg-primary/10 aria-selected:text-primary transition-colors"
                                  >
                                    <div className="flex flex-col">
                                      <span className="font-medium">{exam.name}</span>
                                      {exam.organizer && (
                                        <span className="text-xs opacity-70 mt-0.5">{exam.organizer}</span>
                                      )}
                                    </div>
                                    {exam.id === field.value && (
                                      <Check className="ml-auto h-4 w-4 text-primary" />
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
              
              <FormField
                control={form.control}
                name="targetRole"
                render={({ field }) => (
                  <FormItem className={cn(selectedTargetRole && selectedExamId ? "hidden" : "block")}>
                    <FormLabel>Qual o cargo desejado?</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Agente, Auditor, Técnico" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mainStudySource"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Principal material de estudo</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Gran Cursos, Estratégia, PDFs avulsos" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}

          {/* STEP 2: RITMO */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <FormField
                control={form.control}
                name="weeklyStudyHours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Horas semanais disponíveis para estudo ({field.value}h)</FormLabel>
                    <FormControl>
                      <Slider
                        min={1}
                        max={60}
                        step={1}
                        value={[field.value]}
                        onValueChange={(vals) => field.onChange(vals[0])}
                        className="py-4"
                      />
                    </FormControl>
                    <FormDescription>
                      Isso ajudará a IA a montar um cronograma realista.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="workRegime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Seu regime de trabalho atual</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="FULL_TIME">Trabalho Integral (8h+)</SelectItem>
                        <SelectItem value="PART_TIME">Trabalho Meio Período</SelectItem>
                        <SelectItem value="UNEMPLOYED">Apenas Estudo (Tempo Livre)</SelectItem>
                        <SelectItem value="STUDENT">Estudante (Escola/Faculdade)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="experienceLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Qual seu nível de experiência com concursos?</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="BEGINNER">Iniciante (Começando agora)</SelectItem>
                        <SelectItem value="INTERMEDIATE">Intermediário (Já estudei antes)</SelectItem>
                        <SelectItem value="ADVANCED">Avançado (Já bati na trave / Aprovado)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}

          {/* STEP 3: BAGAGEM */}
          {currentStep === 2 && (
            <div className="space-y-4 text-center">
              <div className="p-8 border-2 border-dashed rounded-lg bg-muted/20">
                <p className="text-muted-foreground mb-4">
                  Ainda não temos disciplinas cadastradas no banco global. 
                  Você poderá adicionar suas matérias já estudadas posteriormente pelo painel.
                </p>
                <p className="text-sm font-semibold">Tudo pronto para começarmos?</p>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex w-full justify-between pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 0 || isPending}
            >
              Voltar
            </Button>
            
            {currentStep < steps.length - 1 ? (
              <Button 
                type="button" 
                onClick={handleNext}
                disabled={currentStep === 0 && !isStep1Valid}
              >
                Próximo Passo
              </Button>
            ) : (
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Concluir e Acessar Painel
              </Button>
            )}
          </div>
        </form>
      </Form>
    </div>
  )
}
