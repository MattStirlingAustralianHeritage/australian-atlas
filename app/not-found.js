import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-24" style={{ background: 'var(--color-bg)' }}>
      <div className="text-center max-w-md">
        <h1
          className="mb-4"
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
          className="mb-8"
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 300,
            fontSize: '18px',
            color: 'var(--color-muted)',
          }}
        >
          Page not found
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          {[
            { href: '/', label: 'Home' },
            { href: '/explore', label: 'Explore' },
            { href: '/regions', label: 'Regions' },
            { href: '/search', label: 'Search' },
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
