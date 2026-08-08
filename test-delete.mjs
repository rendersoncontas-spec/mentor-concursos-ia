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

console.log('SUPABASE URL:', env['NEXT_PUBLIC_SUPABASE_URL'] ? 'SET' : 'UNSET')
console.log('SUPABASE KEY:', env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ? 'SET' : 'UNSET')

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['NEXT_PUBLIC_SUPABASE_ANON_KEY'])

async function run() {
  const { data, error } = await supabase.from('user_targets').select('*').limit(2)
  
  if (data && data.length > 0) {
    console.log('Trying to delete target:', data[0].id)
    const res = await supabase.from('user_targets').delete().eq('id', data[0].id)
    console.log('delete res:', JSON.stringify(res, null, 2))
  } else {
    console.log('no targets')
  }
}
run()
