import { createClient } from "@supabase/supabase-js"
const supabase = createClient("https://snlwfnwjrcqtlilhwgfm.supabase.co", "sb_publishable_4NFpJ30EZ9MZwPBJjr4blg_Wd6cbFjb")

const TABLE_COLS = {
  study_cycles: ["id", "user_id", "name", "contest_name", "edital_name", "status", "current_item_index", "current_round", "total_rounds_done", "current_item_progress_min", "created_at", "updated_at"],
  study_cycle_items: ["id", "cycle_id", "discipline_id", "order", "priority", "difficulty", "planned_minutes", "completed_minutes", "status", "last_studied_at", "created_at", "updated_at"],
  study_cycle_sessions: ["id", "cycle_id", "cycle_item_id", "study_history_id", "round_number", "minutes_contributed", "extra_minutes", "discipline_id", "created_at"],
  study_plans: ["id", "user_id", "version", "plan_type", "status", "name", "description", "total_cycle_minutes", "weekly_minutes", "start_date", "end_date", "parent_plan_id", "plan_group_id", "paused_at", "archived_at", "generated_reason", "active", "generated_at", "created_at"],
  study_plan_items: ["id", "study_plan_id", "discipline_id", "day_of_week", "duration_minutes", "execution_order", "block_status", "priority", "priority_score", "recommended_sessions", "created_at"],
  study_history: ["id", "user_id", "discipline_id", "duration_minutes", "started_at", "metadata"],
  disciplines: ["id", "name", "area", "color_hex", "created_at"]
}

async function probe() {
  for (const [table, cols] of Object.entries(TABLE_COLS)) {
    console.log(`\n=== Table: ${table} ===`)
    for (const col of cols) {
      const { error } = await supabase.from(table).select(col).limit(1)
      if (error?.message.includes("could not find the") || error?.message.includes("does not exist")) {
        console.log(`  ${col}: MISSING`)
      } else {
        console.log(`  ${col}: EXISTS`)
      }
    }
  }
}
probe()
