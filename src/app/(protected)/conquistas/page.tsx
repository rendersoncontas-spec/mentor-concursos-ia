import { ConquistasView } from "@/features/conquistas/components/estudei-conquistas-view"

export const metadata = {
  title: "Minhas Conquistas",
  description: "Acompanhe suas conquistas, medalhas e marcos de estudo no Nomeia.",
}

export default function ConquistasPage() {
  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
        <ConquistasView />
      </div>
    </div>
  )
}
