import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

// Load .env.local manually
const envPath = path.resolve(process.cwd(), '.env.local')
let envVars: Record<string, string> = {}

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8')
  content.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
    if (match) {
      let value = match[2] || ''
      if (value.length > 0 && value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1)
      }
      if (match[1]) envVars[match[1]] = value
    }
  })
}

const url = envVars['NEXT_PUBLIC_SUPABASE_URL'] || process.env['NEXT_PUBLIC_SUPABASE_URL']
const key = envVars['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']

console.log('Connecting to Supabase at:', url)

const supabase = createClient(url!, key!)

async function run() {
  console.log('=== 1. FETCHING ALL STUDY CYCLES ===')
  const { data: cycles, error: cycleErr } = await supabase.from('study_cycles').select('*')
  console.log('Cycles count:', cycles?.length, 'Error:', cycleErr)
  console.log('Cycles:', JSON.stringify(cycles, null, 2))

  console.log('\n=== 2. FETCHING ALL STUDY CYCLE ITEMS ===')
  const { data: items, error: itemsErr } = await supabase.from('study_cycle_items').select('*, discipline:disciplines(id, name)')
  console.log('Items count:', items?.length, 'Error:', itemsErr)
  console.log('Items:', JSON.stringify(items, null, 2))

  console.log('\n=== 3. FETCHING ALL STUDY CYCLE SESSIONS ===')
  const { data: sessions, error: sessErr } = await supabase.from('study_cycle_sessions').select('*')
  console.log('Sessions count:', sessions?.length, 'Error:', sessErr)
  console.log('Sessions:', JSON.stringify(sessions, null, 2))

  console.log('\n=== 4. FETCHING RECENT STUDY HISTORY ===')
  const { data: history, error: histErr } = await supabase
    .from('study_history')
    .select('id, discipline_id, duration_minutes, study_source, started_at, disciplines(name)')
    .order('started_at', { ascending: false })
    .limit(20)
  console.log('History count:', history?.length, 'Error:', histErr)
  console.log('History:', JSON.stringify(history, null, 2))

  console.log('\n=== 5. FETCHING ALL DISCIPLINES ===')
  const { data: disciplines, error: discErr } = await supabase.from('disciplines').select('id, name')
  console.log('Disciplines count:', disciplines?.length, 'Error:', discErr)
  console.log('Disciplines:', JSON.stringify(disciplines, null, 2))

  console.log('\n=== 6. CHECKING V2 MIGRATION: study_cycle_sessions columns ===')
  const { data: colTest, error: colErr } = await supabase
    .from('study_cycle_sessions')
    .select('round_number, minutes_contributed, extra_minutes, discipline_id')
    .limit(1)
  if (colErr) {
    console.log('V2 COLUMNS MISSING OR ERROR:', colErr.message)
    console.log('>>> YOU NEED TO RUN docs/study-cycles-v2-migration.sql IN SUPABASE SQL EDITOR <<<')
  } else {
    console.log('V2 COLUMNS EXIST OK. Sample:', JSON.stringify(colTest))
  }
}

run()
