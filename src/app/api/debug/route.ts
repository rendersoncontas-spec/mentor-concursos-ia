import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
export async function GET(_request: Request) {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY']

  if (url && key) {
    createClient(url, key)
  }

  return NextResponse.json({ error: 'Need service role key' });
}
