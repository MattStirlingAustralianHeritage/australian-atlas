import Link from 'next/link'

const verticals = [
  { name: 'Small Batch Atlas', url: 'https://smallbatchatlas.com.au' },
  { name: 'Culture Atlas', url: 'https://collectionatlas.com.au' },
  { name: 'Craft Atlas', url: 'https://craftatlas.com.au' },
  { name: 'Fine Grounds Atlas', url: 'https://finegroundsatlas.com.au' },
  { name: 'Rest Atlas', url: 'https://restatlas.com.au' },
  { name: 'Field Atlas', url: 'https://fieldatlas.com.au' },
  { name: 'Corner Atlas', url: 'https://corneratlas.com.au' },
  { name: 'Found Atlas', url: 'https://foundatlas.com.au' },
  { name: 'Table Atlas', url: 'https://tableatlas.com.au' },
]

export default function Footer() {
  return (
    <footer className="bg-[var(--color-bg)]" style={{ borderTop: '0.5px solid var(--color-border)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <h3
              className="mb-2"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 400,
                fontSize: '18px',
                color: 'var(--color-ink)',
              }}
            >
              Australian Atlas
            </h3>
            <p
              className="leading-relaxed"
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 300,
                fontSize: '13px',
                color: 'var(--color-muted)',
              }}
            >
              The complete guide to independent Australia. Nine atlases, one map.
            </p>
          </div>

          {/* The Network */}
          <div>
            <h4
              className="mb-3 uppercase"
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 500,
                fontSize: '11px',
                letterSpacing: '0.1em',
                color: 'var(--color-muted)',
              }}
            >
              The Network
            </h4>
            <ul className="space-y-1.5">
              {verticals.map(v => (
                <li key={v.url}>
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[var(--color-ink)] transition-colors"
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 300,
                      fontSize: '13px',
                      color: 'var(--color-muted)',
                    }}
                  >
                    {v.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Links */}
          <div>
            <h4
              className="mb-3 uppercase"
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 500,
                fontSize: '11px',
                letterSpacing: '0.1em',
                color: 'var(--color-muted)',
              }}
            >
              Explore
            </h4>
            <ul className="space-y-1.5">
              {[
                { href: '/explore', label: 'Browse by vertical' },
                { href: '/map', label: 'Map' },
                { href: '/regions', label: 'Browse by region' },
                { href: '/search', label: 'Search all listings' },
                { href: '/for-councils', label: 'For Councils' },
                { href: '/about', label: 'About' },
              ].map(link => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="hover:text-[var(--color-ink)] transition-colors"
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 300,
                      fontSize: '13px',
                      color: 'var(--color-muted)',
                    }}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div
          className="mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-2"
          style={{ borderTop: '0.5px solid var(--color-border)' }}
        >
          <p className="text-xs text-[var(--color-muted)]">
            Part of{' '}
            <a
              href="https://australianheritage.au"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-sage)] underline underline-offset-2 hover:text-[var(--color-ink)]"
            >
              Australian Heritage
            </a>
          </p>
          <p className="text-xs text-[var(--color-muted)]">&copy; 2026 Australian Atlas</p>
        </div>
      </div>
    </footer>
  )
}
