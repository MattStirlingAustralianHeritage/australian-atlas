'use client'

import Link from 'next/link'
import { usePress } from '../layout'
import { Card, PageHeader, SectionTitle, Button } from '@/components/press/ui'
import { CITATION_LINE } from '@/lib/press/config'

// The media kit — boilerplate, brand marks, key facts and usage rules.
// Everything a sub-editor needs at 5pm on deadline.

const BOILERPLATE_50 =
  'Australian Atlas is the curated guide to independent Australia: a living atlas of independently owned places — breweries and bookshops, farm gates and galleries, boutique stays and swimming holes — across every state and territory. No chains, no franchises, no paid placement: every place is picked and written up by editors, one at a time.'

const BOILERPLATE_25 =
  'Australian Atlas is the curated atlas of independent Australia — thousands of independently owned places across ten atlases, each picked and written up by editors. No chains, no paid placement.'

function CopyBlock({ label, text }) {
  return (
    <Card style={{ padding: '1.1rem 1.2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', margin: 0 }}>
          {label}
        </p>
        <button
          onClick={() => navigator.clipboard?.writeText(text)}
          style={{
            fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
            color: 'var(--color-sage-dark)', background: 'transparent',
            border: '1px solid rgba(95,138,126,0.4)', borderRadius: 999, padding: '0.2rem 0.7rem',
          }}
        >
          Copy
        </button>
      </div>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', color: 'var(--color-ink)', lineHeight: 1.65, margin: 0 }}>
        {text}
      </p>
    </Card>
  )
}

export default function PressMediaKitPage() {
  const { network } = usePress()

  return (
    <div>
      <PageHeader
        title="Media kit"
        subtitle="Boilerplate, brand marks and the facts, ready to lift. The public press kit carries the always-current key facts."
      >
        <Button href="/press" variant="secondary" small target="_blank">Public press kit ↗</Button>
      </PageHeader>

      {/* Boilerplate */}
      <div style={{ marginBottom: '1.9rem' }}>
        <SectionTitle note="use verbatim or cut to fit — no approval needed">Boilerplate</SectionTitle>
        <div style={{ display: 'grid', gap: 14 }}>
          <CopyBlock label="Standard (about 55 words)" text={BOILERPLATE_50} />
          <CopyBlock label="Short (about 30 words)" text={BOILERPLATE_25} />
          <CopyBlock label="Citation line" text={CITATION_LINE} />
        </div>
      </div>

      {/* Brand marks */}
      <div style={{ marginBottom: '1.9rem' }}>
        <SectionTitle note="right-click any mark to save it">Brand marks</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {[
            { src: '/favicon.svg', label: 'Atlas compass mark (SVG, scales to any size)', dark: false },
            { src: '/favicon-512.png', label: 'Atlas compass mark (PNG, 512×512)', dark: false },
            { src: '/apple-touch-icon.png', label: 'App icon (PNG, 180×180)', dark: true },
          ].map(mark => (
            <Card key={mark.src} style={{ padding: '1rem', textAlign: 'center' }}>
              <div style={{
                background: mark.dark ? 'var(--color-ink)' : 'var(--color-cream)',
                border: '1px solid var(--color-border)', borderRadius: 10,
                padding: '1.4rem', marginBottom: '0.6rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 110,
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mark.src} alt={mark.label} style={{ maxHeight: 72, maxWidth: '100%', borderRadius: 14 }} />
              </div>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--color-muted)', margin: '0 0 0.5rem' }}>{mark.label}</p>
              <a
                href={mark.src}
                download
                style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', fontWeight: 600, color: 'var(--color-sage-dark)', textDecoration: 'none' }}
              >
                Download
              </a>
            </Card>
          ))}
        </div>
      </div>

      {/* Key facts */}
      <div style={{ marginBottom: '1.9rem' }}>
        <SectionTitle>Key facts</SectionTitle>
        <Card style={{ padding: '0.4rem 1.3rem' }}>
          <dl style={{ margin: 0 }}>
            {[
              ['Founded', '2024'],
              ['Coverage', 'All states and territories across Australia'],
              ['Places listed', `${(network?.listings ?? 0).toLocaleString()} (live count)`],
              ['Live regions', `${network?.liveRegions ?? 0}`],
              ['The ten atlases', 'Small Batch (drink makers), Table (food), Fine Grounds (coffee), Craft (makers), Corner (shops), Found (vintage), Culture (galleries & museums), Field (natural places), Way (tours & experiences), Rest (stays)'],
              ['Editorial standard', 'Independently owned and run only. No chains, no franchises, no paid placement. Every listing is editor-written.'],
              ['Events', 'Listed places publish their own events; community events are reviewed before going live.'],
            ].map(([term, value], i, arr) => (
              <div key={term} style={{ display: 'flex', gap: 16, padding: '0.75rem 0', borderBottom: i < arr.length - 1 ? '1px solid var(--color-border)' : 'none', flexWrap: 'wrap' }}>
                <dt style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-ink)', minWidth: 140, flexShrink: 0 }}>{term}</dt>
                <dd style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-muted)', lineHeight: 1.6, margin: 0, flex: 1 }}>{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      {/* Usage + images note */}
      <Card style={{ padding: '1.3rem 1.4rem' }}>
        <SectionTitle>Usage &amp; images</SectionTitle>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-muted)', lineHeight: 1.7 }}>
          <p style={{ margin: '0 0 0.8rem' }}>
            <strong style={{ color: 'var(--color-ink)' }}>Our marks and data</strong> are free for editorial use —
            news, reviews, listings, data journalism — with attribution. Please don&apos;t imply a place is endorsed
            by us beyond its listing, and don&apos;t use the marks on commercial products.
          </p>
          <p style={{ margin: 0 }}>
            <strong style={{ color: 'var(--color-ink)' }}>Venue photographs are not ours to license.</strong> Images on
            listing pages belong to the venues and their photographers. Need pictures for a story?{' '}
            <Link href="/newsroom/requests" style={{ color: 'var(--color-sage-dark)' }}>Send an images request</Link> and
            we&apos;ll connect you with the venue directly — usually the fastest route to print-quality photography
            with clean rights.
          </p>
        </div>
      </Card>
    </div>
  )
}
