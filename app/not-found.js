import Link from 'next/link'

/**
 * Global 404 page (server component).
 * Rendered when no route matches.
 */
export default function NotFound() {
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-24" style={{ background: 'var(--color-bg)' }}>
      <div className="text-center max-w-md">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="var(--color-gold)" aria-hidden="true" style={{ margin: '0 auto 18px', display: 'block', opacity: 0.9 }}>
          <path d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6L12 0z" />
        </svg>
        <p
          className="mb-3"
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            fontSize: '11px',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--color-gold)',
          }}
        >
          Error 404
        </p>
        <h1
          className="mb-2"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: 'clamp(34px, 6vw, 48px)',
            letterSpacing: '-0.015em',
            color: 'var(--color-ink)',
            lineHeight: 1.08,
          }}
        >
          Off the map, <em>for now</em>.
        </h1>
        <p
          className="mb-8"
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 300,
            fontSize: '15px',
            color: 'var(--color-muted)',
            lineHeight: 1.6,
          }}
        >
          The page you're looking for may have moved or no longer exists.
          Everything we do list is verified and mapped — try one of these.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {[
            { href: '/map', label: 'Explore the map' },
            { href: '/search', label: 'Search' },
            { href: '/regions', label: 'Regions' },
            { href: '/', label: 'Home' },
          ].map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="px-4 py-2 rounded-lg transition-colors"
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 400,
                fontSize: '14px',
                color: 'var(--color-accent)',
                border: '0.5px solid var(--color-border)',
              }}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
