import Link from 'next/link'

const verticals = [
  { name: 'Small Batch Atlas', url: 'https://smallbatchatlas.com.au' },
  { name: 'Collection Atlas', url: 'https://collectionatlas.com.au' },
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
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-cream)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <h3 className="font-[family-name:var(--font-serif)] text-lg font-bold mb-2">Australian Atlas</h3>
            <p className="text-sm text-[var(--color-muted)] leading-relaxed">
              A family of curated directories celebrating the best of independent Australia.
            </p>
          </div>

          {/* The Network */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-3">The Network</h4>
            <ul className="space-y-1.5">
              {verticals.map(v => (
                <li key={v.url}>
                  <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors">
                    {v.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-3">Explore</h4>
            <ul className="space-y-1.5">
              <li><Link href="/explore" className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors">Browse by vertical</Link></li>
              <li><Link href="/regions" className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors">Browse by region</Link></li>
              <li><Link href="/search" className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors">Search all listings</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-[var(--color-border)] flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-[var(--color-muted)]">
            Part of <a href="https://australianheritage.au" target="_blank" rel="noopener noreferrer" className="text-[var(--color-sage)] underline underline-offset-2 hover:text-[var(--color-ink)]">Australian Heritage</a>
          </p>
          <p className="text-xs text-[var(--color-muted)]">&copy; 2026 Australian Atlas</p>
        </div>
      </div>
    </footer>
  )
}
