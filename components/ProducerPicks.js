import Link from 'next/link'
import { getVerticalBadge, getVerticalBrandColour, getVerticalLabel } from '@/lib/verticalUrl'

// Producer Picks — public, read-only endorsements on the place page.
//
//   picks    — venues THIS place vouches for (outgoing)
//   pickedBy — venues that have vouched for THIS place (incoming)
//
// "Picked by" is third-party endorsement — the strongest editorial trust
// signal a place can carry — so it leads, rendered as a bold dark feature
// panel that surfaces each curator's note as a serif pull-quote. The
// outgoing picks follow as the lighter, cream-card secondary list.
//
// Canonical store is the master-portal listing_relationships table; the
// place page hydrates and filters to active venues before passing them here
// (see lib/picks/producerPicks.js). Purely presentational — no data access.
export default function ProducerPicks({ venueName, picks = [], pickedBy = [] }) {
  if (picks.length === 0 && pickedBy.length === 0) return null

  return (
    <section className="mb-12">
      {pickedBy.length > 0 && (
        <PickedByFeature venueName={venueName} curators={pickedBy} />
      )}

      {picks.length > 0 && (
        <div style={{ marginTop: pickedBy.length > 0 ? 40 : 0 }}>
          <h2 className="mb-1" style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '22px', color: 'var(--color-ink)' }}>
            Producer Picks
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
        </div>
      )}
    </section>
  )
}

// ── Picked by — the bold editorial endorsement feature ────────────
//
// A dark ink panel that deliberately stands apart from every cream meta-card
// on the page. The headline frames the social proof; each curator becomes a
// pull-quote (when they left a note) or a branded attribution line. Vertical
// brand colours read as small glowing dots against the ink.
function PickedByFeature({ venueName, curators }) {
  const n = curators.length
  const subhead =
    n === 1
      ? `One venue on the network personally vouches for ${venueName}.`
      : `${n} venues on the network personally vouch for ${venueName}.`

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'var(--color-ink)',
        boxShadow: '0 24px 60px -28px rgba(28,26,23,0.55)',
      }}
    >
      <div className="px-7 py-9 sm:px-10 sm:py-12">
        <p
          style={{
            fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600,
            letterSpacing: '0.22em', textTransform: 'uppercase',
            color: '#D98A5E', margin: 0,
          }}
        >
          Picked by
        </p>
        <h2
          style={{
            fontFamily: 'var(--font-display)', fontWeight: 400,
            fontSize: 'clamp(27px, 4.2vw, 36px)', lineHeight: 1.1,
            color: '#FAF8F5', margin: '12px 0 0',
          }}
        >
          In good company
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 300,
            lineHeight: 1.6, color: 'rgba(250,248,245,0.62)',
            margin: '10px 0 0', maxWidth: 460,
          }}
        >
          {subhead}
        </p>

        <div style={{ marginTop: 32 }}>
          {curators.map((c, i) => (
            <Endorsement
              key={c.id}
              curatorName={c.curatorName}
              curatorSlug={c.curatorSlug}
              curatorVertical={c.curatorVertical}
              curatorRegion={c.curatorRegion}
              note={c.note}
              isFirst={i === 0}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// One curator's endorsement. With a note it renders as a serif pull-quote
// behind a watermark quotation mark; without one, as a branded attribution
// line. Both attribute to the curator's place page when a slug exists.
function Endorsement({ curatorName, curatorSlug, curatorVertical, curatorRegion, note, isFirst }) {
  const brand = getVerticalBrandColour(curatorVertical) || 'var(--color-accent)'
  const meta = [getVerticalLabel(curatorVertical), curatorRegion].filter(Boolean).join(' · ')

  const nameEl = curatorSlug ? (
    <Link
      href={`/place/${curatorSlug}`}
      className="hover:underline"
      style={{ color: '#FAF8F5', textDecoration: 'none', fontWeight: 500 }}
    >
      {curatorName}
    </Link>
  ) : (
    <span style={{ color: '#FAF8F5', fontWeight: 500 }}>{curatorName}</span>
  )

  const dot = (
    <span style={{ width: 7, height: 7, borderRadius: '50%', background: brand, flexShrink: 0, boxShadow: `0 0 0 3px ${brand}22` }} />
  )

  const metaLine = meta && (
    <span style={{
      fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
      letterSpacing: '0.12em', textTransform: 'uppercase',
      color: 'rgba(250,248,245,0.5)',
    }}>
      {meta}
    </span>
  )

  return (
    <div
      style={{
        borderTop: isFirst ? 'none' : '1px solid rgba(250,248,245,0.12)',
        paddingTop: isFirst ? 0 : 24,
        marginTop: isFirst ? 0 : 24,
      }}
    >
      {note ? (
        <figure style={{ margin: 0, position: 'relative' }}>
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', top: -26, left: -6,
              fontFamily: 'var(--font-display)', fontSize: 104, lineHeight: 1,
              color: 'rgba(250,248,245,0.13)', pointerEvents: 'none', userSelect: 'none',
            }}
          >
            &ldquo;
          </span>
          <blockquote
            style={{
              margin: 0, position: 'relative',
              fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 400,
              fontSize: 'clamp(18px, 2.4vw, 21px)', lineHeight: 1.55,
              color: '#FAF8F5',
            }}
          >
            {note}
          </blockquote>
          <figcaption className="flex items-start" style={{ gap: 10, marginTop: 18 }}>
            <span style={{ marginTop: 7 }}>{dot}</span>
            <div className="flex flex-col" style={{ gap: 3 }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '14px' }}>{nameEl}</span>
              {metaLine}
            </div>
          </figcaption>
        </figure>
      ) : (
        <div className="flex items-baseline flex-wrap" style={{ gap: 10 }}>
          <span style={{ alignSelf: 'center' }}>{dot}</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '19px', color: '#FAF8F5' }}>{nameEl}</span>
          {metaLine}
        </div>
      )}
    </div>
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
