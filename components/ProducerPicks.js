import Link from 'next/link'
import { getVerticalBadge, getVerticalBrandColour } from '@/lib/verticalUrl'

// Producer Picks — public, read-only endorsements on the place page.
//
//   picks    — venues THIS place vouches for (outgoing)
//   pickedBy — venues that have vouched for THIS place (incoming)
//
// Canonical store is the master-portal listing_relationships table; the
// place page hydrates and filters to active venues before passing them here
// (see lib/picks/producerPicks.js). Purely presentational — no data access.
export default function ProducerPicks({ venueName, picks = [], pickedBy = [] }) {
  if (picks.length === 0 && pickedBy.length === 0) return null

  return (
    <section className="mb-10">
      {picks.length > 0 && (
        <>
          <h2 className="mb-1" style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '22px', color: 'var(--color-ink)' }}>
            {"Producer's Picks"}
          </h2>
          <p className="mb-4" style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 300, color: 'var(--color-muted)' }}>
            Places {venueName} personally vouches for.
          </p>
          <div className="flex flex-col gap-3">
            {picks.map(p => (
              <PickCard
                key={p.id}
                name={p.pickedName}
                slug={p.pickedSlug}
                vertical={p.pickedVertical}
                region={p.pickedRegion}
                note={p.note}
              />
            ))}
          </div>
        </>
      )}

      {pickedBy.length > 0 && (
        <div style={{ marginTop: picks.length > 0 ? 22 : 0 }}>
          <p className="mb-3" style={{
            fontFamily: 'var(--font-body)', color: 'var(--color-muted)',
            letterSpacing: '0.08em', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
          }}>
            Picked by
          </p>
          <div className="flex flex-wrap gap-2">
            {pickedBy.map(p => (
              <PickChip key={p.id} name={p.curatorName} slug={p.curatorSlug} vertical={p.curatorVertical} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

// A vouched-for venue, rendered as a cream card that links to its place page.
function PickCard({ name, slug, vertical, region, note }) {
  const meta = [getVerticalBadge(vertical), region].filter(Boolean).join(' · ')

  const inner = (
    <div className="p-4 rounded-lg" style={{ background: 'var(--color-cream)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span style={{ fontFamily: 'var(--font-display)', fontSize: '17px', color: 'var(--color-ink)' }}>{name}</span>
        {meta && (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-muted)' }}>{meta}</span>
        )}
      </div>
      {note && (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 300, fontStyle: 'italic', color: 'var(--color-ink)', margin: '6px 0 0', lineHeight: 1.5 }}>
          &ldquo;{note}&rdquo;
        </p>
      )}
    </div>
  )

  if (!slug) return inner
  return (
    <Link href={`/place/${slug}`} className="block rounded-lg transition-shadow hover:shadow-sm" style={{ textDecoration: 'none' }}>
      {inner}
    </Link>
  )
}

// A venue that vouched for this place, rendered as a compact pill link.
function PickChip({ name, slug, vertical }) {
  const dot = getVerticalBrandColour(vertical) || 'var(--color-ink)'
  const pill = (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 12px', borderRadius: 999,
      background: 'var(--color-cream)', border: '1px solid var(--color-border)',
      fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-ink)',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      {name}
    </span>
  )
  if (!slug) return pill
  return <Link href={`/place/${slug}`} className="hover:underline" style={{ textDecoration: 'none' }}>{pill}</Link>
}
