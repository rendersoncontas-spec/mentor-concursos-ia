"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { CalendarDays, RefreshCcw, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { generateStudyPlanAction } from "@/application/study-plan/generate-study-plan.action"
import { Button } from "@/components/ui/button"

type Props = {
  hasPlan: boolean
}

export function GeneratePlanButton({ hasPlan }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateStudyPlanAction("manual")

      if (!result.success) {
        toast.error(result.error)
        return
      }

      toast.success(`Cronograma V${result.version} gerado com sucesso!`)
      router.refresh()
    })
  }

  return (
    <Button
      onClick={handleGenerate}
      disabled={isPending}
      size="sm"
      variant={hasPlan ? "outline" : "default"}
      className="gap-2"
    >
      {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
      {!isPending && hasPlan && <RefreshCcw className="h-4 w-4" />}
      {!isPending && !hasPlan && <CalendarDays className="h-4 w-4" />}
      {isPending && "Gerando..."}
      {!isPending && hasPlan && "Regenerar Cronograma"}
      {!isPending && !hasPlan && "Gerar Cronograma"}
    </Button>
  )
}
