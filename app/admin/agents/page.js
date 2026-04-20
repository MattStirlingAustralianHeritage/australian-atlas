import { getSupabaseAdmin } from '@/lib/supabase/clients'
import AgentRunButton from './AgentRunButton'

export const metadata = { title: 'Agents — Admin' }
export const dynamic = 'force-dynamic'

const AGENTS = [
  {
    key: 'staleness',
    name: 'Staleness Agent',
    schedule: 'Mondays 6 AM AEST',
    endpoint: '/api/cron/staleness-agent',
    description: 'Verifies listing website URLs are reachable. Flags dead URLs after 2 consecutive failures, clears flags when URLs recover.',
    reviewLink: '/admin/staleness',
  },
  {
    key: 'enrichment-agent',
    name: 'Enrichment Agent',
    schedule: 'Nightly 2 AM AEST',
    endpoint: '/api/cron/enrichment-agent',
    description: 'Scrapes listing websites and generates AI descriptions via Claude for listings lacking editorial copy. Results go to Enrichment Review.',
    reviewLink: '/admin/enrichment-review',
  },
  {
    key: 'editorial-signals',
    name: 'Editorial Signals',
    schedule: 'Mondays 7 AM AEST',
    endpoint: '/api/cron/editorial-signals-agent',
    description: 'Weekly digest of new high-quality listings, trending venues, coverage gaps, approaching anniversaries, and community reports.',
  },
  {
    key: 'geocoding-watchdog',
    name: 'Geocoding Watchdog',
    schedule: 'On candidate approval',
    endpoint: null,
    description: 'Validates listing coordinates against Mapbox reverse geocoding. Flags mismatches where coordinates are >5km from stated suburb.',
  },
  {
    key: 'monday-briefing',
    name: 'Monday Morning Briefing',
    schedule: 'Mondays 8 AM AEST',
    endpoint: '/api/cron/monday-briefing-agent',
    description: 'Aggregates all weekly signals into one five-minute email. Network health, editorial, operators, users, and this week\'s priority action.',
  },
  {
    key: 'dead-image',
    name: 'Dead Image Agent',
    schedule: 'Tuesdays 3 AM AEST',
    endpoint: '/api/cron/dead-image-agent',
    description: 'Checks hero image URLs for broken links. Clears dead images and discovers OG image candidates from listing websites.',
    reviewLink: '/admin/dead-images',
  },
  {
    key: 'voice-consistency',
    name: 'Voice Consistency Agent',
    schedule: 'Wednesdays 3 AM AEST',
    endpoint: '/api/cron/voice-consistency-agent',
    description: 'Evaluates listing descriptions against Atlas editorial voice. Scores 1–10, suggests rewrites for off-voice content.',
    reviewLink: '/admin/voice-review',
  },
  {
    key: 'competitor-intelligence',
    name: 'Competitor Intelligence',
    schedule: 'Thursdays 3 AM AEST',
    endpoint: '/api/cron/competitor-intelligence-agent',
    description: 'Scans Broadsheet, Time Out, Concrete Playground, Australian Traveller, and Gourmet Traveller for venues not yet in Atlas.',
  },
  {
    key: 'revenue-signal',
    name: 'Revenue Signal Agent',
    schedule: 'Fridays 4 AM AEST',
    endpoint: '/api/cron/revenue-signal-agent',
    description: 'Weekly revenue digest from Stripe. Subscribers, ARR, churn, pipeline, and highest-value unclaimed listings.',
    reviewLink: '/admin/revenue',
  },
  {
    key: 'seo-content',
    name: 'SEO Content Agent',
    schedule: 'Sundays 3 AM AEST',
    endpoint: '/api/cron/seo-content-agent',
    description: 'Identifies high-intent search queries and generates editorial guide pages with matching listings. Max 10 pages per week.',
    reviewLink: '/admin/seo-content',
  },
  {
    key: 'backlink-builder',
    name: 'Backlink Builder Agent',
    schedule: '1st of month 4 AM AEST',
    endpoint: '/api/cron/backlink-builder-agent',
    description: 'Finds Wikipedia citation opportunities for heritage/historic listings and discovers Heritage crosslink matches.',
    reviewLink: '/admin/wikipedia-queue',
  },
  {
    key: 'content-recycling',
    name: 'Content Recycling Agent',
    schedule: 'Thursdays 5 AM AEST',
    endpoint: '/api/cron/content-recycling-agent',
    description: 'Generates social posts, newsletter excerpts, pull quotes, and follow-up angles for published journal articles.',
    reviewLink: '/admin/social-queue',
  },
  {
    key: 'operator-amplification',
    name: 'Operator Amplification Agent',
    schedule: 'On listing claim',
    endpoint: null,
    description: 'Sends a personalised share kit to operators 2 hours after claiming their listing. Completely autonomous.',
  },
  {
    key: 'user-reactivation',
    name: 'User Reactivation Agent',
    schedule: '1st of month 5 AM AEST',
    endpoint: '/api/cron/user-reactivation-agent',
    description: 'Sends personalised re-engagement emails to users inactive for 30+ days with recommended new listings.',
  },
  {
    key: 'listing-velocity',
    name: 'Listing Velocity Agent',
    schedule: '1st of month 6 AM AEST',
    endpoint: '/api/cron/listing-velocity-agent',
    description: 'Monthly snapshot of listing growth by vertical and region. Identifies momentum, stagnation, and gaps.',
  },
  {
    key: 'prospect',
    name: 'Prospector',
    schedule: 'Daily 4 AM AEST',
    endpoint: '/api/cron/prospect',
    description: 'Discovers venue candidates via Google Places API, deduplicates against master DB, and runs 5-gate quality verification pipeline.',
    reviewLink: '/admin/growth',
  },
]

const STATUS_STYLES = {
  success: { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
  partial: { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
  error: { bg: '#fef2f2', color: '#991b1b', border: '#fecaca' },
  failed: { bg: '#fef2f2', color: '#991b1b', border: '#fecaca' },
  running: { bg: '#eff6ff', color: '#1e40af', border: '#bfdbfe' },
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(start, end) {
  if (!start || !end) return '—'
  const ms = new Date(end) - new Date(start)
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

export default async function AgentsPage() {
  const sb = getSupabaseAdmin()

  // Fetch recent runs for each agent
  const agentRuns = {}
  for (const agent of AGENTS) {
    const { data } = await sb
      .from('agent_runs')
      .select('id, agent, started_at, completed_at, status, error, summary')
      .eq('agent', agent.key)
      .order('started_at', { ascending: false })
      .limit(10)

    agentRuns[agent.key] = data || []
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          fontSize: 28,
          color: 'var(--color-ink)',
          marginBottom: 4,
        }}>
          Autonomous Agents
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 300,
          fontSize: 14,
          color: 'var(--color-muted)',
        }}>
          Background agents that maintain data quality across the Atlas network.
        </p>
      </div>

      {/* Agent cards */}
      <div style={{ display: 'grid', gap: 20 }}>
        {AGENTS.map(agent => {
          const runs = agentRuns[agent.key] || []
          const lastRun = runs[0]
          const lastStatus = lastRun?.status
          const statusStyle = STATUS_STYLES[lastStatus] || { bg: '#f9fafb', color: '#6b7280', border: '#e5e7eb' }

          return (
            <div
              key={agent.key}
              style={{
                border: '1px solid var(--color-border, #e5e5e5)',
                borderRadius: 8,
                background: '#fff',
                overflow: 'hidden',
              }}
            >
              {/* Agent header */}
              <div style={{
                padding: '20px 24px',
                borderBottom: '1px solid var(--color-border, #e5e5e5)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <h2 style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 600,
                      fontSize: 16,
                      color: 'var(--color-ink)',
                      margin: 0,
                    }}>
                      {agent.name}
                    </h2>
                    {lastStatus && (
                      <span style={{
                        fontSize: 10,
                        fontWeight: 600,
                        fontFamily: 'var(--font-body)',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        padding: '2px 8px',
                        borderRadius: 100,
                        background: statusStyle.bg,
                        color: statusStyle.color,
                        border: `1px solid ${statusStyle.border}`,
                      }}>
                        {lastStatus}
                      </span>
                    )}
                  </div>
                  <p style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 13,
                    color: 'var(--color-muted)',
                    margin: 0,
                    maxWidth: 600,
                    lineHeight: 1.5,
                  }}>
                    {agent.description}
                  </p>
                  <p style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 11,
                    color: 'var(--color-muted)',
                    margin: '6px 0 0',
                  }}>
                    Schedule: {agent.schedule}
                    {lastRun && <> · Last run: {formatDate(lastRun.started_at)}</>}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {agent.reviewLink && (
                    <a
                      href={agent.reviewLink}
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 12,
                        fontWeight: 500,
                        padding: '8px 16px',
                        borderRadius: 6,
                        border: '1px solid var(--color-border, #e5e5e5)',
                        color: 'var(--color-ink)',
                        textDecoration: 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Review queue
                    </a>
                  )}
                  {agent.endpoint && (
                    <AgentRunButton endpoint={agent.endpoint} name={agent.name} />
                  )}
                </div>
              </div>

              {/* Run history */}
              {runs.length > 0 && (
                <div style={{ padding: '12px 24px 16px' }}>
                  <p style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 10,
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--color-muted)',
                    margin: '0 0 8px',
                  }}>
                    Recent runs
                  </p>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-border, #e5e5e5)' }}>
                        <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500, color: 'var(--color-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Started</th>
                        <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500, color: 'var(--color-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Duration</th>
                        <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500, color: 'var(--color-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                        <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500, color: 'var(--color-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Summary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map(run => {
                        const rs = STATUS_STYLES[run.status] || STATUS_STYLES.running
                        return (
                          <tr key={run.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '6px 8px', color: 'var(--color-ink)' }}>
                              {formatDate(run.started_at)}
                            </td>
                            <td style={{ padding: '6px 8px', color: 'var(--color-muted)' }}>
                              {formatDuration(run.started_at, run.completed_at)}
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <span style={{
                                fontSize: 10,
                                fontWeight: 600,
                                letterSpacing: '0.04em',
                                textTransform: 'uppercase',
                                padding: '1px 6px',
                                borderRadius: 100,
                                background: rs.bg,
                                color: rs.color,
                              }}>
                                {run.status || 'running'}
                              </span>
                            </td>
                            <td style={{ padding: '6px 8px', color: 'var(--color-muted)', maxWidth: 300 }}>
                              {run.error
                                ? <span style={{ color: '#991b1b' }}>{run.error}</span>
                                : run.summary
                                  ? <span>{formatSummary(run.summary)}</span>
                                  : '—'
                              }
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {runs.length === 0 && (
                <div style={{ padding: '20px 24px', textAlign: 'center' }}>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', margin: 0, fontStyle: 'italic' }}>
                    No runs recorded yet.
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Review queue links */}
      <div style={{
        marginTop: 32,
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        {AGENTS.filter(a => a.reviewLink).map(a => (
          <a
            key={a.key}
            href={a.reviewLink}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              color: 'var(--color-ink)',
              textDecoration: 'none',
              padding: '8px 16px',
              border: '1px solid var(--color-border, #e5e5e5)',
              borderRadius: 6,
              whiteSpace: 'nowrap',
            }}
          >
            {a.name}
          </a>
        ))}
      </div>
    </div>
  )
}


function formatSummary(summary) {
  if (!summary || typeof summary !== 'object') return '—'
  return Object.entries(summary)
    .filter(([, v]) => v != null && v !== 0 && v !== '')
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
    .join(' · ')
}
