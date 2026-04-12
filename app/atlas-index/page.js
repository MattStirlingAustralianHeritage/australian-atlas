import { cache } from 'react'
import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import VerticalBadge from '@/components/VerticalBadge'

export const revalidate = 3600

export const metadata = {
  title: 'Atlas Index \u2014 A to Z | Australian Atlas',
  description:
    'Browse every listing in the Australian Atlas network alphabetically. A comprehensive directory of independent venues, makers, stays, and cultural places across Australia.',
}

// ── Data fetching ────────────────────────────────────────────

const getAllListings = cache(async function getAllListings() {
  const sb = getSupabaseAdmin()
  const PAGE_SIZE = 1000
  let all = []
  let from = 0

  while (true) {
    const { data, error } = await sb
      .from('listings')
      .select('id, name, slug, vertical, region, state')
      .eq('status', 'active')
      .order('name', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      console.error('Atlas index fetch error:', error)
      break
    }

    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return all
})

// ── Helpers ──────────────────────────────────────────────────

function getLetterKey(name) {
  if (!name) return '#'
  const first = name.trim().charAt(0).toUpperCase()
  if (first >= 'A' && first <= 'Z') return first
  return '#'
}

function groupByLetter(listings) {
  const groups = {}
  for (const item of listings) {
    const key = getLetterKey(item.name)
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
  }
  return groups
}

const ALPHABET = [
  '#',
  ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)),
]

// ── Page ─────────────────────────────────────────────────────

export default async function AtlasIndexPage() {
  const listings = await getAllListings()
  const grouped = groupByLetter(listings)
  const totalCount = listings.length

  // Letters that have listings
  const activeLetters = new Set(Object.keys(grouped))

  return (
    <main style={{ fontFamily: 'var(--font-body)' }}>
      {/* Header */}
      <header
        style={{
          maxWidth: '72rem',
          margin: '0 auto',
          padding: '3rem 1.5rem 1.5rem',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: '2.25rem',
            lineHeight: 1.15,
            color: 'var(--color-ink)',
            margin: 0,
          }}
        >
          Atlas Index
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.9375rem',
            color: 'var(--color-muted)',
            marginTop: '0.5rem',
            marginBottom: 0,
          }}
        >
          {totalCount.toLocaleString()} listings across Australia, A to Z
        </p>
      </header>

      {/* Sticky alphabet nav */}
      <nav
        style={{
          position: 'sticky',
          top: '52px',
          zIndex: 40,
          background: 'var(--color-bg)',
          borderBottom: '0.5px solid var(--color-border)',
        }}
      >
        <div
          style={{
            maxWidth: '72rem',
            margin: '0 auto',
            padding: '0 1.5rem',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: '0.125rem',
              padding: '0.625rem 0',
            }}
          >
            {ALPHABET.map((letter) => {
              const isActive = activeLetters.has(letter)
              return (
                <a
                  key={letter}
                  href={isActive ? `#letter-${letter === '#' ? 'num' : letter}` : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '2rem',
                    height: '2rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    fontFamily: 'var(--font-body)',
                    textDecoration: 'none',
                    flexShrink: 0,
                    color: isActive ? 'var(--color-ink)' : 'var(--color-border)',
                    cursor: isActive ? 'pointer' : 'default',
                    transition: 'background 0.15s, color 0.15s',
                    background: 'transparent',
                  }}
                >
                  {letter}
                </a>
              )
            })}
          </div>
        </div>
      </nav>

      {/* Letter sections */}
      <div
        style={{
          maxWidth: '72rem',
          margin: '0 auto',
          padding: '1rem 1.5rem 4rem',
        }}
      >
        {ALPHABET.map((letter) => {
          const items = grouped[letter]
          if (!items || items.length === 0) return null
          const anchorId = `letter-${letter === '#' ? 'num' : letter}`

          return (
            <section
              key={letter}
              id={anchorId}
              style={{ scrollMarginTop: '120px' }}
            >
              {/* Letter heading */}
              <div
                style={{
                  position: 'sticky',
                  top: '100px',
                  zIndex: 30,
                  background: 'var(--color-bg)',
                  borderBottom: '1px solid var(--color-border)',
                  padding: '1rem 0 0.5rem',
                  marginTop: '1.5rem',
                }}
              >
                <h2
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 400,
                    fontSize: '1.75rem',
                    color: 'var(--color-ink)',
                    margin: 0,
                    lineHeight: 1,
                  }}
                >
                  {letter === '#' ? '#' : letter}
                </h2>
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--color-muted)',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {items.length} {items.length === 1 ? 'listing' : 'listings'}
                </span>
              </div>

              {/* Listing rows */}
              <ul
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                }}
              >
                {items.map((item) => (
                  <li
                    key={item.id}
                    style={{
                      borderBottom: '0.5px solid var(--color-border)',
                    }}
                  >
                    <Link
                      href={`/place/${item.slug}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.625rem 0',
                        textDecoration: 'none',
                        transition: 'background 0.1s',
                      }}
                    >
                      {/* Name */}
                      <span
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: '0.9375rem',
                          fontWeight: 450,
                          color: 'var(--color-ink)',
                          flex: 1,
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.name}
                      </span>

                      {/* Region / State */}
                      <span
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: '0.8125rem',
                          color: 'var(--color-muted)',
                          flexShrink: 0,
                          display: 'none',
                        }}
                        className="atlas-index-meta"
                      >
                        {[item.region, item.state].filter(Boolean).join(', ')}
                      </span>

                      {/* Vertical badge */}
                      <span style={{ flexShrink: 0 }}>
                        <VerticalBadge vertical={item.vertical} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      {/* Responsive styles for showing region/state on larger screens */}
      <style>{`
        .atlas-index-meta {
          display: none !important;
        }
        @media (min-width: 640px) {
          .atlas-index-meta {
            display: inline !important;
          }
        }
        nav div::-webkit-scrollbar {
          display: none;
        }
        section li:hover {
          background: color-mix(in srgb, var(--color-border) 20%, transparent);
        }
        nav a:hover {
          background: color-mix(in srgb, var(--color-border) 30%, transparent);
        }
      `}</style>
    </main>
  )
}
