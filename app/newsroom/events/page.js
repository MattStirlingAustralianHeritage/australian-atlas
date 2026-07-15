'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Card, PageHeader, SectionTitle, EmptyState, Pill, Button, SkeletonPage, EventRow,
} from '@/components/press/ui'

// Events — everything upcoming in followed regions (or the whole network),
// with per-event .ics, a CSV download, and the personal calendar feed.

export default function PressEventsPage() {
  const [data, setData] = useState(null)
  const [scope, setScope] = useState('followed')
  const [icsUrl, setIcsUrl] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch(`/api/press/data?view=events&scope=${scope}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d) })
  }, [scope])

  useEffect(() => {
    fetch('/api/press/data?view=settings')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.icsUrl) setIcsUrl(d.icsUrl) })
  }, [])

  if (!data) return <SkeletonPage />

  const events = data.events || []
  const regionNames = data.regionNames || {}

  // Group by month for scanning.
  const byMonth = new Map()
  for (const e of events) {
    const key = (e.start_date || '').slice(0, 7)
    const label = key
      ? new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      : 'Undated'
    if (!byMonth.has(label)) byMonth.set(label, [])
    byMonth.get(label).push(e)
  }

  async function copyFeed() {
    if (!icsUrl) return
    try {
      await navigator.clipboard.writeText(icsUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div>
      <PageHeader
        title="Events"
        subtitle="What listed independents are putting on. Every event links to its public page; add any of them straight to your calendar."
      >
        <Button href="/api/press/export?type=events" variant="secondary" small download>
          Download CSV
        </Button>
      </PageHeader>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <Pill active={scope === 'followed'} onClick={() => { setData(null); setScope('followed') }}>Your regions</Pill>
        <Pill active={scope === 'all'} onClick={() => { setData(null); setScope('all') }}>Whole network</Pill>
        {icsUrl && (
          <button
            onClick={copyFeed}
            title="A live calendar feed of events in your followed regions — paste into Google Calendar, Apple Calendar or Outlook as a subscription URL."
            style={{
              marginLeft: 'auto', fontFamily: 'var(--font-body)', fontSize: '0.76rem', fontWeight: 600,
              color: 'var(--color-sage-dark)', background: 'transparent', cursor: 'pointer',
              border: '1px solid rgba(95,138,126,0.4)', borderRadius: 999, padding: '0.32rem 0.85rem',
            }}
          >
            {copied ? 'Copied ✓' : '📅 Copy calendar feed URL'}
          </button>
        )}
      </div>

      {events.length === 0 ? (
        <Card style={{ padding: '1.5rem' }}>
          <EmptyState title={scope === 'followed' ? 'Nothing on the calendar in your regions yet' : 'No events on the network calendar yet'}>
            {scope === 'followed' ? (
              <>Operators publish events from their listing dashboard; community organisers submit via{' '}
              <Link href="/events" target="_blank" style={{ color: 'var(--color-sage-dark)' }}>the events page</Link>.
              The moment one lands in a region you follow, you&apos;ll see it here — and hear about it, if notifications are on.</>
            ) : (
              <>The events calendar is new. As listed independents publish events they appear here.</>
            )}
          </EmptyState>
        </Card>
      ) : (
        [...byMonth.entries()].map(([month, monthEvents]) => (
          <div key={month} style={{ marginBottom: '1.6rem' }}>
            <SectionTitle>{month}</SectionTitle>
            <Card style={{ padding: '0.4rem 1.25rem' }}>
              {monthEvents.map(e => (
                <EventRow key={e.id} event={e} regionName={regionNames[e.region_id]?.name} />
              ))}
            </Card>
          </div>
        ))
      )}
    </div>
  )
}
