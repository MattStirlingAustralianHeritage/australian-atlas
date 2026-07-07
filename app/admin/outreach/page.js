import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { LISTING_REGION_SELECT } from '@/lib/regions'
import OutreachActions from './OutreachActions'
import { VERTICAL_MUTED } from '@/lib/verticalUrl'

export const metadata = { title: 'Outreach — Admin' }
export const dynamic = 'force-dynamic'

const VERTICAL_COLORS = VERTICAL_MUTED

const VERTICAL_NAMES = {
  sba: 'Small Batch', collection: 'Culture Atlas', craft: 'Maker Studios',
  fine_grounds: 'Fine Grounds', rest: 'Boutique Stays', field: 'Field Atlas',
  corner: 'Corner Atlas', found: 'Found Atlas', table: 'Table Atlas', way: 'Way Atlas',
}

const STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA']

const STATUS_COLORS = {
  not_contacted: '#888',
  contacted: '#3b82f6',
  claimed: '#5F8A7E',
  declined: '#c0392b',
  queued: '#d4a03c',
}

const SEND_STATUS_COLORS = {
  sent: '#5F8A7E',
  failed: '#c0392b',
  bounced: '#c0392b',
  complained: '#c0392b',
  unsubscribed: '#888',
}

export default async function OutreachPage() {
  const sb = getSupabaseAdmin()

  // Sent / contacted log — every outreach row that has actually been touched.
  const { data: logRows, error: logErr } = await sb
    .from('operator_outreach')
    .select('id, listing_id, contact_email, email_source, status, send_status, resend_message_id, sent_at, send_error, campaign_id, notes, last_contacted_at, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(400)

  // Attach listing display data.
  const logWithListings = []
  if (logRows && logRows.length) {
    const ids = [...new Set(logRows.map((r) => r.listing_id).filter(Boolean))]
    const { data: ls } = await sb
      .from('listings')
      .select(`id, name, slug, vertical, region, state, ${LISTING_REGION_SELECT}`)
      .in('id', ids)
    const map = {}
    for (const l of ls || []) map[l.id] = l
    for (const row of logRows) logWithListings.push({ ...row, listing: map[row.listing_id] || null })
  }

  // Campaign summaries.
  let campaigns = []
  try {
    const { data } = await sb
      .from('outreach_campaigns')
      .select('id, name, subject, total, sent, failed, skipped, test_mode, status, created_at, sent_at')
      .order('created_at', { ascending: false })
      .limit(50)
    campaigns = data || []
  } catch { /* table may not exist pre-migration */ }

  // Aggregate stats.
  const { count: unclaimedCount } = await sb
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .eq('is_claimed', false)

  let suppressedCount = 0
  try {
    const { count } = await sb.from('outreach_suppressions').select('email', { count: 'exact', head: true })
    suppressedCount = count || 0
  } catch { /* table may not exist pre-migration */ }

  const sentCount = (logRows || []).filter((r) => r.send_status === 'sent').length
  const contactedCount = (logRows || []).filter((r) => r.status === 'contacted').length

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ marginBottom: 28 }}>
        <p style={{
          fontFamily: 'var(--font-body, system-ui)', fontWeight: 600, fontSize: 10,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'var(--color-muted, #888)', marginBottom: 8,
        }}>
          Operator Outreach
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display, Georgia)', fontWeight: 400, fontSize: 28,
          color: 'var(--color-ink, #2D2A26)', margin: 0, lineHeight: 1.2,
        }}>
          Outreach
        </h1>
        <p style={{
          fontFamily: 'var(--font-body, system-ui)', fontSize: 14,
          color: 'var(--color-muted, #888)', marginTop: 8, lineHeight: 1.5, maxWidth: 640,
        }}>
          Build a segment of unclaimed listings, discover contact emails from their websites,
          and send a personalised batch invitation to claim their profile.
        </p>
      </div>

      {logErr && (
        <div style={{
          background: '#FEF2F2', border: '1px solid #FECACA',
          padding: 16, borderRadius: 8, marginBottom: 24, color: '#991B1B',
          fontFamily: 'var(--font-body, system-ui)', fontSize: 14,
        }}>
          Error loading data: {logErr.message}
        </div>
      )}

      <OutreachActions
        logRows={logWithListings}
        campaigns={campaigns}
        verticalColors={VERTICAL_COLORS}
        verticalNames={VERTICAL_NAMES}
        statusColors={STATUS_COLORS}
        sendStatusColors={SEND_STATUS_COLORS}
        allStates={STATES}
        stats={{
          unclaimed: unclaimedCount || 0,
          suppressed: suppressedCount,
          sent: sentCount,
          contacted: contactedCount,
        }}
      />
    </div>
  )
}
