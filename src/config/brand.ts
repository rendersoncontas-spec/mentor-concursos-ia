/**
 * Configurações Centrais de Marca — NomeIA
 * "Sua preparação rumo à nomeação."
 */

export const BRAND = {
  name: "NomeIA",
  tagline: "Sua preparação rumo à nomeação.",
  description:
    "Sua preparação rumo à nomeação. Plataforma inteligente de preparação para concursos.",
  titleTemplate: "%s — NomeIA",
  defaultTitle: "NomeIA — Sua preparação rumo à nomeação",
  defaultEmailFrom: "NomeIA <onboarding@resend.dev>",
  copyright: `© ${new Date().getFullYear()} NomeIA. Todos os direitos reservados.`,
  assets: {
    logo: "/branding/nomeia-logo.png",
    icon: "/branding/nomeia-icon.png",
    favicon: "/favicon.ico",
  },
} as const
