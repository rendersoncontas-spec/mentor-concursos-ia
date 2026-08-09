"use client"

import * as React from "react"

import { ThemeProvider as NextThemesProvider } from "next-themes"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { StudyProvider } from "@/features/study-session/components/study-provider"

export function Providers({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  return (
    <NextThemesProvider {...props}>
      <QueryClientProvider client={queryClient}>
        <StudyProvider>
          {children}
        </StudyProvider>
      </QueryClientProvider>
    </NextThemesProvider>
  )
}
