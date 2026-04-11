import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

// GET — list users with inline_edit_access
export async function GET() {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('profiles')
    .select('id, email, full_name, role, inline_edit_access')
    .eq('inline_edit_access', true)
    .order('email')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ users: data || [] })
}

// POST — toggle inline_edit_access by email
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { email, grant } = await request.json()
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

  const sb = getSupabaseAdmin()

  // Find the profile by email
  const { data: profile, error: findError } = await sb
    .from('profiles')
    .select('id, email, full_name, role, inline_edit_access')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()

  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 })
  if (!profile) return NextResponse.json({ error: `No user found with email: ${email}` }, { status: 404 })

  const newValue = grant !== undefined ? !!grant : !profile.inline_edit_access

  const { error: updateError } = await sb
    .from('profiles')
    .update({ inline_edit_access: newValue })
    .eq('id', profile.id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({
    user: { ...profile, inline_edit_access: newValue },
    message: `${newValue ? 'Granted' : 'Revoked'} edit access for ${email}`,
  })
}
