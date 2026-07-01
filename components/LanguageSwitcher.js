'use client'

import { useLocale } from 'next-intl'
import { usePathname } from 'next/navigation'
import { splitLocale, localizePath, locales } from '@/lib/i18n/config'

const LABELS = { en: 'EN', ko: '한국어' }

// EN ⇄ KO toggle that round-trips the current path: it strips the active
// locale prefix off the browser pathname and re-applies the target locale, so
// /place/x ⇄ /ko/place/x maps one-to-one. Uses a full navigation (not a soft
// router push) because the locale is resolved in the root layout — only a fresh
// document request re-runs it and re-renders <html lang>, messages, and content
// in the target language.
export default function LanguageSwitcher() {
  const locale = useLocale()
  const pathname = usePathname() || '/'
  const { basePath } = splitLocale(pathname)
  const go = (loc) => {
    if (loc === locale) return
    // Preserve the current query string + hash across the switch (usePathname
    // returns only the path), so /search?q=… and #anchors survive the toggle.
    window.location.assign(localizePath(basePath, loc) + window.location.search + window.location.hash)
  }

  return (
    <div
      role="group"
      aria-label="Language"
      style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}
    >
      {locales.map((loc, i) => (
        <span key={loc} style={{ display: 'inline-flex', alignItems: 'center' }}>
          {i > 0 && (
            <span aria-hidden="true" style={{ color: 'var(--color-border)', margin: '0 4px' }}>·</span>
          )}
          <button
            type="button"
            onClick={() => go(loc)}
            aria-current={loc === locale ? 'true' : undefined}
            lang={loc}
            style={{
              background: 'none',
              border: 'none',
              cursor: loc === locale ? 'default' : 'pointer',
              padding: '2px 2px',
              fontFamily: 'var(--font-body)',
              fontSize: '12px',
              fontWeight: loc === locale ? 600 : 400,
              color: loc === locale ? 'var(--color-ink)' : 'var(--color-muted)',
            }}
          >
            {LABELS[loc] || loc.toUpperCase()}
          </button>
        </span>
      ))}
    </div>
  )
}
