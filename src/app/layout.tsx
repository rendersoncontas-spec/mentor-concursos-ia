import type { Metadata } from "next"

import { Providers } from "@/components/providers"
import { cn } from "@/lib/utils"

import { fontMono, fontSans } from "./fonts"
import "./globals.css"

export const metadata: Metadata = {
  title: {
    template: "%s | Mentor Concursos IA",
    default: "Mentor Concursos IA",
  },
  description: "A melhor plataforma de mentoria inteligente para concursos públicos do Brasil.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          fontSans.variable,
          fontMono.variable,
        )}
      >
        <Providers attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </Providers>
      </body>
    </html>
  )
}
