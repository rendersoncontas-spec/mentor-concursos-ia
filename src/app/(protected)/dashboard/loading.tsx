import { PendingReviewsWidgetSkeleton } from "@/features/dashboard/components/pending-reviews-widget"
import { RecentActivitiesListSkeleton } from "@/features/dashboard/components/recent-activities-list"
import { CycleNextCardSkeleton } from "@/features/dashboard/components/cycle-next-card"

export default function DashboardLoading() {
  return (
    <div className="flex-1 p-4 md:p-6 space-y-6 max-w-7xl mx-auto w-full animate-pulse">
      {/* Header Skeleton */}
      <div className="flex justify-between items-center pb-2 border-b">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-muted rounded" />
          <div className="h-3 w-32 bg-muted rounded" />
        </div>
        <div className="h-9 w-36 bg-muted rounded" />
      </div>

      {/* KPI Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-muted rounded-xl" />
        ))}
      </div>

      {/* Main Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="md:col-span-2">
          <CycleNextCardSkeleton />
        </div>
        <div className="md:col-span-1">
          <PendingReviewsWidgetSkeleton />
        </div>
      </div>

      {/* Secondary Grid Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-1">
          <RecentActivitiesListSkeleton />
        </div>
        <div className="lg:col-span-2">
          <div className="h-48 bg-muted rounded-xl" />
        </div>
      </div>
    </div>
  )
}
