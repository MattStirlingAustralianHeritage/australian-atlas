import Link from 'next/link'
import { getVerticalBadge, getVerticalBrandColour } from '@/lib/verticalUrl'

// Producer Picks — public, read-only endorsements on the place page.
//
//   picks    — venues THIS place vouches for (outgoing)
//   pickedBy — venues that have vouched for THIS place (incoming)
//
// "Picked by" — a fellow venue on the network personally vouching for this
// place — is the strongest editorial trust signal a listing can carry, so it
// leads and is rendered as a framed endorsement feature: a cream panel with a
// terracotta accent, a small seal, a confident serif heading, and each
// endorser as a serif pull-quote testimonial. "Producer Picks" (outgoing)
// follows as a quieter, secondary list. Purely presentational — no data
// access (canonical store is the master-portal listing_relationships table;
// the place page hydrates and filters to active venues — see
// lib/picks/producerPicks.js).
export default function ProducerPicks({ venueName, picks = [], pickedBy = [] }) {
  if (picks.length === 0 && pickedBy.length === 0) return null

  return (
    <section className="mb-12 flex flex-col" style={{ gap: 36 }}>
      {pickedBy.length > 0 && <PickedBy venueName={venueName} pickedBy={pickedBy} />}
      {picks.length > 0 && <ProducerGives venueName={venueName} picks={picks} />}
    </section>
  )
}

// ── "Picked by" — the elevated endorsement feature ────────────────────────
// A framed cream panel: terracotta accent rail along the top, a seal medallion
// beside a serif heading, a lead line that frames the peer social proof, then
// each endorsing venue as a testimonial row.
function PickedBy({ venueName, pickedBy }) {
  const n = pickedBy.length
  const lead =
    n === 1
      ? `A fellow venue on the Australian Atlas network personally vouches for ${venueName}.`
      : `${n} fellow venues on the Australian Atlas network personally vouch for ${venueName}.`

  return (
    <div
      className="relative overflow-hidden"
      style={{
        background: 'var(--color-cream)',
        border: '1px solid var(--color-border)',
        borderRadius: 18,
        boxShadow: '0 1px 3px rgba(28,26,23,0.05)',
      }}
    >
      {/* Top accent rail — the house terracotta, signalling a feature block. */}
      <span
        aria-hidden="true"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--color-accent)' }}
      />

      <div style={{ padding: '26px 28px 28px' }}>
        <div className="flex items-center" style={{ gap: 13 }}>
          <EndorsementSeal />
          <h2
            style={{
              fontFamily: 'var(--font-display)', fontWeight: 400,
              fontSize: '26px', lineHeight: 1.1, color: 'var(--color-ink)', margin: 0,
            }}
          >
            Picked by
          </h2>
        </div>

        <p
          style={{
            fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 300,
            color: 'var(--color-muted)', lineHeight: 1.55, margin: '12px 0 0',
          }}
        >
          {lead}
        </p>

        <div className="flex flex-col" style={{ marginTop: 22 }}>
          {pickedBy.map((c, i) => (
            <EndorsementRow
              key={c.id}
              name={c.curatorName}
              slug={c.curatorSlug}
              vertical={c.curatorVertical}
              region={c.curatorRegion}
              note={c.note}
              divider={i > 0}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// A single endorsing venue, rendered as a testimonial: the note as a serif
// italic pull-quote led by an oversized brand-colour quotation mark, with the
// venue name + vertical/region attribution beneath. When there's no note it
// degrades to a clean attribution line. Links to the endorser's place page.
function EndorsementRow({ name, slug, vertical, region, note, divider }) {
  const brand = getVerticalBrandColour(vertical) || 'var(--color-accent)'
  const meta = [getVerticalBadge(vertical), region].filter(Boolean).join(' · ')
  const quote = cleanNote(note)

  const inner = (
    <div
      style={{
        paddingTop: divider ? 20 : 0,
        marginTop: divider ? 20 : 0,
        borderTop: divider ? '1px solid var(--color-border)' : 'none',
      }}
    >
      {quote && (
        <blockquote
          style={{
            position: 'relative',
            margin: '0 0 14px',
            paddingLeft: 34,
            fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 400,
            fontSize: '19px', lineHeight: 1.55, color: 'var(--color-ink)',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', left: 0, top: 17,
              fontFamily: 'var(--font-display)', fontStyle: 'italic',
              fontSize: 54, lineHeight: 0, color: brand, opacity: 0.5,
            }}
          >
            &ldquo;
          </span>
          {quote}
        </blockquote>
      )}

      <div className="flex items-baseline flex-wrap" style={{ gap: 9 }}>
        <span
          aria-hidden="true"
          style={{ alignSelf: 'center', width: 7, height: 7, borderRadius: '50%', background: brand, flexShrink: 0 }}
        />
        <span
          className="group-hover:underline group-hover:underline-offset-2"
          style={{ fontFamily: 'var(--font-display)', fontSize: '17px', lineHeight: 1.2, color: 'var(--color-ink)' }}
        >
          {name}
        </span>
        {meta && (
          <span
            style={{
              fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
              letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-muted)',
            }}
          >
            {meta}
          </span>
        )}
      </div>
    </div>
  )

  if (!slug) return inner
  return (
    <Link href={`/place/${slug}`} className="group block" style={{ textDecoration: 'none' }}>
      {inner}
    </Link>
  )
}

// The endorsement seal — a small award medallion (ribbon rosette + tick) in the
// house terracotta. Signals "this place earned a peer's endorsement."
function EndorsementSeal() {
  const c = 'var(--color-accent)'
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      {/* ribbon tails */}
      <path d="M14 24.5 L11.5 35 L19 31 L26.5 35 L24 24.5 Z" fill={c} fillOpacity="0.12" stroke={c} strokeWidth="1.3" strokeLinejoin="round" />
      {/* medallion */}
      <circle cx="19" cy="16" r="12.5" fill="var(--color-card-bg)" stroke={c} strokeWidth="1.4" />
      <circle cx="19" cy="16" r="9" stroke={c} strokeWidth="1" strokeOpacity="0.45" />
      {/* tick */}
      <path d="M14.5 16.3 l3 3 l5.5 -6" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── "Producer Picks" — outgoing, the quieter secondary list ───────────────
function ProducerGives({ venueName, picks }) {
  return (
    <div>
      <h2
        className="mb-1"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '22px', color: 'var(--color-ink)' }}
      >
        Producer Picks
      </h2>
      <p
        className="mb-4"
        style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 300, color: 'var(--color-muted)' }}
      >
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
    </div>
  )
}

// A vouched-for venue, rendered as a cream card that links to its place page.
function PickCard({ name, slug, vertical, region, note }) {
  const brand = getVerticalBrandColour(vertical) || 'var(--color-accent)'
  const meta = [getVerticalBadge(vertical), region].filter(Boolean).join(' · ')
  const quote = cleanNote(note)

  const inner = (
    <div className="relative overflow-hidden rounded-lg" style={{ background: 'var(--color-cream)', border: '1px solid var(--color-border)' }}>
      <span aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 3, background: brand }} />
      <div style={{ padding: '14px 16px 14px 18px' }}>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '17px', color: 'var(--color-ink)' }}>{name}</span>
          {meta && (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>{meta}</span>
          )}
        </div>
        {quote && (
          <p style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontStyle: 'italic', color: 'var(--color-ink)', margin: '6px 0 0', lineHeight: 1.5 }}>
            &ldquo;{quote}&rdquo;
          </p>
        )}
      </div>
    </div>
  )

  if (!slug) return inner
  return (
    <Link href={`/place/${slug}`} className="block rounded-lg transition-shadow hover:shadow-sm" style={{ textDecoration: 'none' }}>
      {inner}
    </Link>
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
