'use client'

import { useEffect, useState } from 'react'
import {
  Card, PageHeader, EmptyState, SkeletonPage, MicroLabel, leadTypeLabel, EmbargoBadge, fmtDate,
} from '@/components/press/ui'

// Story leads — pitches, data notes and releases from the Australian Atlas
// editorial desk. Region-targeted leads only reach members following that
// region; embargoed leads carry the badge and are not emailed until the
// embargo lifts.

export default function PressLeadsPage() {
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(null)

  useEffect(() => {
    fetch('/api/press/data?view=leads')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d) })
  }, [])

  if (!data) return <SkeletonPage />

  const leads = data.leads || []

  return (
    <div>
      <PageHeader
        title="Story leads"
        subtitle="Angles from our editorial desk — every number checked against live data before it's posted. Take any of them and run; we'll help with introductions and background."
      />

      {leads.length === 0 ? (
        <Card style={{ padding: '1.5rem' }}>
          <EmptyState title="No leads on the desk right now">
            When our editors post a story lead for your regions — or a network-wide release —
            it lands here and, if you&apos;ve opted in, in your inbox.
          </EmptyState>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {leads.map(lead => {
            const isOpen = open === lead.id
            return (
              <Card key={lead.id} style={{ padding: '1.15rem 1.3rem', cursor: lead.body ? 'pointer' : 'default' }} hover={!!lead.body}>
                <div onClick={() => lead.body && setOpen(isOpen ? null : lead.id)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <MicroLabel>
                      {leadTypeLabel(lead.lead_type)}
                      {lead.region?.name ? ` · ${lead.region.name}` : ' · Network-wide'}
                    </MicroLabel>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--color-muted)' }}>
                      {fmtDate(lead.published_at)}
                    </span>
                  </div>
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: 'var(--color-ink)', lineHeight: 1.3, margin: '0 0 0.4rem' }}>
                    {lead.title}<EmbargoBadge until={lead.embargo_until} />
                  </p>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', color: 'var(--color-muted)', lineHeight: 1.6, margin: 0 }}>
                    {lead.summary}
                  </p>
                  {lead.body && !isOpen && (
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--color-sage-dark)', margin: '0.5rem 0 0' }}>
                      Read the full note →
                    </p>
                  )}
                  {isOpen && (
                    <div style={{ marginTop: '0.8rem', paddingTop: '0.8rem', borderTop: '1px solid var(--color-border)' }}>
                      <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', color: 'var(--color-ink)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>
                        {lead.body}
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--color-muted)', lineHeight: 1.6, marginTop: '1.4rem' }}>
        Embargoed items are shared in confidence — please hold them until the date shown.
        Want background, a data pull, or an introduction for any lead? Use{' '}
        <a href="/newsroom/requests" style={{ color: 'var(--color-sage-dark)' }}>requests</a> or reply to the lead email.
      </p>
    </div>
  )
}
