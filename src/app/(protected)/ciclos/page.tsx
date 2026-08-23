import type { Metadata } from "next"

import { StudyCyclesView } from "@/features/study-cycle/components/study-cycles-view"

export const metadata: Metadata = {
  title: "Ciclos de Estudo",
  description: "Organize suas matérias em uma sequência contínua de estudos no NomeIA.",
}

export default function CiclosPage() {
  return <StudyCyclesView />
}
