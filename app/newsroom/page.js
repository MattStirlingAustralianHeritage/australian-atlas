'use client'

import Link from 'next/link'
import { usePress } from './layout'
import {
  Card, PageHeader, SectionTitle, StatCard, EmptyState, Button,
  SignalCard, EventRow, AdditionRow, MicroLabel, leadTypeLabel, EmbargoBadge, fmtDate,
} from '@/components/press/ui'
import { PRESS_CONTACT_EMAIL, CITATION_LINE } from '@/lib/press/config'

// The Newsdesk — what changed in the regions this member follows: story
// signals, fresh events, new places, and the latest from the story desk.

export default function NewsdeskPage() {
  const { press, regions, network, signals, recentAdditions, recentAdditionsCount, upcomingEvents, leads } = usePress()

  const regionNameById = Object.fromEntries(regions.map(r => [r.id, r.name]))
  const firstName = (press.name || '').split(' ')[0]
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening'

  return (
    <div>
      <PageHeader
        title={`${greeting}, ${firstName}`}
        subtitle={regions.length
          ? `Your desk covers ${regions.map(r => r.name).join(', ')}.`
          : 'Your newsdesk — follow a region and it fills itself.'}
      />

      {/* Headline numbers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: '1.9rem' }}>
        <StatCard label="Regions followed" value={regions.length} sub={regions.length ? null : 'Start with one'} />
        <StatCard label="Upcoming events" value={upcomingEvents.length} sub="in your regions" />
        <StatCard label="New places (30 days)" value={recentAdditionsCount} sub="in your regions" />
        <StatCard label="Across Australia" value={(network?.listings ?? 0).toLocaleString()} sub={`independent places · ${network?.liveRegions ?? 0} regions`} />
      </div>

      {regions.length === 0 && (
        <Card style={{ padding: '2rem', marginBottom: '1.9rem', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: 'var(--color-ink)', margin: '0 0 0.4rem' }}>
            Follow the regions you cover
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', color: 'var(--color-muted)', lineHeight: 1.6, margin: '0 0 1.1rem', maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
            The moment a listed independent puts on an event in a region you follow, you&apos;ll know —
            plus new places, story angles and citable local numbers, all on this desk.
          </p>
          <Button href="/newsroom/regions" variant="primary">Choose your regions</Button>
        </Card>
      )}

      {/* Story signals */}
      {signals.length > 0 && (
        <div style={{ marginBottom: '1.9rem' }}>
          <SectionTitle note="computed from live listings — check before you print">Worth a look</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {signals.slice(0, 6).map((s, i) => <SignalCard key={i} signal={s} />)}
          </div>
        </div>
      )}

      {/* Latest from the story desk */}
      {leads.length > 0 && (
        <div style={{ marginBottom: '1.9rem' }}>
          <SectionTitle action={<Link href="/newsroom/leads" style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-sage-dark)' }}>All leads →</Link>}>
            From the story desk
          </SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {leads.map(lead => (
              <Card key={lead.id} style={{ padding: '1rem 1.15rem' }}>
                <MicroLabel>{leadTypeLabel(lead.lead_type)}{lead.region?.name ? ` · ${lead.region.name}` : ''}</MicroLabel>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.02rem', color: 'var(--color-ink)', lineHeight: 1.3, margin: '0 0 0.35rem' }}>
                  {lead.title}<EmbargoBadge until={lead.embargo_until} />
                </p>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--color-muted)', lineHeight: 1.55, margin: 0 }}>
                  {lead.summary}
                </p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Events + new places, side by side */}
      {regions.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, marginBottom: '1.9rem' }}>
          <Card style={{ padding: '1.15rem 1.25rem' }}>
            <SectionTitle action={<Link href="/newsroom/events" style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-sage-dark)' }}>All events →</Link>}>
              On in your regions
            </SectionTitle>
            {upcomingEvents.length === 0 ? (
              <EmptyState title="No upcoming events yet">
                When a listed place in your regions publishes an event, it lands here first —
                and in your inbox, if notifications are on.
              </EmptyState>
            ) : (
              upcomingEvents.map(e => <EventRow key={e.id} event={e} regionName={regionNameById[e.region_id]} />)
            )}
          </Card>

          <Card style={{ padding: '1.15rem 1.25rem' }}>
            <SectionTitle note="last 30 days">New to the atlas</SectionTitle>
            {recentAdditions.length === 0 ? (
              <EmptyState title="Nothing new this month">
                When our editors list a new independent in your regions, it shows up here.
              </EmptyState>
            ) : (
              recentAdditions.map(l => <AdditionRow key={l.id} listing={l} regionName={regionNameById[l.region_id]} />)
            )}
          </Card>
        </div>
      )}

      {/* Beta footer note */}
      <Card style={{ padding: '1rem 1.25rem', background: 'var(--color-cream)' }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-muted)', lineHeight: 1.6, margin: 0 }}>
          <strong style={{ color: 'var(--color-ink)' }}>Press beta.</strong> The newsroom is free for working press
          while we build it out — tell us what would make it more useful from{' '}
          <Link href="/newsroom/settings" style={{ color: 'var(--color-sage-dark)' }}>settings</Link>, or email{' '}
          <a href={`mailto:${PRESS_CONTACT_EMAIL}`} style={{ color: 'var(--color-sage-dark)' }}>{PRESS_CONTACT_EMAIL}</a>.
          Our data is free to cite with attribution: &ldquo;{CITATION_LINE}&rdquo;. Figures current as of {fmtDate(network?.asOf)}.
        </p>
      </Card>
    </div>
  )
}
