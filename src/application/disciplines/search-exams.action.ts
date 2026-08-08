"use server"

import { createClient } from "@/infrastructure/supabase/server"
import { type Exam } from "@/domain/disciplines/disciplines.types"
import { isMaintenanceMode } from "@/lib/maintenance"

export async function searchExamsAction(query: string): Promise<Exam[]> {
  if (isMaintenanceMode()) return []

  try {
    const supabase = await createClient()

    let dbQuery = supabase
      .from("exams")
      .select("*")
      .eq("active", true)
      .order("name")
      .limit(50)

    if (query && query.trim() !== "") {
      dbQuery = dbQuery.ilike("name", `%${query}%`)
    }

    const { data, error } = await dbQuery

    if (error) {
      console.error("Error searching exams:", error)
      return []
    }

    return data as Exam[]
  } catch (error) {
    console.error("Server error searching exams:", error)
    return []
  }
}
