import type { Metadata, Viewport } from "next"

import { Providers } from "@/components/providers"
import { MaintenancePage } from "@/components/system/maintenance-page"
import { isMaintenanceMode } from "@/lib/maintenance"
import { cn } from "@/lib/utils"

import { fontMono, fontSans } from "./fonts"
import "./globals.css"

export const viewport: Viewport = {
  themeColor: "#2563EB",
  width: "device-width",
  initialScale: 1,
}

export const metadata: Metadata = {
  title: {
    template: "%s — NomeIA",
    default: "NomeIA — Sua preparação rumo à nomeação",
  },
  description:
    "Sua preparação rumo à nomeação. Plataforma inteligente de preparação para concursos.",
  keywords: [
    "concursos públicos",
    "nomeia",
    "NomeIA",
    "cronograma de estudo",
    "questões",
    "edital verticalizado",
    "mentoria",
  ],
  authors: [{ name: "Equipe NomeIA" }],
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "https://nomeia.concursos",
    title: "NomeIA — Sua preparação rumo à nomeação",
    description:
      "Sua preparação rumo à nomeação. Plataforma inteligente de preparação para concursos públicos.",
    siteName: "NomeIA",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "NomeIA Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NomeIA — Sua preparação rumo à nomeação",
    description:
      "Sua preparação rumo à nomeação. Plataforma inteligente de preparação para concursos públicos.",
    images: ["/og-image.png"],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const maintenanceMode = isMaintenanceMode()

  return (
    <html lang="pt-BR" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          fontSans.variable,
          fontMono.variable,
        )}
      >
        <Providers attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {maintenanceMode ? <MaintenancePage /> : children}
        </Providers>
      </body>
    </html>
  )
}
