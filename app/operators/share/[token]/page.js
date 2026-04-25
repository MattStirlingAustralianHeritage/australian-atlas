import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getListingRegion } from '@/lib/regions'

export async function generateMetadata({ params }) {
  const { token } = await params
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://australianatlas.com.au'

  try {
    const res = await fetch(`${baseUrl}/api/operators/share/${token}`, { cache: 'no-store' })
    if (!res.ok) return { title: 'Itinerary — Australian Atlas' }
    const data = await res.json()
    return {
      title: `${data.name} — Australian Atlas`,
      description: data.description || 'A curated collection from Australian Atlas',
    }
  } catch {
    return { title: 'Itinerary — Australian Atlas' }
  }
}

export default async function SharedPage({ params }) {
  const { token } = await params
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://australianatlas.com.au'

  let data = null
  try {
    const res = await fetch(`${baseUrl}/api/operators/share/${token}`, { cache: 'no-store' })
    if (!res.ok) notFound()
    data = await res.json()
  } catch {
    notFound()
  }

  if (!data) notFound()

  const isTrail = data.type === 'trail'
  const operatorName = data.operator_name || null
  const operatorLogo = data.operator_logo || null

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF6' }}>
      {/* Minimal header */}
      <header style={{
        borderBottom: '1px solid rgba(28,26,23,0.08)',
        background: '#fff',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {operatorLogo && (
            <img
              src={operatorLogo}
              alt=""
              style={{ height: 28, width: 'auto', objectFit: 'contain' }}
            />
          )}
          {operatorName && (
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
              color: 'var(--color-ink)',
            }}>
              {operatorName}
            </span>
          )}
        </div>
      </header>

      {/* Content */}
      <main style={{ maxWidth: 800, margin: '0 auto', padding: '3rem 1.5rem' }}>
        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 'clamp(24px, 4vw, 36px)',
            fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.2,
            marginBottom: 8,
          }}>
            {data.name}
          </h1>
          {data.description && (
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300,
              color: 'var(--color-muted)', lineHeight: 1.6,
              maxWidth: 560, margin: '0 auto',
            }}>
              {data.description}
            </p>
          )}
          {data.region && (
            <span style={{
              display: 'inline-block', marginTop: 12,
              fontSize: 12, fontWeight: 500, padding: '4px 12px',
              borderRadius: 99, background: 'rgba(95,138,126,0.1)',
              color: 'var(--color-sage)', fontFamily: 'var(--font-body)',
            }}>
              {data.region}
            </span>
          )}
        </div>

        {/* Collection: venue cards */}
        {!isTrail && data.venues && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {data.venues.map((venue, i) => (
              <div key={venue.id || i} style={{
                background: '#fff', borderRadius: 12, padding: '20px 24px',
                border: '1px solid rgba(28,26,23,0.08)',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{
                      fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400,
                      color: 'var(--color-ink)', margin: '0 0 4px',
                    }}>
                      {venue.name}
                    </h3>
                    {venue.description && (
                      <p style={{
                        fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
                        color: 'var(--color-muted)', lineHeight: 1.5, margin: '6px 0 0',
                      }}>
                        {venue.description}
                      </p>
                    )}
                    {(() => {
                      const r = getListingRegion(venue)
                      return r && (
                        <p style={{
                          fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 400,
                          color: 'var(--color-muted)', margin: '8px 0 0',
                        }}>
                          {r.name}
                        </p>
                      )
                    })()}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                    {venue.category && (
                      <span style={{
                        fontSize: 11, fontWeight: 500, padding: '2px 8px',
                        borderRadius: 99, background: 'var(--color-bg)',
                        color: 'var(--color-muted)', fontFamily: 'var(--font-body)',
                      }}>
                        {venue.category.replace(/_/g, ' ')}
                      </span>
                    )}
                    {venue.listing_url && (
                      <a
                        href={venue.listing_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontFamily: 'var(--font-body)', fontSize: 12,
                          color: 'var(--color-sage)', textDecoration: 'underline',
                          textUnderlineOffset: 2,
                        }}
                      >
                        View listing
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Trail: day-by-day itinerary */}
        {isTrail && data.days && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {data.days.map((day, dayIndex) => (
              <div key={dayIndex}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  marginBottom: 16,
                }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 32, height: 32, borderRadius: '50%',
                    background: 'var(--color-sage)', color: '#fff',
                    fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600,
                  }}>
                    {dayIndex + 1}
                  </span>
                  <h2 style={{
                    fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400,
                    color: 'var(--color-ink)', margin: 0,
                  }}>
                    {day.title || `Day ${dayIndex + 1}`}
                  </h2>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 44 }}>
                  {day.stops?.map((stop, stopIndex) => (
                    <div key={stop.id || stopIndex} style={{
                      background: '#fff', borderRadius: 10, padding: '16px 20px',
                      border: '1px solid rgba(28,26,23,0.08)',
                      position: 'relative',
                    }}>
                      {/* Connector line */}
                      {stopIndex < (day.stops?.length || 0) - 1 && (
                        <div style={{
                          position: 'absolute', left: -22, top: '100%',
                          width: 1, height: 12, background: 'rgba(28,26,23,0.12)',
                        }} />
                      )}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div>
                          <h4 style={{
                            fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500,
                            color: 'var(--color-ink)', margin: '0 0 2px',
                          }}>
                            {stop.name}
                          </h4>
                          {stop.description && (
                            <p style={{
                              fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
                              color: 'var(--color-muted)', lineHeight: 1.5, margin: 0,
                            }}>
                              {stop.description}
                            </p>
                          )}
                        </div>
                        {stop.category && (
                          <span style={{
                            fontSize: 10, fontWeight: 500, padding: '2px 6px',
                            borderRadius: 99, background: 'var(--color-bg)',
                            color: 'var(--color-muted)', fontFamily: 'var(--font-body)',
                            flexShrink: 0,
                          }}>
                            {stop.category.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid rgba(28,26,23,0.08)',
        padding: '24px',
        textAlign: 'center',
        marginTop: 60,
      }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 400,
            color: 'var(--color-muted)',
          }}>
            Powered by{' '}
            <span style={{ color: 'var(--color-sage)', fontWeight: 500 }}>Australian Atlas</span>
          </p>
        </Link>
      </footer>
    </div>
  )
}
