import localFont from "next/font/local"

// Fontes vendorizadas localmente (arquivos .woff2 em ./fonts) em vez de
// next/font/google: o build de produção não pode depender de acesso de
// rede a fonts.googleapis.com. Mesmas famílias e faixas de peso variável
// que já estavam em uso (Inter 100-900, JetBrains Mono 100-800), obtidas
// via @fontsource-variable (SIL Open Font License — ver LICENSE-*.txt
// nesta pasta) e mantidas como arquivos estáticos no repositório para que
// o build nunca precise buscar nada externamente.
export const fontSans = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  variable: "--font-sans",
  weight: "100 900",
  style: "normal",
  display: "swap",
})

export const fontMono = localFont({
  src: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-mono",
  weight: "100 800",
  style: "normal",
  display: "swap",
})
