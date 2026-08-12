import { createServerClient } from "@supabase/ssr";
import type { cookies } from "next/headers";

const supabaseUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const supabaseKey = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];

export const createClient = (cookieStore: Awaited<ReturnType<typeof cookies>>) => {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables")
  }
  return createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // ignore when called from Server Component
          }
        },
      },
    }
  );
};
