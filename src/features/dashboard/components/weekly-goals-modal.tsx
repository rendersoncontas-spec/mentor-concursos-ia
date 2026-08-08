"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Target, Clock, BookOpen, Calendar as CalendarIcon, RotateCcw } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { saveWeeklyGoalsAction } from "@/application/dashboard/goals.action"
import { weeklyGoalsSchema, type WeeklyGoalsInput } from "@/application/dashboard/goals.schema"
import { DashboardProfile } from "@/domain/dashboard/dashboard.types"

interface WeeklyGoalsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: DashboardProfile | null
}

export function WeeklyGoalsModal({ open, onOpenChange, profile }: WeeklyGoalsModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<WeeklyGoalsInput>({
    resolver: zodResolver(weeklyGoalsSchema) as any,
    defaultValues: {
      weekly_study_hours: profile?.weekly_study_hours ?? 20,
      weekly_questions_goal: profile?.weekly_questions_goal ?? 100,
      weekly_revisions_goal: profile?.weekly_revisions_goal ?? 5,
      weekly_study_days_goal: profile?.weekly_study_days_goal ?? 6,
      week_start_day: profile?.week_start_day ?? 1,
    },
  })

  async function onSubmit(data: WeeklyGoalsInput) {
    setIsSubmitting(true)
    try {
      const res = await saveWeeklyGoalsAction(data)
      if (res.success) {
        toast.success("Metas semanais atualizadas!")
        onOpenChange(false)
      } else {
        toast.error(res.error || "Erro ao salvar metas.")
      }
    } catch (err) {
      toast.error("Ocorreu um erro inesperado.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            Configurar Metas Semanais
          </DialogTitle>
          <DialogDescription>
            Defina seus objetivos para a semana. O progresso será reiniciado automaticamente de acordo com o dia de início selecionado.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form 
            onSubmit={form.handleSubmit(onSubmit as any)} 
            className="space-y-4 pt-4"
          >
            
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control as any}
                name="weekly_study_hours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      Horas (h)
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control as any}
                name="weekly_questions_goal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-muted-foreground" />
                      Questões
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={10}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control as any}
                name="weekly_revisions_goal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <RotateCcw className="w-4 h-4 text-muted-foreground" />
                      Revisões
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control as any}
                name="weekly_study_days_goal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                      Dias Ativos
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={7}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control as any}
              name="week_start_day"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dia de início da semana</FormLabel>
                  <Select
                    onValueChange={(val) => field.onChange(Number(val))}
                    defaultValue={field.value.toString()}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="0">Domingo</SelectItem>
                      <SelectItem value="1">Segunda-feira</SelectItem>
                      <SelectItem value="2">Terça-feira</SelectItem>
                      <SelectItem value="3">Quarta-feira</SelectItem>
                      <SelectItem value="4">Quinta-feira</SelectItem>
                      <SelectItem value="5">Sexta-feira</SelectItem>
                      <SelectItem value="6">Sábado</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end pt-4">
              <Button type="button" variant="ghost" className="mr-2" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Salvando..." : "Salvar Metas"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
