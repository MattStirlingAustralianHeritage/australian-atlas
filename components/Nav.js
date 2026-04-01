import Link from 'next/link'

export default function Nav() {
  return (
    <nav className="border-b border-[var(--color-border)] bg-[var(--color-cream)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="font-[family-name:var(--font-serif)] text-xl font-bold tracking-tight">
          Australian Atlas
        </Link>
        <div className="flex items-center gap-6 text-sm">
          <Link href="/explore" className="text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors">
            Explore
          </Link>
          <Link href="/regions" className="text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors">
            Regions
          </Link>
          <Link href="/search" className="text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors">
            Search
          </Link>
        </div>
      </div>
    </nav>
  )
}
