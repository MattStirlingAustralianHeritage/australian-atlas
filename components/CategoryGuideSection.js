'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Coffee, Wine, UtensilsCrossed, BedDouble, Mountain, Compass, Hammer, Landmark, ShoppingBag, Clock, ChevronDown } from 'lucide-react'
import { VERTICAL_CARD_TOKENS } from '@/lib/verticalUrl'

const GOLD = 'var(--color-gold)'

const COUNT_WORDS = { 8: 'Eight', 9: 'Nine', 10: 'Ten', 11: 'Eleven', 12: 'Twelve' }

// Plain-English decoder for the categories. Kept in lock-step with the copy in
// app/page.js (the spectrum spine reads from the same scope definitions). Each
// card pairs the brand name with an always-visible descriptor, an identity
// icon, and its vertical's saturated ground colour, linking to the on-site
// filtered search. Ordered as a natural journey:
// coffee → drink → eat → stay → roam → guide → make → see → shop → find.
const VERTICAL_GUIDE = [
  { key: 'fine_grounds', name: 'Fine Grounds', label: 'Specialty coffee',       desc: 'Roasters with their own roastery, and the cafés that take it seriously.', accent: '#8A7055', Icon: Coffee },
  { key: 'sba',          name: 'Small Batch',  label: 'Brewers & distillers',   desc: 'Independent breweries, wineries, distilleries, and cellar doors.',        accent: '#B07A22', Icon: Wine },
  { key: 'table',        name: 'Table',        label: 'Restaurants & food',     desc: 'Independent restaurants, bakeries, markets, and farm gates.',             accent: '#C4634F', Icon: UtensilsCrossed },
  { key: 'rest',         name: 'Rest',         label: 'Boutique stays',         desc: 'Cabins, guesthouses, farm stays, and eco-lodges worth the trip.',         accent: '#5A8A9A', Icon: BedDouble },
  { key: 'field',        name: 'Field',        label: 'Nature & walks',         desc: 'Nature reserves, national parks, swimming holes, and walking trails.',    accent: '#4A7C59', Icon: Mountain },
  { key: 'way',          name: 'Way',          label: 'Tours & experiences',    desc: 'Guided walks, cultural tours, sailing charters, and adventure experiences.', accent: '#6B7A4A', Icon: Compass },
  { key: 'craft',        name: 'Craft',        label: 'Makers & studios',       desc: 'Ceramicists, woodworkers, textile artists, and studio potters.',          accent: '#C1603A', Icon: Hammer },
  { key: 'collection',   name: 'Culture',      label: 'Galleries & museums',    desc: 'Art museums, public galleries, and cultural collections.',                accent: '#7A6B8A', Icon: Landmark },
  { key: 'corner',       name: 'Corner',       label: 'Independent shops',      desc: 'Bookshops, record stores, homewares, and design studios.',                accent: '#5F8A7E', Icon: ShoppingBag },
  { key: 'found',        name: 'Found',        label: 'Vintage & secondhand',   desc: 'Antique dealers, op shops, salvage yards, and curated secondhand.',       accent: '#D4956A', Icon: Clock },
]

// The "Ten kinds of independent place" comprehension grid, now anchored at the
// foot of the homepage and collapsed by default — a tidy, optional "browse all
// categories" affordance rather than an upfront wall of ten tiles. Toggling
// mounts the grid plainly (no .reveal class: the homepage IntersectionObserver
// only fires on mount, so cards added on toggle would otherwise stay at
// opacity:0). All data arrives as serializable props; the icons live here
// because component references can't cross the server→client boundary.
export default function CategoryGuideSection({ publicVerticals = [], verticalCounts = {}, verticalCount = 10 }) {
  const [open, setOpen] = useState(false)

  const word = COUNT_WORDS[verticalCount] || String(verticalCount)
  const cards = VERTICAL_GUIDE.filter(v => publicVerticals.includes(v.key))

  return (
    <section style={{
      paddingBlock: '84px',
      background: 'linear-gradient(180deg, #F6F1E9 0%, var(--color-stone) 100%)',
      borderTop: '1px solid rgba(28,26,23,0.06)',
    }}>
      <div className="max-w-6xl mx-auto px-6 sm:px-12">
        <div className="text-center" style={{ marginBottom: '34px' }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600,
            letterSpacing: '0.22em', textTransform: 'uppercase',
            color: GOLD, marginBottom: '16px',
          }}>
            What you&apos;ll find
          </p>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400,
            fontSize: 'clamp(30px, 4vw, 50px)', color: 'var(--color-ink)',
            lineHeight: 1.15, marginBottom: '14px', textWrap: 'balance',
          }}>
            {word} kinds of independent place
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px',
            lineHeight: 1.65, color: 'var(--color-muted)',
            maxWidth: '540px', margin: '0 auto',
          }}>
            Every place we list belongs to one of {word.toLowerCase()} categories. Browse a category on its own, or search across all of them at once.
          </p>
        </div>

        {/* Toggle — reveals/hides the category grid. aria-expanded/controls keep
            it legible to assistive tech; the chevron flips with `open`. */}
        <div className="text-center" style={{ marginBottom: open ? '40px' : '0' }}>
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            aria-controls="category-guide-grid"
            className="inline-flex items-center gap-2 transition-opacity hover:opacity-85"
            style={{
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px',
              letterSpacing: '0.04em',
              color: 'var(--color-ink)', background: '#FFFFFF',
              border: '1px solid var(--color-border)', borderRadius: '999px',
              padding: '12px 22px', minHeight: 44, cursor: 'pointer',
            }}
          >
            {open ? 'Hide categories' : `Browse the ${word.toLowerCase()} categories`}
            <ChevronDown
              size={16}
              strokeWidth={1.8}
              aria-hidden="true"
              style={{ color: GOLD, transition: 'transform 0.25s ease', transform: open ? 'rotate(180deg)' : 'none' }}
            />
          </button>
        </div>

        {open && (
          <>
            <div id="category-guide-grid" className="vguide-grid">
              {cards.map((v) => {
                const Icon = v.Icon
                const ground = (VERTICAL_CARD_TOKENS[v.key] || {}).bg || v.accent
                return (
                  <Link
                    key={v.key}
                    href={`/search?vertical=${v.key}`}
                    className="vguide-card group block"
                    style={{
                      '--vc': ground,
                      background: '#FFFFFF',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-card)',
                      padding: '22px 22px 20px',
                      display: 'flex',
                      flexDirection: 'column',
                      minHeight: '150px',
                    }}
                  >
                    <div className="flex items-center justify-between" style={{ marginBottom: '14px' }}>
                      <div className="flex items-center" style={{ gap: '11px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: '36px', height: '36px', borderRadius: '10px',
                          background: `${ground}14`,
                        }}>
                          <Icon size={18} strokeWidth={1.6} style={{ color: ground }} />
                        </span>
                        <span style={{
                          fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600,
                          letterSpacing: '0.1em', textTransform: 'uppercase',
                          color: 'var(--color-ink)',
                        }}>
                          {v.label}
                        </span>
                      </div>
                      <span className="vguide-arrow" aria-hidden="true" style={{
                        color: ground, fontSize: '16px', fontWeight: 500, lineHeight: 1,
                      }}>
                        &rarr;
                      </span>
                    </div>
                    <h3 style={{
                      fontFamily: 'var(--font-display)', fontWeight: 400,
                      fontSize: '21px', lineHeight: 1.2, color: 'var(--color-ink)',
                      marginBottom: '7px',
                    }}>
                      {v.name}
                    </h3>
                    <p style={{
                      fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '13.5px',
                      lineHeight: 1.55, color: 'var(--color-muted)', margin: 0,
                    }}>
                      {v.desc}
                    </p>
                    {verticalCounts[v.key] > 0 && (
                      <p style={{
                        fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '11.5px',
                        letterSpacing: '0.04em', color: ground,
                        margin: 0, marginTop: 'auto', paddingTop: '12px',
                      }}>
                        {verticalCounts[v.key].toLocaleString()} places
                      </p>
                    )}
                  </Link>
                )
              })}
            </div>

            <div className="text-center" style={{ marginTop: '34px' }}>
              <Link href="/explore" className="inline-flex items-center gap-2 hover:opacity-80 transition-opacity" style={{
                fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px',
                color: GOLD, padding: '10px 4px', minHeight: 44,
              }}>
                See everything on one page &rarr;
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
