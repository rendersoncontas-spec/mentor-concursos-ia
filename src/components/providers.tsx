"use client"

import * as React from "react"

import { ThemeProvider as NextThemesProvider } from "next-themes"
import { Toaster } from "sonner"

import { PwaInstallCapture } from "@/components/pwa/pwa-install-capture"
import { StudyProvider } from "@/features/study-session/components/study-provider"

// @tanstack/react-query foi removido daqui (Fase 6, auditoria de bundle):
// o QueryClientProvider envolvia toda a árvore de componentes, mas nenhum
// componente do projeto usa useQuery/useMutation/useQueryClient (confirmado
// por busca em todo o src) — era JS carregado globalmente sem nenhum
// consumidor real. Se uma futura feature precisar de React Query, reintroduza
// aqui deliberadamente.
export function Providers({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider {...props}>
      <StudyProvider>
        {children}
      </StudyProvider>
      <Toaster position="top-center" richColors />
      {/* UX-PWA-01: guarda o prompt de instalação assim que o navegador o oferecer. */}
      <PwaInstallCapture />
    </NextThemesProvider>
  )
}
