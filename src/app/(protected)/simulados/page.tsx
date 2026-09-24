import { SimuladosView } from "@/features/simulados/components/simulados-view"

export const metadata = {
  title: "Simulados",
  description: "Acompanhe e registre seu desempenho em simulados no NomeIA.",
}

export default function SimuladosPage() {
  // O cabeçalho fixo (com a ação "Registrar simulado") é renderizado pela view.
  return (
    <div className="flex flex-col min-h-full">
      <SimuladosView />
    </div>
  )
}
