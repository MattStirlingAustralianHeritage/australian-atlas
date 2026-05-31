import Link from 'next/link'
import { getVerticalBadge, getVerticalBrandColour } from '@/lib/verticalUrl'

// Producer Picks — public, read-only endorsements on the place page.
//
//   picks    — venues THIS place vouches for (outgoing)
//   pickedBy — venues that have vouched for THIS place (incoming)
//
// Both directions render in ONE shared editorial card language so the two
// surfaces read as the same family: a curator's page and the page of a venue
// they picked carry the identical card treatment, differing only in the
// section heading and its lead line. "Picked by" — third-party endorsement,
// the strongest editorial trust signal a place can carry — leads when present.
//
// Each card wears a hairline brand rail in its vertical's colour and renders
// any curator note as a serif pull-quote. Canonical store is the master-portal
// listing_relationships table; the place page hydrates and filters to active
// venues before passing them here (see lib/picks/producerPicks.js). Purely
// presentational — no data access.
export default function ProducerPicks({ venueName, picks = [], pickedBy = [] }) {
  if (picks.length === 0 && pickedBy.length === 0) return null

  const n = pickedBy.length
  const pickedSubhead =
    n === 1
      ? `One venue on the network personally vouches for ${venueName}.`
      : `${n} venues on the network personally vouch for ${venueName}.`

  return (
    <section className="mb-12 flex flex-col" style={{ gap: 40 }}>
      {pickedBy.length > 0 && (
        <PickGroup heading="Picked by" subhead={pickedSubhead}>
          {pickedBy.map(c => (
            <EndorsementCard
              key={c.id}
              name={c.curatorName}
              slug={c.curatorSlug}
              vertical={c.curatorVertical}
              region={c.curatorRegion}
              note={c.note}
            />
          ))}
        </PickGroup>
      )}

      {picks.length > 0 && (
        <PickGroup heading="Producer Picks" subhead={`Places ${venueName} personally vouches for.`}>
          {picks.map(p => (
            <EndorsementCard
              key={p.id}
              name={p.pickedName}
              slug={p.pickedSlug}
              vertical={p.pickedVertical}
              region={p.pickedRegion}
              note={p.note}
            />
          ))}
        </PickGroup>
      )}
    </section>
  )
}

// A titled group: serif heading + muted lead line + a column of cards. Both
// the incoming ("Picked by") and outgoing ("Producer Picks") sections use the
// identical wrapper, which is what makes the two surfaces read as one design.
function PickGroup({ heading, subhead, children }) {
  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '22px', lineHeight: 1.2, color: 'var(--color-ink)', margin: 0 }}>
        {heading}
      </h2>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 300, color: 'var(--color-muted)', margin: '5px 0 0' }}>
        {subhead}
      </p>
      <div className="flex flex-col" style={{ gap: 12, marginTop: 18 }}>
        {children}
      </div>
    </div>
  )
}

// Notes sometimes arrive already wrapped in quote marks; strip any surrounding
// quotes/whitespace so the card's own typographic quotes don't double up.
function cleanNote(note) {
  if (!note) return ''
  return note
    .trim()
    .replace(/^[\s"'“”‘’]+/, '')
    .replace(/[\s"'“”‘’]+$/, '')
}

// The single endorsement card — used for both directions. A cream editorial
// card carrying a hairline brand rail (the venue's vertical colour), the venue
// name in display serif, a refined uppercase meta line, and any note as a
// serif italic pull-quote. Links to the venue's place page when a slug exists.
function EndorsementCard({ name, slug, vertical, region, note }) {
  const brand = getVerticalBrandColour(vertical) || 'var(--color-accent)'
  const meta = [getVerticalBadge(vertical), region].filter(Boolean).join(' · ')
  const quote = cleanNote(note)

  const inner = (
    <article
      className="relative overflow-hidden rounded-xl"
      style={{ background: 'var(--color-cream)', border: '1px solid var(--color-border)' }}
    >
      <span
        aria-hidden="true"
        style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 3, background: brand }}
      />
      <div style={{ padding: '16px 20px 16px 22px' }}>
        <div className="flex items-baseline flex-wrap" style={{ gap: 9 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px', lineHeight: 1.2, color: 'var(--color-ink)' }}>
            {name}
          </span>
          {meta && (
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
              letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-muted)',
            }}>
              {meta}
            </span>
          )}
        </div>
        {quote && (
          <blockquote style={{
            margin: '10px 0 0',
            fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 400,
            fontSize: '15px', lineHeight: 1.55, color: 'var(--color-ink)',
          }}>
            &ldquo;{quote}&rdquo;
          </blockquote>
        )}
      </div>
    </article>
  )

  if (!slug) return inner
  return (
    <Link
      href={`/place/${slug}`}
      className="block rounded-xl transition-shadow hover:shadow-md"
      style={{ textDecoration: 'none' }}
    >
      {inner}
    </Link>
  )
}
