import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'your_supabase_url_here',
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'your_supabase_anon_key_here'
)
