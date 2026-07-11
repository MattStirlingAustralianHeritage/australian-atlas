import { getSupabaseAdmin } from '@/lib/supabase/clients'
import CouncilOutreachActions from './CouncilOutreachActions'

export const metadata = { title: 'Council Outreach — Admin' }
export const dynamic = 'force-dynamic'

const STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA']

const STATUS_COLORS = {
  not_contacted: '#888',
  contacted: '#3b82f6',
  responded: '#d4a03c',
  onboarded: '#5F8A7E',
  declined: '#c0392b',
}

const SEND_STATUS_COLORS = {
  sent: '#5F8A7E',
  failed: '#c0392b',
  bounced: '#c0392b',
  complained: '#c0392b',
  unsubscribed: '#888',
}

export default async function CouncilOutreachPage() {
  const sb = getSupabaseAdmin()

  // Directory stats + touched-rows log. All queries tolerate the table not
  // existing yet (pre-migration) so the page never 500s.
  let logRows = []
  let directoryCount = 0
  let withEmailCount = 0
  let contactedCount = 0
  let onboardedCount = 0
  let logErr = null
  try {
    const { data, error } = await sb
      .from('council_outreach')
      .select('id, council_name, state, region_name, contact_email, email_source, status, send_status, resend_message_id, sent_at, send_error, campaign_id, notes, last_contacted_at, created_at, updated_at, regions:region_id (name)')
      .or('send_status.not.is.null,status.neq.not_contacted')
      .order('updated_at', { ascending: false })
      .limit(400)
    if (error) logErr = error
    logRows = (data || []).map((r) => ({ ...r, region_display: r.regions?.name || r.region_name || null }))

    const { count: total } = await sb.from('council_outreach').select('id', { count: 'exact', head: true })
    directoryCount = total || 0
    const { count: withEmail } = await sb.from('council_outreach').select('id', { count: 'exact', head: true }).not('contact_email', 'is', null)
    withEmailCount = withEmail || 0
    const { count: contacted } = await sb.from('council_outreach').select('id', { count: 'exact', head: true }).in('status', ['contacted', 'responded'])
    contactedCount = contacted || 0
    const { count: onboarded } = await sb.from('council_outreach').select('id', { count: 'exact', head: true }).eq('status', 'onboarded')
    onboardedCount = onboarded || 0
  } catch { /* table may not exist pre-migration */ }

  // Council campaign summaries.
  let campaigns = []
  try {
    const { data } = await sb
      .from('outreach_campaigns')
      .select('id, name, subject, total, sent, failed, skipped, test_mode, status, created_at, sent_at')
      .eq('audience', 'council')
      .order('created_at', { ascending: false })
      .limit(50)
    campaigns = data || []
  } catch { /* audience column may not exist pre-migration */ }

  let suppressedCount = 0
  try {
    const { count } = await sb.from('outreach_suppressions').select('email', { count: 'exact', head: true })
    suppressedCount = count || 0
  } catch { /* table may not exist pre-migration */ }

  // Regions for the Directory form's link dropdown.
  let regions = []
  try {
    const { data } = await sb
      .from('regions')
      .select('id, name, slug, state, listing_count, status')
      .neq('status', 'archived')
      .order('state')
      .order('name')
    regions = data || []
  } catch { /* non-fatal */ }

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ marginBottom: 28 }}>
        <p style={{
          fontFamily: 'var(--font-body, system-ui)', fontWeight: 600, fontSize: 10,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'var(--color-muted, #888)', marginBottom: 8,
        }}>
          Council Outreach
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display, Georgia)', fontWeight: 400, fontSize: 28,
          color: 'var(--color-ink, #2D2A26)', margin: 0, lineHeight: 1.2,
        }}>
          Councils
        </h1>
        <p style={{
          fontFamily: 'var(--font-body, system-ui)', fontSize: 14,
          color: 'var(--color-muted, #888)', marginTop: 8, lineHeight: 1.5, maxWidth: 640,
        }}>
          Build a segment of local councils, discover contact emails from their official websites,
          and send a personalised batch invitation to the free founding council beta.
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

      <CouncilOutreachActions
        logRows={logRows}
        campaigns={campaigns}
        regions={regions}
        statusColors={STATUS_COLORS}
        sendStatusColors={SEND_STATUS_COLORS}
        allStates={STATES}
        stats={{
          directory: directoryCount,
          withEmail: withEmailCount,
          contacted: contactedCount,
          onboarded: onboardedCount,
          suppressed: suppressedCount,
        }}
      />
    </div>
  )
}
