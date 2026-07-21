import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { diagnoseAccess, sendSignInLink } from '@/lib/admin/accessDoctor'

// Admin break-glass console for operator lockout reports.
//   GET  ?email=…                              → full access diagnosis
//   POST { email, action: 'send_magic_link', next? } → email a branded magic
//        sign-in link (auto-creates the account if none exists)
// Auth: admin session cookie (atlas_admin JWT), same as every /api/admin route.

export async function GET(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const email = new URL(request.url).searchParams.get('email')
  const result = await diagnoseAccess(email)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result)
}

export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (body?.action !== 'send_magic_link') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
  const result = await sendSignInLink(body.email, body.next)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json({ success: true })
}
