import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

const VERTICAL_LABELS = {
  sba: 'artisan food & drink producer', collection: 'museum, gallery, or collection',
  craft: 'maker or artisan studio', fine_grounds: 'specialty coffee roaster',
  rest: 'boutique accommodation', field: 'outdoor or nature destination',
  corner: 'independent retail shop', found: 'vintage, antique, or secondhand shop',
  table: 'independent restaurant or cafe',
}

async function generateDescription(candidate) {
  const type = VERTICAL_LABELS[candidate.vertical] || 'venue'
  const prompt = `Write a 2–3 sentence editorial description for "${candidate.name}", a ${type} in ${candidate.region || 'Australia'}. ${candidate.notes ? `Context: ${candidate.notes}` : ''}

Tone: warm, concise, editorial — like a curated travel guide. Focus on what makes the place distinctive. Do not invent specific details you don't know. Do not include the venue name in the description. Return only the description text, nothing else.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) return null
    const result = await res.json()
    return result.content?.[0]?.text?.trim() || null
  } catch {
    return null
  }
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// PATCH — update candidate fields (inline editing auto-save)
export async function PATCH(request, { params }) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Missing candidate ID' }, { status: 400 })
  }

  try {
    const body = await request.json()

    // Only allow updating safe fields
    const allowed = ['name', 'vertical', 'region', 'website_url', 'description', 'notes', 'confidence']
    const updates = {}
    for (const key of allowed) {
      if (key in body) updates[key] = body[key]
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    const { data, error } = await sb
      .from('listing_candidates')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ candidate: data })
  } catch (err) {
    console.error('[admin/candidates/PATCH] Error:', err.message)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}

// POST — approve or reject a candidate
export async function POST(request, { params }) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Missing candidate ID' }, { status: 400 })
  }

  try {
    const { action } = await request.json()

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action — must be approve or reject' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    if (action === 'reject') {
      const { error } = await sb
        .from('listing_candidates')
        .update({
          status: 'rejected',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (error) throw error

      return NextResponse.json({ success: true, action: 'rejected' })
    }

    if (action === 'approve') {
      // 1. Fetch the candidate
      const { data: candidate, error: fetchError } = await sb
        .from('listing_candidates')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError || !candidate) {
        return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
      }

      // 2. Generate description if missing
      let description = candidate.description || null
      if (!description) {
        description = await generateDescription(candidate)
      }

      // 3. Create a draft listing in the listings table
      const slug = slugify(candidate.name)
      const sourceId = `candidate-${candidate.id}`

      const listingData = {
        vertical: candidate.vertical || 'sba',
        source_id: sourceId,
        name: candidate.name,
        slug,
        description,
        region: candidate.region || null,
        website: candidate.website_url || null,
        status: 'pending', // draft — needs further enrichment
        is_claimed: false,
        is_featured: false,
      }

      const { data: listing, error: insertError } = await sb
        .from('listings')
        .insert(listingData)
        .select('id')
        .single()

      if (insertError) {
        // If it's a unique constraint violation, the listing may already exist
        if (insertError.code === '23505') {
          return NextResponse.json({ error: 'A listing with this name already exists for this vertical' }, { status: 409 })
        }
        throw insertError
      }

      // 4. Mark candidate as converted
      const { error: updateError } = await sb
        .from('listing_candidates')
        .update({
          status: 'converted',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (updateError) {
        console.error('[admin/candidates/approve] Failed to update candidate status:', updateError.message)
        // Non-fatal — listing was already created
      }

      return NextResponse.json({
        success: true,
        action: 'approved',
        listingId: listing.id,
      })
    }
  } catch (err) {
    console.error('[admin/candidates/POST] Error:', err.message)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}
