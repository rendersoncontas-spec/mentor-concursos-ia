"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { BookOpen, CheckCircle2, RefreshCcw, Clock, ArrowRight } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"

import { type UserDisciplineWithDetails, type DisciplineStatus } from "@/domain/disciplines/disciplines.types"
import { updateDisciplineStatusAction } from "@/application/disciplines/update-status.action"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

const statusConfig: Record<DisciplineStatus, { label: string; className: string }> = {
  NOT_STARTED:         { label: "Não iniciada",        className: "bg-muted text-muted-foreground" },
  STUDYING:            { label: "Estudando",            className: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  REVISING:            { label: "Em revisão",           className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  COMPLETED:           { label: "Concluída",            className: "bg-green-500/15 text-green-700 dark:text-green-400" },
  READY_FOR_SCHEDULE:  { label: "Pronta p/ cronograma", className: "bg-purple-500/15 text-purple-700 dark:text-purple-400" },
}

const areaIcons: Record<string, React.ElementType> = {
  Geral:    BookOpen,
  Direito:  CheckCircle2,
  Ciências: RefreshCcw,
  Específico: Clock,
}

type Props = {
  disciplines: UserDisciplineWithDetails[]
  userId: string
}

export function DisciplinesList({ disciplines, userId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleStatusChange(userDisciplineId: string, newStatus: DisciplineStatus) {
    startTransition(async () => {
      const result = await updateDisciplineStatusAction(userId, userDisciplineId, newStatus)

      if (!result.success) {
        toast.error("Erro ao atualizar status. Tente novamente.")
        return
      }

      toast.success("Status atualizado com sucesso!")
      router.refresh()
    })
  }

  if (disciplines.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
          <BookOpen className="h-12 w-12 text-muted-foreground/40" />
          <div>
            <p className="font-semibold text-foreground">Nenhuma disciplina cadastrada</p>
            <p className="text-sm text-muted-foreground mt-1">
              Conclua o onboarding para carregar automaticamente as disciplinas do seu concurso.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/onboarding">
              Ir para Onboarding <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const total = disciplines.length
  const completed = disciplines.filter(d => d.status === "COMPLETED").length
  const studying = disciplines.filter(d => d.status === "STUDYING").length
  const revising = disciplines.filter(d => d.status === "REVISING").length

  return (
    <div className="space-y-6">
      {/* Resumo rápido */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryChip label="Total" value={total} color="default" />
        <SummaryChip label="Estudando" value={studying} color="blue" />
        <SummaryChip label="Em revisão" value={revising} color="amber" />
        <SummaryChip label="Concluídas" value={completed} color="green" />
      </div>

      {/* Tabela */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Suas Disciplinas</CardTitle>
          <CardDescription>Altere o status conforme seu progresso real.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Disciplina</TableHead>
                <TableHead className="hidden sm:table-cell">Área</TableHead>
                <TableHead>Domínio</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {disciplines.map((ud) => {
                const Icon = areaIcons[ud.discipline.area ?? ""] ?? BookOpen
                const config = statusConfig[ud.status] ?? statusConfig.NOT_STARTED

                return (
                  <TableRow key={ud.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium">{ud.discipline.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="text-sm text-muted-foreground">{ud.discipline.area ?? "—"}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-[80px]">
                        <Progress value={ud.mastery_level} className="h-1.5 w-16" />
                        <span className="text-xs text-muted-foreground tabular-nums">{ud.mastery_level}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={ud.status}
                        onValueChange={(v) => handleStatusChange(ud.id, v as DisciplineStatus)}
                        disabled={isPending}
                      >
                        <SelectTrigger className="h-8 w-[160px] text-xs">
                          <SelectValue>
                            <Badge className={`text-xs font-normal ${config.className}`}>
                              {config.label}
                            </Badge>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.entries(statusConfig) as [DisciplineStatus, { label: string; className: string }][]).map(([key, val]) => (
                            <SelectItem key={key} value={key}>
                              <Badge className={`text-xs font-normal ${val.className}`}>{val.label}</Badge>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryChip({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: "default" | "blue" | "amber" | "green"
}) {
  const colors = {
    default: "bg-muted text-foreground",
    blue:    "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    amber:   "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    green:   "bg-green-500/10 text-green-700 dark:text-green-400",
  }

  return (
    <div className={`flex flex-col items-center justify-center rounded-lg p-3 ${colors[color]}`}>
      <span className="text-2xl font-bold">{value}</span>
      <span className="text-xs mt-0.5 opacity-80">{label}</span>
    </div>
  )
}
