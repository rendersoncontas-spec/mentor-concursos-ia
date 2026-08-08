import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getDashboardData } from '@/application/dashboard/dashboard.service';

export async function GET(request: Request) {
  const supabase = createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']! // Oops I don't have service role key. Let's use anon key but we can't bypass RLS.
  );
  
  return NextResponse.json({ error: 'Need service role key' });
}
