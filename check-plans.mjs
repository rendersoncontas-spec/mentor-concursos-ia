import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envFile = fs.readFileSync('.env.local', 'utf8')
const env = {}
envFile.split(/\r?\n/).forEach(line => {
  if (line && line.includes('=')) {
    const [k, ...v] = line.split('=')
    env[k.trim()] = v.join('=').trim().replace(/^"|"$/g, '')
  }
})

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'])

async function run() {
  const { data: plans } = await supabase.from('study_plans').select('*')
  console.log('Plans:', plans)
  const { data: items } = await supabase.from('study_plan_items').select('*')
  console.log('Items length:', items?.length)
  console.log('Days of week:', [...new Set(items?.map(i => i.day_of_week))])
}
run()
