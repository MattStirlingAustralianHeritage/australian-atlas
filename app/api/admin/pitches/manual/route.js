import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { runManualPipeline } from '@/lib/pitch/manual/pipeline.mjs'

// Research runs a website fetch + up to two LLM compositions + two prose-verify
// calls, so allow the same budget as the other admin LLM-gate routes.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const VALID_VERTICALS = new Set([
  'sba', 'collection', 'craft', 'fine_grounds', 'rest',
  'field', 'corner', 'found', 'table', 'way',
])

// ─── POST — research a manual pitch, or keep an approved one ────────
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

  const action = body?.action
  if (action === 'research') return handleResearch(body)
  if (action === 'keep') return handleKeep(body)
  return NextResponse.json({ error: 'Invalid action — must be research or keep' }, { status: 400 })
}

// ─── action=research ───────────────────────────────────────────────
async function handleResearch(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return NextResponse.json({ error: 'A place name is required to research a pitch.' }, { status: 400 })
  }

  const listingRef = typeof body?.listingRef === 'string' ? body.listingRef.trim() : ''
  const slotType = body?.slotType === 'new_producer' ? 'new_producer' : 'general'
  let website = typeof body?.website === 'string' ? body.website.trim() : ''

  const sb = getSupabaseAdmin()

  // Resolve the optional Atlas listing reference (slug, place URL, or id).
  let listing = null
  if (listingRef) {
    try {
      listing = await resolveListing(sb, listingRef)
    } catch (err) {
      console.error('[admin/pitches/manual] Listing lookup failed:', err.message)
      return NextResponse.json({ error: `Listing lookup failed: ${err.message}` }, { status: 500 })
    }
    if (!listing) {
      // A ref was given but matched nothing — surface it rather than silently
      // researching on the website alone, so the operator can fix the ref.
      return NextResponse.json(
        { error: `No Atlas listing matched "${listingRef}". Clear that field to research by website only, or check the slug/URL.` },
        { status: 404 }
      )
    }
  }

  // If no website was typed but the resolved listing carries a verified one,
  // research against it. Listing URLs are never AI-generated, so this is safe.
  if (!website && listing?.website) website = String(listing.website).trim()

  try {
    const result = await runManualPipeline(
      { name, listing, website, slotType },
      { log: (level, msg) => console.log(`[manual-pitch:${level}] ${msg}`) }
    )
    return NextResponse.json({ result })
  } catch (err) {
    console.error('[admin/pitches/manual] Pipeline threw:', err.message)
    return NextResponse.json({ error: `Research failed: ${err.message || 'Unknown error'}` }, { status: 500 })
  }
}

// ─── action=keep ───────────────────────────────────────────────────
async function handleKeep(body) {
  const pitch = body?.pitch && typeof body.pitch === 'object' ? body.pitch : null
  if (!pitch) {
    return NextResponse.json({ error: 'Missing pitch payload to keep.' }, { status: 400 })
  }

  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const headline = typeof pitch.headline === 'string' ? pitch.headline.trim() : ''
  const angle = typeof pitch.angle === 'string' ? pitch.angle.trim() : ''
  if (!name && !headline) {
    return NextResponse.json({ error: 'Nothing to keep — the pitch has no name or headline.' }, { status: 400 })
  }

  const vertical = VALID_VERTICALS.has(body?.vertical) ? body.vertical : null
  const region = typeof body?.region === 'string' && body.region.trim() ? body.region.trim() : null
  const listingId =
    typeof body?.listingId === 'string' && UUID_RE.test(body.listingId.trim())
      ? body.listingId.trim()
      : null

  const sb = getSupabaseAdmin()
  try {
    const { error: ideaErr } = await sb
      .from('story_ideas')
      .insert({
        venue_name: name || headline || null,
        listing_id: listingId,
        vertical,
        region,
        story_angle: headline || angle || null,
        notes: composeNotes(pitch),
        source: 'manual_pitch',
        status: 'in_progress',
      })
    if (ideaErr) throw ideaErr
    return NextResponse.json({ success: true, action: 'kept' })
  } catch (err) {
    console.error('[admin/pitches/manual] Keep failed:', err.message)
    return NextResponse.json({ error: `Keep failed: ${err.message || 'Unknown error'}` }, { status: 500 })
  }
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Resolve a free-text listing reference to a full Atlas listings row.
 * Accepts a row id (uuid), a place URL, or a bare slug. Returns the row or
 * null when nothing matches. select('*') so the fact-checker sees every column.
 */
async function resolveListing(sb, rawRef) {
  const ref = (rawRef || '').trim()
  if (!ref) return null

  // Direct id match — only when uuid-shaped, or Postgres 22P02s on the uuid column.
  if (UUID_RE.test(ref)) {
    const { data, error } = await sb
      .from('listings').select('*').eq('id', ref).limit(1).maybeSingle()
    if (error) throw error
    if (data) return data
  }

  // Otherwise treat it as a slug (pulled from a pasted URL, or typed directly).
  const slug = extractSlugCandidate(ref)
  if (slug) {
    const { data, error } = await sb
      .from('listings').select('*')
      .eq('slug', slug).eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1).maybeSingle()
    if (error) throw error
    if (data) return data
  }

  return null
}

/** Pull a slug candidate from a URL's last path segment, else return the ref. */
function extractSlugCandidate(ref) {
  try {
    const u = new URL(ref.startsWith('http') ? ref : `https://${ref}`)
    const segs = u.pathname.split('/').filter(Boolean)
    if (segs.length) return decodeURIComponent(segs[segs.length - 1])
  } catch {
    // not a URL — fall through
  }
  return ref
}

/**
 * Fold the researched brief into the story_ideas.notes column so the editor
 * sees the angle, the creative framing, and any open research items — not just
 * the headline. Plain text; story_ideas has no structured pitch storage.
 */
function composeNotes(pitch) {
  const parts = []
  const angle = typeof pitch.angle === 'string' ? pitch.angle.trim() : ''
  const framing = typeof pitch.editorial_framing === 'string' ? pitch.editorial_framing.trim() : ''
  if (angle) parts.push(angle)
  if (framing) parts.push(`Editorial framing: ${framing}`)

  if (Array.isArray(pitch.research_needed) && pitch.research_needed.length) {
    const items = pitch.research_needed
      .filter(s => typeof s === 'string' && s.trim())
      .map(s => `  - ${s.trim()}`)
    if (items.length) parts.push(`Research needed before publishing:\n${items.join('\n')}`)
  }

  return parts.length ? parts.join('\n\n') : null
}
