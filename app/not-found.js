import Link from 'next/link'

/**
 * Global 404 page (server component).
 * Rendered when no route matches.
 */
export default function NotFound() {
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-24" style={{ background: 'var(--color-bg)' }}>
      <div className="text-center max-w-md">
        <h1
          className="mb-2"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: '72px',
            color: 'var(--color-muted)',
            lineHeight: 1,
          }}
        >
          404
        </h1>
        <p
          className="mb-2"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: '20px',
            color: 'var(--color-ink)',
            fontStyle: 'italic',
          }}
        >
          This page doesn't exist
        </p>
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
          Try exploring the map or searching for what you need.
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
