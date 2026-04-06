import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function POST() {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Run DDL via the Supabase Management API (pg-meta)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  const sql = `
    ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS humanised boolean DEFAULT false;
    ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS humanised_at timestamptz;
    CREATE INDEX IF NOT EXISTS idx_listings_humanised ON public.listings (humanised) WHERE humanised = false;
  `

  // Use the pg-meta SQL query endpoint
  const res = await fetch(`${url}/pg/query`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'X-Connection-Encrypted': '1',
    },
    body: JSON.stringify({ query: sql }),
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: 'Migration failed', detail: text }, { status: 500 })
  }

  const data = await res.json()
  return NextResponse.json({ message: 'Migration complete', data })
}
