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

// ── POST: Create collection ──────────────────────────────────────────────────
export async function POST(request) {
  try {
    const auth = await getAuthenticatedOperator()
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const { operator, sb } = auth

    const { name, description, region, listing_ids } = await request.json()

    if (!name) {
      return NextResponse.json({ error: 'Collection name is required' }, { status: 400 })
    }

    const { data: collection, error: insertError } = await sb
      .from('operator_collections')
      .insert({
        operator_id: operator.id,
        name,
        description: description || null,
        region: region || null,
        listing_ids: listing_ids || [],
      })
      .select()
      .single()

    if (insertError) {
      console.error('[operators/collections] Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create collection' }, { status: 500 })
    }

    // Log activity
    await sb.from('operator_activity').insert({
      operator_id: operator.id,
      action: 'collection_created',
      metadata: { collection_id: collection.id, name },
    })

    return NextResponse.json(collection, { status: 201 })
  } catch (err) {
    console.error('[operators/collections] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── PATCH: Update collection ─────────────────────────────────────────────────
export async function PATCH(request) {
  try {
    const auth = await getAuthenticatedOperator()
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const { operator, sb } = auth

    const { collection_id, name, description, region, listing_ids, listing_order, is_public } = await request.json()

    if (!collection_id) {
      return NextResponse.json({ error: 'collection_id is required' }, { status: 400 })
    }

    // Verify ownership
    const { data: existing } = await sb
      .from('operator_collections')
      .select('id')
      .eq('id', collection_id)
      .eq('operator_id', operator.id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    // Build update object with only provided fields
    const updates = {}
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (region !== undefined) updates.region = region
    if (listing_ids !== undefined) updates.listing_ids = listing_ids
    if (listing_order !== undefined) updates.listing_order = listing_order
    if (is_public !== undefined) updates.is_public = is_public

    const { data: updated, error: updateError } = await sb
      .from('operator_collections')
      .update(updates)
      .eq('id', collection_id)
      .eq('operator_id', operator.id)
      .select()
      .single()

    if (updateError) {
      console.error('[operators/collections] Update error:', updateError)
      return NextResponse.json({ error: 'Failed to update collection' }, { status: 500 })
    }

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[operators/collections] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── DELETE: Remove collection ────────────────────────────────────────────────
export async function DELETE(request) {
  try {
    const auth = await getAuthenticatedOperator()
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const { operator, sb } = auth

    const { collection_id } = await request.json()

    if (!collection_id) {
      return NextResponse.json({ error: 'collection_id is required' }, { status: 400 })
    }

    // Verify ownership
    const { data: existing } = await sb
      .from('operator_collections')
      .select('id')
      .eq('id', collection_id)
      .eq('operator_id', operator.id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    const { error: deleteError } = await sb
      .from('operator_collections')
      .delete()
      .eq('id', collection_id)
      .eq('operator_id', operator.id)

    if (deleteError) {
      console.error('[operators/collections] Delete error:', deleteError)
      return NextResponse.json({ error: 'Failed to delete collection' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[operators/collections] DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
