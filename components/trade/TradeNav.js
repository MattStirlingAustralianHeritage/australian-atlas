import Link from 'next/link'

/**
 * Atlas Trade — shared workspace nav. Rendered at the top of every gated
 * trade page so the SaaS reads as one product, not scattered pages.
 * Server-safe (no client hooks); pass the current key for the active state.
 */
const LINKS = [
  { key: 'home', href: '/trade', label: 'Workspace' },
  { key: 'directory', href: '/trade/directory', label: 'Directory' },
  { key: 'builder', href: '/trade/builder', label: 'Builder' },
  { key: 'itineraries', href: '/trade/itineraries', label: 'Itineraries' },
  { key: 'enquiries', href: '/trade/enquiries', label: 'Enquiries' },
  { key: 'settings', href: '/trade/settings', label: 'Settings' },
]

export default function TradeNav({ active, orgName }) {
  return (
    <div style={{ borderBottom: '1px solid var(--color-border)', background: 'white' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '14px 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <Link href="/trade" style={{ textDecoration: 'none', display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, color: 'var(--color-ink)' }}>Australian Atlas</span>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-gold)' }}>Trade</span>
          </Link>
          <nav style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {LINKS.map((l) => (
              <Link
                key={l.key}
                href={l.href}
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: active === l.key ? 700 : 500,
                  color: active === l.key ? 'var(--color-ink)' : 'var(--color-muted)',
                  background: active === l.key ? 'rgba(196,155,59,0.14)' : 'transparent',
                  padding: '6px 12px', borderRadius: 99, textDecoration: 'none',
                }}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        {orgName && (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)' }}>{orgName}</span>
        )}
      </div>
    </div>
  )
}
