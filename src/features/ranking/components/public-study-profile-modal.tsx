"use client"

import { useEffect, useState } from "react"

import Image from "next/image"

import {
  BookOpen,
  Clock,
  Flame,
  HelpCircle,
  History,
  Lock,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react"

import {
  type PublicStudyProfile,
  getPublicStudyProfileAction,
} from "@/application/ranking/public-study-profile.action"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"

interface PublicStudyProfileModalProps {
  userId: string | null
  initialName?: string | undefined
  initialAvatar?: string | undefined
  initialInitials?: string | undefined
  initialBgColor?: string | undefined
  initialRank?: number | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0min"
  if (minutes < 60) return `${minutes}min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}min`
}

function getRankBadgeClass(rank: number): string {
  if (rank === 1) return "bg-amber-500 text-white"
  if (rank === 2) return "bg-slate-400 text-white"
  return "bg-amber-700 text-white"
}

function getAccuracyBadgeClass(accuracy: number): string {
  if (accuracy >= 80) {
    return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
  }
  if (accuracy >= 60) {
    return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
  }
  return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
}

export function PublicStudyProfileModal({
  userId,
  initialName,
  initialAvatar,
  initialInitials,
  initialBgColor,
  initialRank,
  open,
  onOpenChange,
}: PublicStudyProfileModalProps) {
  const [profile, setProfile] = useState<PublicStudyProfile | null>(null)
  const [fetchedForId, setFetchedForId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isLoading = Boolean(open && userId && fetchedForId !== userId)

  useEffect(() => {
    if (!open || !userId) {
      return
    }

    let isMounted = true

    getPublicStudyProfileAction(userId)
      .then((res) => {
        if (!isMounted) return
        setFetchedForId(userId)
        if (res.success && res.data) {
          setProfile(res.data)
          setError(null)
        } else {
          setProfile(null)
          setError(res.error || "Não foi possível carregar o perfil do estudante.")
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) return
        setFetchedForId(userId)
        setProfile(null)
        setError(err instanceof Error ? err.message : "Erro ao carregar perfil.")
      })

    return () => {
      isMounted = false
    }
  }, [open, userId])

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setProfile(null)
      setFetchedForId(null)
      setError(null)
    }
    onOpenChange(isOpen)
  }

  const displayName = profile?.name || initialName || "Estudante"
  const avatarUrl = profile?.avatarUrl || initialAvatar || null
  const initials = profile?.initials || initialInitials || "ES"
  const bgColor = profile?.bgColor || initialBgColor || "bg-blue-600"
  const isPrivate = profile?.isPrivate ?? false

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg md:max-w-2xl p-0 gap-0 overflow-hidden rounded-2xl border-border bg-card shadow-2xl max-h-[92vh] flex flex-col">
        {/* Header Visual */}
        <DialogHeader className="p-4 sm:p-5 border-b bg-muted/30 shrink-0 relative">
          <div className="flex items-start justify-between gap-3 pr-6">
            <div className="flex items-center gap-3 min-w-0">
              {/* Avatar ou Inicial */}
              <div className="relative shrink-0">
                {avatarUrl ? (
                  <div className="relative h-12 w-12 sm:h-14 sm:w-14 rounded-full border-2 border-primary/20 bg-background shadow-xs overflow-hidden">
                    <Image
                      src={avatarUrl}
                      alt={displayName}
                      fill
                      sizes="56px"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div
                    className={`h-12 w-12 sm:h-14 sm:w-14 rounded-full ${bgColor} text-white flex items-center justify-center font-black text-sm sm:text-base shadow-xs`}
                  >
                    {initials}
                  </div>
                )}

                {initialRank && initialRank <= 3 && (
                  <span
                    className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black border-2 border-card ${getRankBadgeClass(
                      initialRank,
                    )}`}
                  >
                    {initialRank}º
                  </span>
                )}
              </div>

              {/* Nome e Cargo */}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-base sm:text-lg font-bold text-foreground truncate">
                    {displayName}
                  </DialogTitle>
                  {profile?.isSelf && (
                    <Badge className="bg-primary text-primary-foreground text-[9px] font-black px-1.5 py-0">
                      VOCÊ
                    </Badge>
                  )}
                  {initialRank && initialRank > 3 && (
                    <Badge
                      variant="outline"
                      className="text-[10px] font-bold px-1.5 py-0 text-muted-foreground"
                    >
                      #{initialRank} no Ranking
                    </Badge>
                  )}
                </div>
                <DialogDescription className="text-xs text-muted-foreground truncate mt-0.5">
                  {profile?.targetContest || "Concurseiro Focado"}
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Corpo do Modal */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs sm:text-sm">
          {isLoading && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-20 rounded-xl" />
                ))}
              </div>
              <Skeleton className="h-32 rounded-xl" />
              <Skeleton className="h-36 rounded-xl" />
            </div>
          )}

          {!isLoading && error && (
            <div className="py-8 text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
                <HelpCircle className="h-5 w-5" />
              </div>
              <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>
            </div>
          )}

          {/* PERFIL PRIVADO */}
          {!isLoading && !error && isPrivate && (
            <div className="py-10 text-center space-y-3 px-4">
              <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto text-muted-foreground/70">
                <Lock className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-foreground">Perfil Privado</h4>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                  Este usuário mantém seu desempenho de estudos privado.
                </p>
              </div>
            </div>
          )}

          {/* PERFIL PÚBLICO OU PRÓPRIO USUÁRIO */}
          {!isLoading && !error && !isPrivate && profile && (
            <div className="space-y-4">
              {/* 1. Cards de Métricas Principais */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
                {/* Tempo Estudado */}
                <div className="rounded-xl border bg-muted/15 p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      Tempo Total
                    </span>
                  </div>
                  <p className="text-base sm:text-lg font-black text-foreground tabular-nums">
                    {profile.stats?.formattedHours || "0min"}
                  </p>
                  <span className="text-[10px] text-muted-foreground block">registrado</span>
                </div>

                {/* Constância / Sequência */}
                <div className="rounded-xl border bg-muted/15 p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Flame className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      Constância
                    </span>
                  </div>
                  <p className="text-base sm:text-lg font-black text-foreground tabular-nums flex items-baseline gap-1">
                    {profile.stats?.currentStreak ?? 0}
                    <span className="text-xs font-normal text-muted-foreground">dias</span>
                  </p>
                  <span className="text-[10px] text-muted-foreground block truncate">
                    Recorde: {profile.stats?.longestStreak ?? 0}d
                  </span>
                </div>

                {/* Questões & Acerto */}
                <div className="rounded-xl border bg-muted/15 p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Target className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Questões</span>
                  </div>
                  <p className="text-base sm:text-lg font-black text-foreground tabular-nums">
                    {profile.stats?.totalQuestions ?? 0}
                  </p>
                  <span className="text-[10px] text-muted-foreground block">
                    {profile.stats?.accuracyPercentage !== null &&
                    profile.stats?.accuracyPercentage !== undefined
                      ? `${profile.stats.accuracyPercentage}% acerto`
                      : "—"}
                  </span>
                </div>

                {/* Foco Médio */}
                <div className="rounded-xl border bg-muted/15 p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Zap className="h-3.5 w-3.5 text-purple-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      Foco Médio
                    </span>
                  </div>
                  <p className="text-base sm:text-lg font-black text-foreground tabular-nums">
                    {profile.stats?.averageFocusPercentage !== null &&
                    profile.stats?.averageFocusPercentage !== undefined
                      ? `${profile.stats.averageFocusPercentage}%`
                      : "—"}
                  </p>
                  <span className="text-[10px] text-muted-foreground block">nível de foco</span>
                </div>
              </div>

              {/* 2. Evolução Semanal */}
              {profile.stats && (
                <div className="rounded-xl border bg-muted/10 p-3 sm:p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <TrendingUp className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-foreground">Ritmo de Estudos</p>
                      <p className="text-[11px] text-muted-foreground">
                        Esta semana:{" "}
                        <strong className="text-foreground">
                          {formatMinutes(profile.stats.thisWeekMinutes)}
                        </strong>
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                      Semana Anterior
                    </span>
                    <span className="text-xs font-semibold text-foreground tabular-nums">
                      {formatMinutes(profile.stats.lastWeekMinutes)}
                    </span>
                  </div>
                </div>
              )}

              {/* 3. Top Disciplinas */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5 text-primary" /> Principais Disciplinas
                  </h4>
                  <span className="text-[10px] text-muted-foreground">
                    Top {profile.topDisciplines.length}
                  </span>
                </div>

                {profile.topDisciplines.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2">
                    Nenhuma disciplina com histórico registrado.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {profile.topDisciplines.map((d) => (
                      <div
                        key={d.disciplineId}
                        className="p-2.5 rounded-lg border bg-muted/10 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-foreground truncate">
                            {d.disciplineName}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                            <span>⏱️ {d.formattedDuration}</span>
                            {d.totalQuestions > 0 && <span>• {d.totalQuestions} questões</span>}
                          </div>
                        </div>
                        {d.accuracyPercentage !== null ? (
                          <Badge
                            variant="outline"
                            className={`text-[11px] font-bold shrink-0 ${getAccuracyBadgeClass(
                              d.accuracyPercentage,
                            )}`}
                          >
                            {d.accuracyPercentage}% acerto
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-muted-foreground font-semibold shrink-0">
                            —
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 4. Últimos Estudos (Máximo 5 registros) */}
              <div className="space-y-2 pt-1">
                <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5 text-primary" /> Sessões Recentes
                </h4>

                {profile.recentActivities.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2">
                    Nenhuma sessão recente registrada.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {profile.recentActivities.map((act) => (
                      <div
                        key={act.id}
                        className="px-3 py-2 rounded-lg border bg-muted/5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground shrink-0">
                            {act.relativeDateLabel}
                          </span>
                          <span className="font-semibold text-foreground truncate">
                            {act.disciplineName}
                          </span>
                        </div>
                        <span className="text-muted-foreground font-bold tabular-nums shrink-0">
                          {act.formattedDuration}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
