import { Brain } from "lucide-react"

export default function DashboardReviewsLoading() {
  return (
    <div className="flex flex-col min-h-full animate-pulse">
      {/* Esqueleto com o mesmo layout de cabeçalho da página real, sem dados */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-sm border-b px-6 py-3 flex items-center gap-3">
        <Brain className="h-5 w-5 text-primary" />
        <div className="space-y-2">
          <div className="h-4 w-40 bg-muted rounded" />
          <div className="h-3 w-56 bg-muted rounded" />
        </div>
      </div>

      <div className="flex-1 p-4 md:p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted rounded-xl" />
          ))}
        </div>
        <div className="h-64 bg-muted rounded-xl" />
      </div>
    </div>
  )
}
