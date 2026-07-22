import { getSupabaseAdmin } from '@/lib/supabase/clients'
import IndustryOutreachActions from './IndustryOutreachActions'

export const metadata = { title: 'Industry Outreach — Admin' }
export const dynamic = 'force-dynamic'

const STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA']

const STATUS_COLORS = {
  not_contacted: '#888',
  contacted: '#3b82f6',
  responded: '#d4a03c',
  partnered: '#5F8A7E',
  declined: '#c0392b',
}

const SEND_STATUS_COLORS = {
  sent: '#5F8A7E',
  failed: '#c0392b',
  bounced: '#c0392b',
  complained: '#c0392b',
  unsubscribed: '#888',
}

export default async function IndustryOutreachPage() {
  const sb = getSupabaseAdmin()

  // Directory stats + touched-rows log. All queries tolerate the table not
  // existing yet (pre-migration) so the page never 500s.
  let logRows = []
  let directoryCount = 0
  let contactCount = 0
  let orgCount = 0
  let withEmailCount = 0
  let contactedCount = 0
  let openedCount = 0
  let logErr = null
  try {
    const { data, error } = await sb
      .from('industry_outreach')
      .select('id, kind, org_name, contact_name, role_title, org_type, focus, state, region_name, contact_email, email_source, status, send_status, resend_message_id, sent_at, opened_at, send_error, campaign_id, notes, last_contacted_at, created_at, updated_at, regions:region_id (name)')
      .or('send_status.not.is.null,status.neq.not_contacted')
      .order('updated_at', { ascending: false })
      .limit(400)
    if (error) logErr = error
    logRows = (data || []).map((r) => ({ ...r, region_display: r.regions?.name || r.region_name || null }))

    const { count: total } = await sb.from('industry_outreach').select('id', { count: 'exact', head: true })
    directoryCount = total || 0
    const { count: ct } = await sb.from('industry_outreach').select('id', { count: 'exact', head: true }).eq('kind', 'contact')
    contactCount = ct || 0
    const { count: og } = await sb.from('industry_outreach').select('id', { count: 'exact', head: true }).eq('kind', 'org')
    orgCount = og || 0
    const { count: withEmail } = await sb.from('industry_outreach').select('id', { count: 'exact', head: true }).not('contact_email', 'is', null)
    withEmailCount = withEmail || 0
    const { count: contacted } = await sb.from('industry_outreach').select('id', { count: 'exact', head: true }).in('status', ['contacted', 'responded', 'partnered'])
    contactedCount = contacted || 0
    const { count: opened } = await sb.from('industry_outreach').select('id', { count: 'exact', head: true }).not('opened_at', 'is', null)
    openedCount = opened || 0
  } catch { /* table may not exist pre-migration */ }

  // Industry campaign summaries.
  let campaigns = []
  try {
    const { data } = await sb
      .from('outreach_campaigns')
      .select('id, name, subject, kind, total, sent, failed, skipped, test_mode, status, created_at, sent_at')
      .eq('audience', 'industry')
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
          Industry Outreach
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display, Georgia)', fontWeight: 400, fontSize: 28,
          color: 'var(--color-ink, #2D2A26)', margin: 0, lineHeight: 1.2,
        }}>
          Industry bodies &amp; partners
        </h1>
        <p style={{
          fontFamily: 'var(--font-body, system-ui)', fontSize: 14,
          color: 'var(--color-muted, #888)', marginTop: 8, lineHeight: 1.6, maxWidth: 680,
        }}>
          The autopilot works a curated directory of peak bodies, associations, tourism organisations
          and other industry contacts daily — discovering contact emails, writing grounded openers, and
          sending capped weekday introductions with one follow-up — while this console handles targeted
          manual sends and shows the whole funnel. Reaching operators, press, councils or the travel
          trade instead? Use <a href="/admin/outreach" style={{ color: '#8a6520' }}>Outreach</a>,{' '}
          <a href="/admin/press-outreach" style={{ color: '#8a6520' }}>Press outreach</a>,{' '}
          <a href="/admin/council-outreach" style={{ color: '#8a6520' }}>Council outreach</a> or{' '}
          <a href="/admin/trade-outreach" style={{ color: '#8a6520' }}>Trade outreach</a>.
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

      <IndustryOutreachActions
        logRows={logRows}
        campaigns={campaigns}
        regions={regions}
        statusColors={STATUS_COLORS}
        sendStatusColors={SEND_STATUS_COLORS}
        allStates={STATES}
        stats={{
          directory: directoryCount,
          contacts: contactCount,
          orgs: orgCount,
          withEmail: withEmailCount,
          contacted: contactedCount,
          opened: openedCount,
          suppressed: suppressedCount,
        }}
      />
    </div>
  )
}
