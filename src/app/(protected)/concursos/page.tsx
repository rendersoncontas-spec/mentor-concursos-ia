import { GraduationCap } from "lucide-react"

import type { ConcursoData } from "@/application/concursos/concurso.action"
import { ConcursosManagerView } from "@/features/concursos/components/concursos-manager-view"
import { createClient } from "@/infrastructure/supabase/server"

export const metadata = {
  title: "Concursos",
  description: "Gerencie todos os seus concursos e editais em um só lugar no Nomeia.",
}

interface RawMeta {
  examName?: string | null
  role?: string | null
  banca?: string | null
  examDate?: string | null
  examTime?: string | null
  examLocation?: string | null
  examPdfUrl?: string | null
  archived?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseRowMeta(raw: any): RawMeta {
  if (!raw || typeof raw !== "string") return {}
  try {
    if (raw.startsWith("{")) return JSON.parse(raw) as RawMeta
  } catch {
    /* noop */
  }
  return {}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRowToConcurso(row: any): ConcursoData {
  const meta = parseRowMeta(row.main_study_source)
  const exam_date = meta.examDate || (row.exam_date as string | null) || null

  let days_remaining: number | null = null
  if (exam_date) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const target = new Date(exam_date + "T00:00:00")
    days_remaining = Math.ceil((target.getTime() - today.getTime()) / 86400000)
  }

  return {
    id: row.id as string,
    name: meta.examName || (row.target_exam as string) || "Concurso",
    role: meta.role || (row.target_role as string) || "",
    banca: meta.banca || "",
    exam_date,
    exam_time: meta.examTime || null,
    exam_location: meta.examLocation || null,
    exam_pdf_url: meta.examPdfUrl || null,
    is_active: Boolean(row.is_active),
    is_archived: Boolean(meta.archived),
    days_remaining,
    created_at: row.created_at as string,
  }
}

async function getConcursos(): Promise<ConcursoData[]> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return []

    const { data } = await supabase
      .from("user_targets")
      .select("*")
      .eq("user_id", user.id)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false })

    return (data || []).map((row) => mapRowToConcurso(row))
  } catch {
    return []
  }
}

export default async function ConcursosPage() {
  const concursos = await getConcursos()

  return (
    <div className="flex flex-col min-h-full">
      {/* Page Header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-sm border-b px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <GraduationCap className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-bold leading-none">Concursos</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Gerencie seus concursos e editais
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 md:p-6">
        <ConcursosManagerView initialConcursos={concursos} />
      </div>
    </div>
  )
}
