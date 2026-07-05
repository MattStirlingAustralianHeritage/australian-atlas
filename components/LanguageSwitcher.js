'use client'

import { useLocale } from 'next-intl'
import { usePathname } from 'next/navigation'
import { splitLocale, localizePath, locales, LOCALE_LABELS } from '@/lib/i18n/config'

const LABELS = LOCALE_LABELS

// EN · 한국어 · 中文 switcher that round-trips the current path: it strips the active
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
    // Persist the choice so it sticks across ALL later navigation (even plain
    // next/link that doesn't carry the /ko prefix) — the middleware reads this
    // cookie. Switching to EN clears the sticky-Korean state.
    document.cookie = `atlas_locale=${loc}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
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
