import { Library } from "lucide-react"

import { listLibraryMaterialsAction } from "@/application/library/library.action"
import { BibliotecaView } from "@/features/biblioteca/components/biblioteca-view"
import { PageHeader } from "@/components/ui/page-header"

export const metadata = {
  title: "Biblioteca",
  description: "Organize seus materiais de estudo, PDFs, resumos e links no NomeIA.",
}

export const dynamic = "force-dynamic"

export default async function BibliotecaPage() {
  // Fase F (performance): a lista sai com a página. Em erro, a tela busca
  // sozinha no navegador como antes (e mostra a mensagem de erro).
  const result = await listLibraryMaterialsAction()
  const initialMaterials = result.success && result.data ? result.data : null

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        icon={Library}
        title="Biblioteca"
        description="Central de materiais de apoio e resumos"
      />

      <div className="flex-1 page-container py-5">
        <BibliotecaView initialMaterials={initialMaterials} />
      </div>
    </div>
  )
}
