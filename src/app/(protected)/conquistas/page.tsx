import { ConquistasView } from "@/features/conquistas/components/conquistas-view"

export const metadata = {
  title: "Minhas Conquistas",
  description: "Acompanhe suas conquistas, medalhas e marcos de estudo no NomeIA.",
}

export default function ConquistasPage() {
  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 p-4 sm:p-5 md:p-6 w-full max-w-full">
        <ConquistasView />
      </div>
    </div>
  )
}
