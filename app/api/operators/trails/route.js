import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

// ── Helper: authenticate and return operator ─────────────────────────────────
async function getAuthenticatedOperator() {
  const supabase = await createAuthServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', status: 401 }

  const sb = getSupabaseAdmin()
  const { data: operator } = await sb
    .from('operator_accounts')
    .select('id, approved')
    .eq('user_id', user.id)
    .single()

  if (!operator) return { error: 'Operator account not found', status: 401 }
  if (!operator.approved) return { error: 'Account not yet approved', status: 403 }

  return { operator, sb }
}

// ── POST: Create trail ───────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const auth = await getAuthenticatedOperator()
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const { operator, sb } = auth

    const { name, description, days, region, trail_data } = await request.json()

    if (!name) {
      return NextResponse.json({ error: 'Trail name is required' }, { status: 400 })
    }

    const { data: trail, error: insertError } = await sb
      .from('operator_trails')
      .insert({
        operator_id: operator.id,
        name,
        description: description || null,
        days: days || null,
        region: region || null,
        trail_data: trail_data || null,
      })
      .select()
      .single()

    if (insertError) {
      console.error('[operators/trails] Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create trail' }, { status: 500 })
    }

    // Log activity
    await sb.from('operator_activity').insert({
      operator_id: operator.id,
      action: 'trail_created',
      metadata: { trail_id: trail.id, name },
    })

    return NextResponse.json(trail, { status: 201 })
  } catch (err) {
    console.error('[operators/trails] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── PATCH: Update trail ──────────────────────────────────────────────────────
export async function PATCH(request) {
  try {
    const auth = await getAuthenticatedOperator()
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const { operator, sb } = auth

    const { trail_id, name, description, days, region, trail_data, is_public } = await request.json()

    if (!trail_id) {
      return NextResponse.json({ error: 'trail_id is required' }, { status: 400 })
    }

    // Verify ownership
    const { data: existing } = await sb
      .from('operator_trails')
      .select('id')
      .eq('id', trail_id)
      .eq('operator_id', operator.id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Trail not found' }, { status: 404 })
    }

    // Build update object with only provided fields
    const updates = {}
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (days !== undefined) updates.days = days
    if (region !== undefined) updates.region = region
    if (trail_data !== undefined) updates.trail_data = trail_data
    if (is_public !== undefined) updates.is_public = is_public

    const { data: updated, error: updateError } = await sb
      .from('operator_trails')
      .update(updates)
      .eq('id', trail_id)
      .eq('operator_id', operator.id)
      .select()
      .single()

    if (updateError) {
      console.error('[operators/trails] Update error:', updateError)
      return NextResponse.json({ error: 'Failed to update trail' }, { status: 500 })
    }

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[operators/trails] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── DELETE: Remove trail ─────────────────────────────────────────────────────
export async function DELETE(request) {
  try {
    const auth = await getAuthenticatedOperator()
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const { operator, sb } = auth

    const { trail_id } = await request.json()

    if (!trail_id) {
      return NextResponse.json({ error: 'trail_id is required' }, { status: 400 })
    }

    // Verify ownership
    const { data: existing } = await sb
      .from('operator_trails')
      .select('id')
      .eq('id', trail_id)
      .eq('operator_id', operator.id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Trail not found' }, { status: 404 })
    }

    const { error: deleteError } = await sb
      .from('operator_trails')
      .delete()
      .eq('id', trail_id)
      .eq('operator_id', operator.id)

    if (deleteError) {
      console.error('[operators/trails] Delete error:', deleteError)
      return NextResponse.json({ error: 'Failed to delete trail' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[operators/trails] DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
