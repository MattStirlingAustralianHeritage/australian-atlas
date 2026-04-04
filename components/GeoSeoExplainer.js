/**
 * GeoSeoExplainer — condensed 2-block version of the GEO/SEO discovery explainer.
 * Designed for listing pages, sidebar contexts, and any page that benefits from
 * explaining the SEO + GEO discovery landscape in a compact format.
 *
 * Props:
 *   regionName (string, optional) — personalise copy with a region name
 *   variant ('light' | 'cream') — background treatment, default 'light'
 */

import Link from 'next/link'

export default function GeoSeoExplainer({ regionName, variant = 'light' }) {
  const bg = variant === 'cream' ? 'var(--color-cream)' : 'var(--color-bg)'
  const regionLabel = regionName || 'your region'

  return (
    <div style={{
      background: bg,
      borderRadius: 12,
      border: '1px solid var(--color-border)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 0' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 6,
        }}>
          Discovery Infrastructure
        </p>
        <h3 style={{
          fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400,
          color: 'var(--color-ink)', lineHeight: 1.3, margin: '0 0 4px',
        }}>
          How this listing gets discovered
        </h3>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 300,
          color: 'var(--color-muted)', lineHeight: 1.5, margin: '0 0 16px',
        }}>
          Every listing on Australian Atlas is structured for both traditional search and
          the emerging AI-powered discovery layer.
        </p>
      </div>

      {/* Two blocks */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 0, borderTop: '1px solid var(--color-border)',
      }}>
        {/* SEO */}
        <div style={{
          padding: '16px 20px',
          borderRight: '1px solid var(--color-border)',
        }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--color-muted)', marginBottom: 6,
          }}>
            SEO
          </p>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 300,
            color: 'var(--color-muted)', lineHeight: 1.5, margin: 0,
          }}>
            Structured schema.org data, canonical URL, and regional page links help search
            engines surface this listing for relevant queries about {regionLabel}.
          </p>
        </div>

        {/* GEO */}
        <div style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'var(--color-sage)', margin: 0,
            }}>
              GEO
            </p>
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: 9, fontWeight: 600,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              color: 'white', background: 'var(--color-sage)',
              padding: '1px 6px', borderRadius: 99,
            }}>
              Emerging
            </span>
          </div>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 300,
            color: 'var(--color-muted)', lineHeight: 1.5, margin: 0,
          }}>
            Verified entity data and cross-vertical linking make this listing citable by AI
            tools like ChatGPT and Google AI Overviews when answering travel questions.
          </p>
        </div>
      </div>

      {/* CTA */}
      <div style={{
        padding: '12px 20px',
        borderTop: '1px solid var(--color-border)',
        textAlign: 'center',
      }}>
        <Link
          href="/for-councils"
          style={{
            fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500,
            color: 'var(--color-sage)', textDecoration: 'underline',
            textUnderlineOffset: 3,
          }}
        >
          Learn more about discovery infrastructure for councils
        </Link>
      </div>
    </div>
  )
}
