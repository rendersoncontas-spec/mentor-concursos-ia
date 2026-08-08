"use client"

import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { Loader2, BookOpen, Clock, CheckCircle2, Check, ChevronsUpDown } from "lucide-react"
import { toast } from "sonner"

import { completeOnboardingAction } from "@/application/onboarding/complete-onboarding.action"
import { type OnboardingInput, onboardingSchema } from "@/domain/onboarding/onboarding.schemas"
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
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

const steps = [
  { id: "objetivo", title: "Seu Objetivo", icon: BookOpen },
  { id: "ritmo", title: "Seu Ritmo", icon: Clock },
  { id: "bagagem", title: "Sua Bagagem", icon: CheckCircle2 },
]

export function OnboardingWizard({ exams }: { exams: { id: string; name: string }[] }) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [isPending, startTransition] = useTransition()

  const form = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema) as any,
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

  return (
    <div className="w-full">
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
                control={form.control as any}
                name="examId"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Qual concurso você quer passar?</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            className={cn(
                              "w-full justify-between font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value
                              ? exams.find((exam) => exam.id === field.value)?.name
                              : "Selecione o concurso..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Buscar concurso..." />
                          <CommandList>
                            <CommandEmpty>Nenhum concurso encontrado.</CommandEmpty>
                            <CommandGroup>
                              {exams.map((exam) => (
                                <CommandItem
                                  value={exam.name}
                                  key={exam.id}
                                  onSelect={() => {
                                    form.setValue("examId", exam.id)
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      exam.id === field.value
                                        ? "opacity-100"
                                        : "opacity-0"
                                    )}
                                  />
                                  {exam.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FormDescription>Você pode mudar isso depois.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control as any}
                name="targetRole"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Qual o cargo desejado?</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Agente, Auditor, Técnico" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control as any}
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
                control={form.control as any}
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
                control={form.control as any}
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
                control={form.control as any}
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
              <Button type="button" onClick={handleNext}>
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
