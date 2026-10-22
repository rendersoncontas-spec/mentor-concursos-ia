"use client"

import { useState } from "react"

import { ReviewsView } from "@/features/reviews/components/reviews-view"
import { ReviewActionsProvider } from "@/features/reviews/review-actions"
import { createFakeReviewActions, type ReviewsHarnessState } from "@/lib/testing/reviews-fixtures"

export function ReviewsHarness({ state, nowIso }: { state: ReviewsHarnessState; nowIso: string }) {
  const [{ actions, initial }] = useState(() => createFakeReviewActions(state, nowIso))
  return (
    <ReviewActionsProvider actions={actions}>
      <div className="page-container py-5">
        <h1 className="sr-only">Revisões (harness E2E)</h1>
        <ReviewsView initialOverview={initial} />
      </div>
    </ReviewActionsProvider>
  )
}
