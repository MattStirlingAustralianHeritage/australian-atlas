import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifySharedToken } from '@/lib/shared-auth'
import { isListingPaid } from '@/lib/listing-gallery'
import { guardedAnthropicMessage } from '@/lib/ai/guardedAnthropic'

/**
 * /api/dashboard/story — "Your story, written by the Atlas" (paid perk,
 * migration 210, table operator_stories).
 *
 * The operator answers a short guided interview; Claude drafts a ~200-word
 * story in the Atlas voice grounded ONLY in those answers + the listing's own
 * name/suburb/vertical. The operator reviews, regenerates or approves; the
 * approved story renders on /place/[slug].
 *
 * Auth mirrors /api/dashboard/qna: Bearer shared JWT, vendor|admin, active
 * listing_claims ownership, isListingPaid (past_due grace counts; admin bypass).
 *
 *   GET  ?listing_id=            → { story } (answers, draft, status)
 *   POST { listing_id, action }  → save | generate | approve | retire
 *
 * NOTE: no invented content — the generation prompt is instructed to use only
 * the operator's stated facts. NOTE: pay-to-win guard — the story is an
 * operator-attributed page panel only; nothing here feeds ranking.
 */

const MODEL = 'claude-haiku-4-5-20251001'

export const QUESTIONS = [
  { key: '1', q: 'How did this place come to be? (the origin story)' },
  { key: '2', q: 'What do you make or do here, and how?' },
  { key: '3', q: 'What makes the place itself worth visiting?' },
  { key: '4', q: 'A detail your regulars love?' },
  { key: '5', q: "Who's behind it?" },
  { key: '6', q: 'What does "independent" mean to you?' },
  { key: '7', q: 'What should a first-timer try or see first?' },
]

// Per-instance debounce so a double-click can't fire two paid generations for
// the same listing. The budget governor (guardedAnthropicMessage) is the hard
// monthly cost ceiling; this is just a courtesy throttle.
const lastGen = new Map()
const GEN_DEBOUNCE_MS = 15000

async function authorize(request, listingId) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '') || ''
  if (!token) return { fail: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { valid, user } = await verifySharedToken(token)
  if (!valid || !user) return { fail: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) }
  if (user.role !== 'vendor' && user.role !== 'admin') {
    return { fail: NextResponse.json({ error: 'Vendor role required' }, { status: 403 }) }
  }
  if (!listingId) return { fail: NextResponse.json({ error: 'Missing listing_id' }, { status: 400 }) }

  const sb = getSupabaseAdmin()
  const { data: listing, error } = await sb
    .from('listings')
    .select('id, name, slug, suburb, state, vertical, is_claimed')
    .eq('id', listingId)
    .single()
  if (error || !listing) return { fail: NextResponse.json({ error: 'Listing not found' }, { status: 404 }) }
  if (user.role !== 'admin') {
    const { data: ownClaim } = await sb
      .from('listing_claims')
      .select('id')
      .eq('listing_id', listingId)
      .eq('claimed_by', user.id)
      .eq('status', 'active')
      .maybeSingle()
    if (!ownClaim) return { fail: NextResponse.json({ error: 'You do not own this listing' }, { status: 403 }) }
  }
  return { sb, user, listing }
}

const isPaid = (sb, user, listingId) => (user.role === 'admin' ? Promise.resolve(true) : isListingPaid(sb, listingId))

const VERTICAL_LABELS = {
  sba: 'small-batch producer', collection: 'cultural venue', craft: 'maker/studio',
  fine_grounds: 'coffee roaster/café', rest: 'place to stay', field: 'natural place',
  corner: 'independent shop', found: 'vintage/secondhand', table: 'food producer', way: 'experience operator',
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const listingId = searchParams.get('listing_id')
  const auth = await authorize(request, listingId)
  if (auth.fail) return auth.fail
  try {
    const [{ data: story }, paid] = await Promise.all([
      auth.sb.from('operator_stories').select('answers, draft, status, generated_at, approved_at').eq('listing_id', listingId).maybeSingle(),
      isPaid(auth.sb, auth.user, listingId),
    ])
    return NextResponse.json({ story: story || null, paid, questions: QUESTIONS })
  } catch (err) {
    console.error('[dashboard/story] GET error:', err.message)
    return NextResponse.json({ error: 'Failed to load story' }, { status: 500 })
  }
}

export async function POST(request) {
  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const auth = await authorize(request, body.listing_id)
  if (auth.fail) return auth.fail
  if (!(await isPaid(auth.sb, auth.user, body.listing_id))) {
    return NextResponse.json({ error: 'The story service is a paid feature — upgrade this listing to use it.' }, { status: 403 })
  }
  const { sb, listing } = auth
  const action = body.action || 'save'

  // Normalise answers to the fixed question keys, trimmed + capped.
  function cleanAnswers(input) {
    const out = {}
    for (const { key } of QUESTIONS) {
      const v = String(input?.[key] ?? '').trim().slice(0, 800)
      if (v) out[key] = v
    }
    return out
  }

  try {
    if (action === 'save') {
      const answers = cleanAnswers(body.answers)
      const { error } = await sb.from('operator_stories').upsert(
        { listing_id: listing.id, answers, updated_at: new Date().toISOString() },
        { onConflict: 'listing_id' },
      )
      if (error) throw error
      return NextResponse.json({ ok: true, answers })
    }

    if (action === 'approve') {
      const { data: existing } = await sb.from('operator_stories').select('draft, status').eq('listing_id', listing.id).maybeSingle()
      if (!existing?.draft) return NextResponse.json({ error: 'Write a story before approving it.' }, { status: 400 })
      const { error } = await sb.from('operator_stories')
        .update({ status: 'live', approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('listing_id', listing.id)
      if (error) throw error
      try { revalidatePath(`/place/${listing.slug}`) } catch { /* best-effort */ }
      return NextResponse.json({ ok: true, status: 'live' })
    }

    if (action === 'retire') {
      const { error } = await sb.from('operator_stories')
        .update({ status: 'retired', updated_at: new Date().toISOString() })
        .eq('listing_id', listing.id)
      if (error) throw error
      try { revalidatePath(`/place/${listing.slug}`) } catch { /* best-effort */ }
      return NextResponse.json({ ok: true, status: 'retired' })
    }

    if (action === 'generate') {
      // Debounce duplicate paid generations for the same listing.
      const now = Date.now()
      const prev = lastGen.get(listing.id) || 0
      if (now - prev < GEN_DEBOUNCE_MS) {
        return NextResponse.json({ error: 'Give the last draft a moment — try again shortly.' }, { status: 429 })
      }

      const answers = cleanAnswers(body.answers)
      if (Object.keys(answers).length < 3) {
        return NextResponse.json({ error: 'Answer at least a few questions first — the story is built only from what you tell us.' }, { status: 400 })
      }
      // Persist the latest answers before generating.
      await sb.from('operator_stories').upsert(
        { listing_id: listing.id, answers, updated_at: new Date().toISOString() },
        { onConflict: 'listing_id' },
      )

      if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json({ error: 'Story generation is temporarily unavailable.' }, { status: 503 })
      }

      let client
      try {
        const mod = await import('@anthropic-ai/sdk')
        client = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY })
      } catch {
        return NextResponse.json({ error: 'Story generation is temporarily unavailable.' }, { status: 503 })
      }

      lastGen.set(listing.id, now)
      const label = VERTICAL_LABELS[listing.vertical] || 'independent venue'
      const where = [listing.suburb, listing.state].filter(Boolean).join(', ') || 'Australia'
      const answerBlock = QUESTIONS.filter(({ key }) => answers[key]).map(({ key, q }) => `Q: ${q}\nA: ${answers[key]}`).join('\n\n')

      let resp
      try {
        resp = await guardedAnthropicMessage(client, {
          model: MODEL,
          max_tokens: 600,
          system: `You are an editor for the Australian Atlas, a curated guide to independent Australian places. Write a venue's story from the operator's own interview answers.

HARD RULES:
- Use ONLY facts present in the answers below, plus the venue's name, what it is, and where it is. NEVER invent a fact, name, date, product, price, award or detail not stated by the operator.
- 180-250 words, 2-4 short paragraphs. Third person.
- Voice: warm, concrete, place-literate. No marketing hype, no superlatives ("best", "finest", "must-visit"), no exclamation marks. Australian spelling.
- If an answer is thin, write less rather than padding with invention.
Return ONLY the story prose — no title, no preamble, no quotation marks around the whole thing.`,
          messages: [{ role: 'user', content: `Venue: ${listing.name} — a ${label} in ${where}.\n\nInterview answers:\n${answerBlock}` }],
        })
      } catch (err) {
        // Governor over-budget or API failure — fail soft.
        console.error('[dashboard/story] generate error:', err.message)
        return NextResponse.json({ error: 'Story generation is busy right now — please try again shortly.' }, { status: 503 })
      }

      const draft = resp?.content?.[0]?.text?.trim()
      if (!draft) return NextResponse.json({ error: 'Could not draft a story from those answers — add a little more detail and retry.' }, { status: 502 })

      const { error } = await sb.from('operator_stories').upsert(
        { listing_id: listing.id, answers, draft, status: 'generated', generated_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { onConflict: 'listing_id' },
      )
      if (error) throw error
      return NextResponse.json({ ok: true, draft, status: 'generated' })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[dashboard/story] POST error:', err.message)
    return NextResponse.json({ error: 'Failed to save story' }, { status: 500 })
  }
}
