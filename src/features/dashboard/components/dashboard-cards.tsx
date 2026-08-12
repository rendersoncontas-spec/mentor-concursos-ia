import { 
  Target, 
  Briefcase, 
  BookOpen, 
  Clock, 
  Star, 
  Trophy, 
  Library, 
  CheckCircle2, 
  RefreshCcw, 
  CalendarDays,
  Sparkles,
  BrainCircuit,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { type DashboardData } from "@/domain/dashboard/dashboard.types"
import { type StudyPlanItemWithDetails } from "@/domain/study-plan/study-plan.types"

// --- 1. Target Card ---
export function TargetCard({ target }: { target: DashboardData["activeTarget"] }) {
  if (!target) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Concurso Atual</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">Nenhum concurso definido</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">Concurso Atual</CardTitle>
        <Target className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold mb-2 truncate">{target.target_exam}</div>
        <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Briefcase className="h-3.5 w-3.5" />
            <span className="truncate">{target.target_role}</span>
          </div>
          <div className="flex items-center gap-2">
            <BookOpen className="h-3.5 w-3.5" />
            <span className="truncate">{target.main_study_source || "Sem fonte definida"}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// --- 2. Profile Card ---
export function ProfileCard({ profile }: { profile: DashboardData["user"] }) {
  if (!profile) return null

  // Mapeamento simples de enums para texto
  const workRegimeMap: Record<string, string> = {
    FULL_TIME: "Integral",
    PART_TIME: "Meio Período",
    UNEMPLOYED: "Tempo Livre",
    STUDENT: "Estudante",
  }

  const expLevelMap: Record<string, string> = {
    BEGINNER: "Iniciante",
    INTERMEDIATE: "Intermediário",
    ADVANCED: "Avançado",
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">Perfil de Estudos</CardTitle>
        <Clock className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold mb-2">{profile.weekly_study_hours}h <span className="text-sm font-normal text-muted-foreground">/ semana</span></div>
        <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Briefcase className="h-3.5 w-3.5" />
            <span>{workRegimeMap[profile.work_regime || ""] || profile.work_regime}</span>
          </div>
          <div className="flex items-center gap-2">
            <Star className="h-3.5 w-3.5" />
            <span>{expLevelMap[profile.experience_level || ""] || profile.experience_level}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// --- 3. Weekly Goal Card ---
export function WeeklyGoalCard({ goal }: { goal: DashboardData["analytics"]["goals"]["weekly"] }) {
  const achievedHours = Math.floor(goal.achieved / 60)
  const remainingMinutes = goal.achieved % 60
  const targetHours = Math.floor(goal.target / 60)

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">Meta Semanal</CardTitle>
        <Trophy className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold mb-1">
          {achievedHours}h {remainingMinutes > 0 && `${remainingMinutes}m`} 
          <span className="text-sm font-normal text-muted-foreground"> / {targetHours}h</span>
        </div>
        <Progress value={goal.percentage} className="h-2 my-3" />
        <p className="text-xs text-muted-foreground text-right">
          {goal.percentage}% concluído
        </p>
      </CardContent>
    </Card>
  )
}

// --- 4. Disciplines Card ---
export function DisciplinesCard({ stats }: { stats: DashboardData["disciplinesStats"] }) {
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">Disciplinas</CardTitle>
        <Library className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold mb-3">{stats.total} <span className="text-sm font-normal text-muted-foreground">cadastradas</span></div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="flex gap-1 items-center bg-blue-500/10 text-blue-700 hover:bg-blue-500/20 dark:text-blue-400">
            <BookOpen className="h-3 w-3" />
            {stats.studying} estudando
          </Badge>
          <Badge variant="secondary" className="flex gap-1 items-center bg-green-500/10 text-green-700 hover:bg-green-500/20 dark:text-green-400">
            <CheckCircle2 className="h-3 w-3" />
            {stats.completed} concluídas
          </Badge>
          <Badge variant="secondary" className="flex gap-1 items-center bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-400">
            <RefreshCcw className="h-3 w-3" />
            {stats.revising} em revisão
          </Badge>
        </div>
      </CardContent>
    </Card>
  )
}

import { ActiveSessionManager } from "@/features/study-history/components/active-session-manager"

// --- 5. Today Plan Card (agora com motor de sessão ativa) ---
export function TodayPlanCard({ 
  items, 
  rawDisciplines 
}: { 
  items: StudyPlanItemWithDetails[],
  rawDisciplines: DashboardData["rawDisciplines"]
}) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">Estudo de Hoje</CardTitle>
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="pt-2 h-[calc(100%-3rem)] flex flex-col">
        <ActiveSessionManager items={items} disciplines={rawDisciplines} />
      </CardContent>
    </Card>
  )
}

// --- 6. Mentor IA Card ---
export function MentorIaCard() {
  return (
    <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
      <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
        <BrainCircuit className="h-24 w-24" />
      </div>
      <CardHeader className="pb-2 flex flex-row items-center space-x-2 space-y-0">
        <div className="bg-primary/20 p-1.5 rounded-md">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <CardTitle className="text-sm font-semibold">Mentor IA</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <p className="text-sm leading-relaxed text-foreground/80">
          Em breve o <strong>Mentor IA</strong> analisará seu histórico de estudos, questões e revisões para recomendar exatamente o que estudar.
        </p>
      </CardContent>
    </Card>
  )
}
