import Link from 'next/link'

export default function Nav() {
  return (
    <nav
      className="sticky top-0 z-50 bg-[var(--color-bg)]"
      style={{ borderBottom: '0.5px solid var(--color-border)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between" style={{ height: '52px' }}>
        <Link
          href="/"
          className="tracking-tight"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: '17px',
            color: 'var(--color-ink)',
          }}
        >
          Australian Atlas
        </Link>
        <div className="flex items-center gap-6">
          {[
            { href: '/explore', label: 'Explore' },
            { href: '/map', label: 'Map' },
            { href: '/events', label: 'Events' },
            { href: '/regions', label: 'Regions' },
            { href: '/search', label: 'Search' },
          ].map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="hover:text-[var(--color-ink)] transition-colors"
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 400,
                fontSize: '13px',
                color: 'var(--color-muted)',
              }}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}
