"use server"

import { type WidgetConfigItem } from "@/domain/dashboard/dashboard.types"
import { createClient } from "@/infrastructure/supabase/server"

// Separação de configuração e server actions
function getDashboardLayoutConfig(): WidgetConfigItem[] {
  return [
    { widget_id: "tempo_estudo", position_order: 1, col_span: 1 as const, visible: true },
    { widget_id: "desempenho", position_order: 2, col_span: 1 as const, visible: true },
    { widget_id: "progresso_edital", position_order: 3, col_span: 1 as const, visible: true },
    { widget_id: "constancia", position_order: 4, col_span: 1 as const, visible: true },
    { widget_id: "estudos_hoje", position_order: 5, col_span: 3 as const, visible: true },
    { widget_id: "questoes", position_order: 6, col_span: 1 as const, visible: true },
    { widget_id: "revisoes", position_order: 7, col_span: 1 as const, visible: true },
    { widget_id: "desempenho_materia", position_order: 8, col_span: 2 as const, visible: true },
    { widget_id: "ultimas_atividades", position_order: 9, col_span: 1 as const, visible: true },
    { widget_id: "metas_estudo", position_order: 10, col_span: 1 as const, visible: true },
    { widget_id: "ranking", position_order: 11, col_span: 1 as const, visible: true },
    { widget_id: "conquistas", position_order: 12, col_span: 1 as const, visible: true },
    { widget_id: "data_prova", position_order: 13, col_span: 1 as const, visible: true },
    { widget_id: "lembretes", position_order: 14, col_span: 1 as const, visible: true },
    { widget_id: "mensagem_dia", position_order: 15, col_span: 1 as const, visible: false },
    { widget_id: "calendario", position_order: 16, col_span: 1 as const, visible: true },
  ]
}

export async function getDashboardLayoutAction(): Promise<{
  success: boolean
  data: WidgetConfigItem[]
}> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: true, data: getDashboardLayoutConfig() }

    const { data, error } = await supabase
      .from("user_dashboard_layouts")
      .select("widget_id, position_order, col_span, row_span, visible")
      .eq("user_id", user.id)
      .order("position_order")

    if (error || !data || data.length === 0) {
      return { success: true, data: getDashboardLayoutConfig() }
    }

    const loadedLayout: WidgetConfigItem[] = data.map((item) => ({
      widget_id: item.widget_id,
      position_order: item.position_order,
      col_span: Math.min(3, Math.max(1, item.col_span)) as 1 | 2 | 3,
      row_span: item.row_span || 1,
      visible: item.visible,
    }))

    // Garante que novos widgets criados no futuro estejam presentes na lista do usuário
    const existingIds = new Set(loadedLayout.map((w) => w.widget_id))
    getDashboardLayoutConfig().forEach((defaultW) => {
      if (!existingIds.has(defaultW.widget_id)) {
        loadedLayout.push({ ...defaultW, position_order: loadedLayout.length + 1 })
      }
    })

    return { success: true, data: loadedLayout.sort((a, b) => a.position_order - b.position_order) }
  } catch (err) {
    console.error("Erro ao carregar layout do dashboard:", err)
    return { success: true, data: getDashboardLayoutConfig() }
  }
}

export async function saveDashboardLayoutAction(
  layoutItems: WidgetConfigItem[],
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Usuário não autenticado." }

    const recordsToUpsert = layoutItems.map((item, index) => ({
      user_id: user.id,
      widget_id: item.widget_id,
      position_order: index + 1,
      col_span: item.col_span,
      row_span: item.row_span || 1,
      visible: item.visible,
      updated_at: new Date().toISOString(),
    }))

    const { error } = await supabase
      .from("user_dashboard_layouts")
      .upsert(recordsToUpsert, { onConflict: "user_id,widget_id" })

    if (error) {
      console.error("Erro ao salvar layout no Supabase:", error)
      return { success: false, error: "Falha ao salvar no banco de dados." }
    }

    return { success: true }
  } catch (err) {
    console.error("Erro em saveDashboardLayoutAction:", err)
    return { success: false, error: "Erro interno ao salvar preferências." }
  }
}

export async function resetDashboardLayoutAction(): Promise<{
  success: boolean
  data: WidgetConfigItem[]
  error?: string
}> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      await supabase.from("user_dashboard_layouts").delete().eq("user_id", user.id)
    }
    return { success: true, data: getDashboardLayoutConfig() }
  } catch (err) {
    console.error("Erro em resetDashboardLayoutAction:", err)
    return { success: true, data: getDashboardLayoutConfig() }
  }
}
