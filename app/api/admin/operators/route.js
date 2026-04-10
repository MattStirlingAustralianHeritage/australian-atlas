import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

function slugify(text) {
  return text.toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// ── GET: List all operators ──────────────────────────────────────────────────
export async function GET() {
  try {
    const cookieStore = await cookies()
    if (!(await checkAdmin(cookieStore))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sb = getSupabaseAdmin()
    const { data: operators, error } = await sb
      .from('operator_accounts')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[admin/operators] GET error:', error)
      return NextResponse.json({ error: 'Failed to fetch operators' }, { status: 500 })
    }

    return NextResponse.json({ operators: operators || [] })
  } catch (err) {
    console.error('[admin/operators] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── PATCH: Update operator (approve, change tier/status) ─────────────────────
export async function PATCH(request) {
  try {
    const cookieStore = await cookies()
    if (!(await checkAdmin(cookieStore))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { operator_id, action, ...payload } = await request.json()

    if (!operator_id || !action) {
      return NextResponse.json({ error: 'operator_id and action are required' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    // Verify operator exists
    const { data: existing } = await sb
      .from('operator_accounts')
      .select('id')
      .eq('id', operator_id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Operator not found' }, { status: 404 })
    }

    let updates = {}

    switch (action) {
      case 'set_approved':
        updates.approved = payload.approved !== undefined ? payload.approved : true
        break
      case 'update_tier':
        if (!payload.tier || !['starter', 'pro'].includes(payload.tier)) {
          return NextResponse.json({ error: 'Invalid tier. Must be starter or pro.' }, { status: 400 })
        }
        updates.tier = payload.tier
        break
      case 'update_status':
        if (!payload.status) {
          return NextResponse.json({ error: 'status is required' }, { status: 400 })
        }
        updates.status = payload.status
        break
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }

    const { data: updated, error: updateError } = await sb
      .from('operator_accounts')
      .update(updates)
      .eq('id', operator_id)
      .select()
      .single()

    if (updateError) {
      console.error('[admin/operators] PATCH error:', updateError)
      return NextResponse.json({ error: 'Failed to update operator' }, { status: 500 })
    }

    return NextResponse.json({ operator: updated })
  } catch (err) {
    console.error('[admin/operators] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── POST: Admin-created operator (no auth user, no password) ─────────────────
export async function POST(request) {
  try {
    const cookieStore = await cookies()
    if (!(await checkAdmin(cookieStore))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { business_name, contact_name, contact_email, operator_type, tier, status } = await request.json()

    if (!business_name || !contact_name || !contact_email) {
      return NextResponse.json(
        { error: 'business_name, contact_name, and contact_email are required' },
        { status: 400 }
      )
    }

    const sb = getSupabaseAdmin()

    // Generate unique slug
    let slug = slugify(business_name)
    const { data: existing } = await sb
      .from('operator_accounts')
      .select('slug')
      .eq('slug', slug)
      .maybeSingle()

    if (existing) {
      const suffix = Math.random().toString(36).substring(2, 6)
      slug = `${slug}-${suffix}`
    }

    const { data: operator, error: insertError } = await sb
      .from('operator_accounts')
      .insert({
        business_name,
        slug,
        contact_name,
        contact_email,
        operator_type: operator_type || null,
        tier: tier || null,
        status: status || 'trial',
        approved: true,
        // No user_id — admin-created operator without Supabase auth
      })
      .select()
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'An operator with this email or slug already exists' },
          { status: 409 }
        )
      }
      console.error('[admin/operators] POST error:', insertError)
      return NextResponse.json({ error: 'Failed to create operator' }, { status: 500 })
    }

    return NextResponse.json({ operator }, { status: 201 })
  } catch (err) {
    console.error('[admin/operators] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
