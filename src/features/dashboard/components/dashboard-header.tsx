import Link from "next/link"
import { Target, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { type Greeting } from "@/application/dashboard/greeting.service"

export interface DashboardHeaderProps {
  userName: string | null
  greeting: Greeting
  formattedDate: string
  contestName: string | null
}

export function DashboardHeader({
  userName,
  greeting,
  formattedDate,
  contestName,
}: DashboardHeaderProps) {
  const displayName = userName ? userName.split(" ")[0] : "Estudante"

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b">
      <div>
        <div className="flex items-center gap-2">
          {greeting.emoji && <span className="text-xl">{greeting.emoji}</span>}
          <h1 className="text-2xl font-bold tracking-tight">
            {greeting.greeting}, <span className="text-primary">{displayName}</span>!
          </h1>
        </div>
        <p className="text-xs text-muted-foreground mt-1 capitalize">{formattedDate}</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-lg border">
          <Target className="h-4 w-4 text-primary shrink-0" />
          <div className="text-xs">
            <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Concurso</span>
            <span className="font-medium text-foreground truncate max-w-[160px] inline-block align-bottom">
              {contestName || "Nenhum definido"}
            </span>
          </div>
        </div>

        <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs">
          <Link href="/profile">
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Alternar Concurso</span>
          </Link>
        </Button>
      </div>
    </div>
  )
}
