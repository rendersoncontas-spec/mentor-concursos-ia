import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NomeIA",
    short_name: "NomeIA",
    description:
      "Sua preparação rumo à nomeação. Planejamento, ciclos e histórico de estudos para concursos.",
    start_url: "/dashboard",
    display: "standalone",
    // Fase E: fundo off-white do app (antes: azul-marinho, herança da marca antiga).
    background_color: "#fbfaf9",
    theme_color: "#225951",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  }
}
