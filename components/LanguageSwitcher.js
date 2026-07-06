'use client'

import { useState, useRef, useEffect } from 'react'
import { useLocale } from 'next-intl'
import { usePathname } from 'next/navigation'
import { splitLocale, localizePath, locales, LOCALE_LABELS } from '@/lib/i18n/config'

// Native name (primary) + English gloss (secondary) shown in the open menu.
// LOCALE_LABELS supplies the short label used on the collapsed trigger pill.
const LOCALE_META = {
  en: { native: 'English', sub: 'English' },
  ko: { native: '한국어', sub: 'Korean' },
  zh: { native: '中文', sub: 'Chinese' },
}

// Language switcher rendered as a collapsed globe-pill that toggles a dropdown
// of the available locales (EN · 한국어 · 中文). Choosing a locale round-trips the
// current path: it strips the active locale prefix off the browser pathname and
// re-applies the target locale, so /place/x ⇄ /ko/place/x maps one-to-one. Uses
// a full navigation (not a soft router push) because the locale is resolved in
// the root layout — only a fresh document request re-runs it and re-renders
// <html lang>, messages, and content in the target language.
//
// `align` positions the dropdown against the trigger: 'right' (default) for the
// right-edge desktop header, 'left' for the left-aligned mobile menu.
export default function LanguageSwitcher({ align = 'right' }) {
  const locale = useLocale()
  const pathname = usePathname() || '/'
  const { basePath } = splitLocale(pathname)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close on outside click or Escape while the menu is open.
  useEffect(() => {
    if (!open) return
    function onPointer(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const go = (loc) => {
    setOpen(false)
    if (loc === locale) return
    // Persist the choice so it sticks across ALL later navigation (even plain
    // next/link that doesn't carry the /ko prefix) — the middleware reads this
    // cookie. Switching to EN clears the sticky-Korean state.
    document.cookie = `atlas_locale=${loc}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    // Preserve the current query string + hash across the switch (usePathname
    // returns only the path), so /search?q=… and #anchors survive the toggle.
    window.location.assign(localizePath(basePath, loc) + window.location.search + window.location.hash)
  }

  const currentLabel = LOCALE_LABELS[locale] || locale.toUpperCase()

  return (
    <div className="lang-switch" ref={ref}>
      <button
        type="button"
        className="lang-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Change language"
      >
        <svg className="lang-globe" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
        </svg>
        <span lang={locale}>{currentLabel}</span>
        <svg className="lang-caret" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="lang-menu" data-align={align} role="menu" aria-label="Language">
          {locales.map((loc) => {
            const meta = LOCALE_META[loc] || { native: LOCALE_LABELS[loc] || loc.toUpperCase(), sub: loc.toUpperCase() }
            const active = loc === locale
            return (
              <button
                key={loc}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                aria-current={active ? 'true' : undefined}
                className="lang-option"
                onClick={() => go(loc)}
                lang={loc}
              >
                <span className="lang-labels">
                  <span className="lang-native">{meta.native}</span>
                  {meta.sub !== meta.native && <span className="lang-sub">{meta.sub}</span>}
                </span>
                <svg className="lang-check" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
