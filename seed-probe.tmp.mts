import { createClient } from "@supabase/supabase-js"

const url = "https://snlwfnwjrcqtlilhwgfm.supabase.co"
const key = "sb_publishable_4NFpJ30EZ9MZwPBJjr4blg_Wd6cbFjb"
const supabase = createClient(url, key)

async function probeTable(table: string, payload: any) {
  const { data, error } = await supabase.from(table).insert(payload).select()
  console.log(`\n[${table}] INSERT result:`)
  if (error) console.log("  error:", error.message, "| details:", error.details ?? "")
  else console.log("  ok:", JSON.stringify(data)?.slice(0, 300))
}

async function main() {
  // Test 1: profiles (precisamos de user_id válido — UUIDs sintéticos)
  const fakeUserId = "00000000-0000-4000-8000-000000000001"
  await probeTable("profiles", {
    id: fakeUserId,
    email: "seed-test-1@example.com",
    name: "Seed Test User 1",
  })

  // Test 2: disciplines
  await probeTable("disciplines", {
    name: "Seed Direito Constitucional",
    area: "Direito",
  })
}

main()
