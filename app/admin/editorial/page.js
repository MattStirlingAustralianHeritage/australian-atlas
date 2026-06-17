import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { VERTICAL_ACCENTS } from '@/lib/verticalUrl'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Editorial Queue — Admin' }

const VERTICAL_NAMES = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
}

const SLOT_TYPE_LABELS = { general: 'General', new_producer: 'New Producer' }

const statusColors = {
  idea: '#E8E3DA',
  pitched: '#D4E4DC',
  confirmed: '#C4D8B8',
  in_progress: '#FCE4B8',
  published: '#B8D4C8',
}

const statusOrder = ['confirmed', 'in_progress', 'pitched', 'idea', 'published']

function scoreColor(n) {
  if (n == null) return 'var(--color-muted)'
  if (n >= 80) return '#4A7C59'
  if (n >= 60) return '#C49A3C'
  return '#C4634F'
}

const asArray = (v) => (Array.isArray(v) ? v : [])

/** A verified fact may be a plain string or a { claim, field, value } object. */
function factText(f) {
  if (typeof f === 'string') return { main: f, detail: null }
  if (f && typeof f === 'object') {
    const main = f.claim || JSON.stringify(f)
    const detail = f.field != null ? `${f.field}: ${String(f.value)}` : null
    return { main, detail }
  }
  return { main: String(f), detail: null }
}

export default async function EditorialPage() {
  // Auth handled by middleware — no page-level check needed
  const sb = getSupabaseAdmin()

  let ideas = []
  try {
    // select('*') so a not-yet-applied migration can't 42703 the whole page —
    // matches the defensive pattern on /admin/pitches.
    const { data, error } = await sb
      .from('story_ideas')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (!error && data) ideas = data
    else if (error) console.error('[admin/editorial] Query error:', error.message)
  } catch (err) {
    console.error('[admin/editorial] Query error:', err.message)
    // Continue with empty state rather than crashing
  }

  // Resolve every referenced listing (the anchor + any supporting venues) to a
  // display name in one batched lookup, so the brief reads in plain English.
  const listingIds = new Set()
  for (const idea of ideas) {
    if (idea.listing_id) listingIds.add(idea.listing_id)
    for (const id of asArray(idea.supporting_listing_ids)) {
      if (typeof id === 'string') listingIds.add(id)
    }
  }
  let listingsById = {}
  if (listingIds.size) {
    try {
      const { data: listings } = await sb
        .from('listings')
        .select('id, name, vertical, region, suburb, state, slug, website')
        .in('id', [...listingIds])
      if (listings) listingsById = Object.fromEntries(listings.map((l) => [l.id, l]))
    } catch (err) {
      console.error('[admin/editorial] Listing lookup error:', err.message)
    }
  }

  const byStatus = {}
  for (const idea of ideas) {
    if (!byStatus[idea.status]) byStatus[idea.status] = []
    byStatus[idea.status].push(idea)
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 28, color: 'var(--color-ink)', marginBottom: 4 }}>
          Editorial Queue
        </h1>
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14, color: 'var(--color-muted)' }}>
          Story ideas, pitches, and in-progress pieces across the Journal — each carrying the full brief it was kept with.
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 32 }}>
        {statusOrder.map(status => (
          <div key={status} style={{
            padding: '14px 16px', borderRadius: 8,
            background: statusColors[status] || '#f0f0f0',
            textAlign: 'center',
          }}>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400, color: 'var(--color-ink)', margin: 0 }}>
              {(byStatus[status] || []).length}
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '4px 0 0' }}>
              {status.replace('_', ' ')}
            </p>
          </div>
        ))}
      </div>

      {/* Ideas list */}
      {statusOrder.map(status => {
        const items = byStatus[status] || []
        if (items.length === 0) return null
        return (
          <div key={status} style={{ marginBottom: 32 }}>
            <h2 style={{
              fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 11,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'var(--color-muted)', marginBottom: 12,
            }}>
              {status.replace('_', ' ')} ({items.length})
            </h2>
            <div style={{ display: 'grid', gap: 12 }}>
              {items.map(idea => (
                <IdeaCard key={idea.id} idea={idea} listingsById={listingsById} />
              ))}
            </div>
          </div>
        )
      })}

      {ideas.length === 0 && (
        <div style={{ textAlign: 'center', padding: '4rem 0' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)' }}>
            No story ideas yet. Keep a pitch from the Pitch Triage to open it here.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Single story-idea card ─────────────────────────────────
function IdeaCard({ idea, listingsById }) {
  const color = VERTICAL_ACCENTS[idea.vertical] || 'var(--color-muted)'

  // headline is the proposed title; story_angle is the hook. Legacy rows (kept
  // before migration 165) have no headline — story_angle held the title and the
  // hook lived in notes, so fall back to keep those rendering correctly.
  const title = idea.headline || idea.story_angle || idea.venue_name || 'Untitled story'
  const hook = idea.headline ? idea.story_angle : null

  const facts = asArray(idea.verified_facts)
  const research = asArray(idea.research_needed)
  const supporting = asArray(idea.supporting_listing_ids)
    .map((id) => listingsById[id])
    .filter(Boolean)
  const anchor = idea.listing_id ? listingsById[idea.listing_id] : null
  const snap = idea.pitch_snapshot && typeof idea.pitch_snapshot === 'object' ? idea.pitch_snapshot : {}
  const provModel = snap.generated_by || null
  const provPrompt = snap.prompt_version || null
  const provAt = snap.generated_at || null

  return (
    <div style={{
      padding: '16px 20px', borderRadius: 10,
      border: `1px solid ${color}33`, background: '#fff',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {idea.venue_name && (
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14, color: 'var(--color-ink)' }}>
            {idea.venue_name}
          </span>
        )}
        {idea.vertical && (
          <span style={{
            fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
            letterSpacing: '0.04em', textTransform: 'uppercase',
            color, background: color + '14', border: `1px solid ${color}44`,
            padding: '2px 8px', borderRadius: 6,
          }}>
            {VERTICAL_NAMES[idea.vertical] || idea.vertical}
          </span>
        )}
        {idea.slot_type && (
          <span style={{
            fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 10,
            letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)',
          }}>
            {SLOT_TYPE_LABELS[idea.slot_type] || idea.slot_type}
          </span>
        )}
        {idea.region && (
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 12, color: 'var(--color-muted)' }}>
            {idea.region}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {idea.candidate_score != null && (
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 11, color: scoreColor(idea.candidate_score) }}>
            candidate {idea.candidate_score}
          </span>
        )}
        {idea.confidence_score != null && (
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 11, color: scoreColor(idea.confidence_score) }}>
            confidence {idea.confidence_score}
          </span>
        )}
        {idea.target_publish_date && (
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 11, color: 'var(--color-muted)' }}>
            Target: {idea.target_publish_date}
          </span>
        )}
      </div>

      {/* Title (proposed headline) */}
      <h3 style={{
        fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 18,
        color: 'var(--color-ink)', lineHeight: 1.3, margin: '0 0 6px',
      }}>
        {title}
      </h3>

      {/* Hook / angle */}
      {hook && (
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 13.5, color: 'var(--color-ink)', lineHeight: 1.55, margin: '0 0 8px' }}>
          {hook}
        </p>
      )}

      {/* Editorial framing */}
      {idea.editorial_framing && (
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 12.5, color: 'var(--color-muted)', lineHeight: 1.6, margin: '0 0 10px', fontStyle: 'italic' }}>
          {idea.editorial_framing}
        </p>
      )}

      {/* Verified facts — the grounded research backbone */}
      {facts.length > 0 && (
        <details open style={{ margin: '4px 0 10px', padding: '10px 12px', background: '#FAFAF7', border: '1px solid var(--color-border)', borderRadius: 8 }}>
          <summary style={{ cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
            Verified facts ({facts.length})
          </summary>
          <ul style={{ margin: '8px 0 0', paddingLeft: 16, listStyle: 'disc' }}>
            {facts.map((f, i) => {
              const { main, detail } = factText(f)
              return (
                <li key={i} style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-ink)', lineHeight: 1.5, marginBottom: 3 }}>
                  {main}
                  {detail && <span style={{ color: 'var(--color-muted)', fontSize: 11 }}>{' '}— {detail}</span>}
                </li>
              )
            })}
          </ul>
        </details>
      )}

      {/* Research needed before publishing */}
      {research.length > 0 && (
        <details open style={{ margin: '0 0 10px', padding: '10px 12px', background: '#FFFBF2', border: '1px solid #E8D9B5', borderRadius: 8 }}>
          <summary style={{ cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#9A7B2E' }}>
            Research needed ({research.length})
          </summary>
          <ul style={{ margin: '8px 0 0', paddingLeft: 16 }}>
            {research.map((r, i) => (
              <li key={i} style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-ink)', lineHeight: 1.5, marginBottom: 3 }}>
                {typeof r === 'string' ? r : JSON.stringify(r)}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Source + supporting venues */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)', marginBottom: idea.notes ? 6 : 2 }}>
        <span style={{ fontWeight: 600, color: 'var(--color-ink)' }}>Source:</span>
        <span>{anchor?.name || idea.venue_name || idea.listing_id || '—'}</span>
        {anchor?.region && <span>· {anchor.region}</span>}
        {anchor?.website && (
          <a href={anchor.website} target="_blank" rel="noopener noreferrer" style={{ color, textDecoration: 'underline' }}>
            website ↗
          </a>
        )}
        {supporting.length > 0 && (
          <span>· Also: {supporting.map((l) => l.name).join(', ')}</span>
        )}
      </div>

      {/* Human / legacy notes */}
      {idea.notes && (
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 12.5, color: 'var(--color-muted)', lineHeight: 1.5, margin: '0 0 6px' }}>
          {idea.notes}
        </p>
      )}

      {/* Footer: provenance */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-muted)', opacity: 0.6 }}>
          {idea.source || 'manual'}
        </span>
        {provModel && (
          <>
            <span style={{ fontSize: 10, color: 'var(--color-border)' }}>|</span>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--color-muted)', opacity: 0.6 }}>
              {provModel}{provPrompt ? ` · ${provPrompt}` : ''}
            </span>
          </>
        )}
        <span style={{ fontSize: 10, color: 'var(--color-border)' }}>|</span>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)', opacity: 0.6 }}>
          {new Date(provAt || idea.created_at).toLocaleDateString()}
        </span>
      </div>
    </div>
  )
}
