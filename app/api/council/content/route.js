import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { validateCouncilSession } from '@/lib/council-session'

// Council content co-creation. Councils draft itineraries, editorial ideas,
// picks and events for their region, then submit them to the Atlas editorial
// desk. Publishing stays with the editorial team (status: draft → published is
// admin-only), so the network voice remains curated — councils propose, the
// desk disposes. Submission is tracked in metadata (submitted_at) rather than a
// new status value, so no schema change is needed.

const CONTENT_TYPES = ['itinerary', 'editorial', 'pick', 'event']

const TYPE_LABELS = {
  itinerary: 'Itinerary',
  editorial: 'Editorial idea',
  pick: 'Regional pick',
  event: 'Event',
}

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function auth(req) {
  const cookie = req.cookies.get('council_session')
  return validateCouncilSession(cookie?.value)
}

async function managedRegions(sb, councilId) {
  const { data } = await sb
    .from('council_regions')
    .select('regions(id, slug, name)')
    .eq('council_id', councilId)
  return (data || []).map(cr => cr.regions).filter(Boolean)
}

function cleanFields(body) {
  const title = String(body.title || '').trim().slice(0, 200)
  const text = String(body.body || '').trim().slice(0, 20000)
  const type = CONTENT_TYPES.includes(body.content_type) ? body.content_type : null
  return { title, text, type }
}

// POST: create a draft.
export async function POST(req) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { title, text, type } = cleanFields(body)
  if (!title) return NextResponse.json({ error: 'A title is required' }, { status: 400 })
  if (!type) return NextResponse.json({ error: 'Choose a content type' }, { status: 400 })

  const sb = getSupabaseAdmin()

  // Optional region attachment — validated against the council's own regions.
  let regionId = null
  if (body.region_slug) {
    const regions = await managedRegions(sb, session.councilId)
    regionId = regions.find(r => r.slug === body.region_slug)?.id || null
  }

  const { data, error } = await sb
    .from('council_content')
    .insert({
      council_id: session.councilId,
      region_id: regionId,
      content_type: type,
      title,
      body: text,
      status: 'draft',
      metadata: {},
    })
    .select('*')
    .single()

  if (error) {
    console.error('Council content create error:', error.message)
    return NextResponse.json({ error: 'Could not save the draft' }, { status: 500 })
  }

  try {
    await sb.from('council_activity').insert({
      council_id: session.councilId,
      action: 'content_created',
      metadata: { content_id: data.id, content_type: type },
    })
  } catch { /* non-fatal */ }

  return NextResponse.json({ content: data })
}

// PATCH: update a draft, or submit/withdraw it to/from the editorial desk.
export async function PATCH(req) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const id = body.id
  if (!id) return NextResponse.json({ error: 'Missing content id' }, { status: 400 })

  const sb = getSupabaseAdmin()

  // Ownership + editability gate: councils can only touch their own drafts.
  // Published/archived rows belong to the editorial desk.
  const { data: existing } = await sb
    .from('council_content')
    .select('*')
    .eq('id', id)
    .eq('council_id', session.councilId)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status !== 'draft') {
    return NextResponse.json({ error: 'Only drafts can be edited' }, { status: 409 })
  }

  const updates = {}

  if (body.action === 'submit') {
    updates.metadata = { ...(existing.metadata || {}), submitted_at: new Date().toISOString() }
  } else if (body.action === 'withdraw') {
    const meta = { ...(existing.metadata || {}) }
    delete meta.submitted_at
    updates.metadata = meta
  } else {
    const { title, text, type } = cleanFields(body)
    if (body.title !== undefined) {
      if (!title) return NextResponse.json({ error: 'A title is required' }, { status: 400 })
      updates.title = title
    }
    if (body.body !== undefined) updates.body = text
    if (body.content_type !== undefined) {
      if (!type) return NextResponse.json({ error: 'Invalid content type' }, { status: 400 })
      updates.content_type = type
    }
    if (body.region_slug !== undefined) {
      const regions = await managedRegions(sb, session.councilId)
      updates.region_id = regions.find(r => r.slug === body.region_slug)?.id || null
    }
  }

  const { data, error } = await sb
    .from('council_content')
    .update(updates)
    .eq('id', id)
    .eq('council_id', session.councilId)
    .select('*')
    .single()

  if (error) {
    console.error('Council content update error:', error.message)
    return NextResponse.json({ error: 'Could not save changes' }, { status: 500 })
  }

  // Submission side-effects: activity log + editorial-desk email (best-effort).
  if (body.action === 'submit') {
    try {
      await sb.from('council_activity').insert({
        council_id: session.councilId,
        action: 'content_submitted',
        metadata: { content_id: id, content_type: existing.content_type },
      })
    } catch { /* non-fatal */ }

    try {
      const { data: council } = await sb
        .from('council_accounts')
        .select('name, contact_email')
        .eq('id', session.councilId)
        .single()
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Australian Atlas <noreply@australianatlas.com.au>',
          to: 'councils@australianatlas.com.au',
          reply_to: council?.contact_email || undefined,
          subject: `Council content submission — ${escapeHtml(council?.name || 'Unknown council')} (${TYPE_LABELS[existing.content_type] || existing.content_type})`,
          html: `
            <h2>New council content submission</h2>
            <p><strong>Council:</strong> ${escapeHtml(council?.name || '—')}</p>
            <p><strong>Type:</strong> ${escapeHtml(TYPE_LABELS[existing.content_type] || existing.content_type)}</p>
            <p><strong>Title:</strong> ${escapeHtml(data.title)}</p>
            <p><strong>Draft:</strong></p>
            <p style="white-space:pre-wrap">${escapeHtml(data.body || '(no body)')}</p>
            <p>Review it in the admin, then publish or reply to the council.</p>
          `,
        }),
      })
      if (!res.ok) console.error('Resend error (council content):', await res.text())
    } catch (err) {
      console.error('Council content email error:', err)
    }
  }

  return NextResponse.json({ content: data })
}

// DELETE: remove one of the council's own drafts.
export async function DELETE(req) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing content id' }, { status: 400 })

  const sb = getSupabaseAdmin()
  const { data: existing } = await sb
    .from('council_content')
    .select('id, status')
    .eq('id', id)
    .eq('council_id', session.councilId)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status !== 'draft') {
    return NextResponse.json({ error: 'Only drafts can be deleted' }, { status: 409 })
  }

  const { error } = await sb
    .from('council_content')
    .delete()
    .eq('id', id)
    .eq('council_id', session.councilId)

  if (error) {
    console.error('Council content delete error:', error.message)
    return NextResponse.json({ error: 'Could not delete the draft' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
