import { EstudeiConquistasView } from "@/features/conquistas/components/estudei-conquistas-view"

export const metadata = {
  title: "Minhas Conquistas - Mentor IA",
  description: "Acompanhe suas conquistas, medalhas e marcos de estudo na plataforma.",
}

export default function ConquistasPage() {
  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
        <EstudeiConquistasView />
      </div>
    </div>
  )
}
