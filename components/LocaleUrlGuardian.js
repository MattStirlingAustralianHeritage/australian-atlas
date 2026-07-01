'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useLocale } from 'next-intl'
import { defaultLocale } from '@/lib/i18n/config'

// The Korean surface is served by a middleware rewrite (/ko/x → /x + a locale
// header). App Router reconciles the browser URL to the rewrite *destination*
// on hydration, which drops the visible `/ko` prefix. This guardian re-asserts
// the prefix client-side whenever the active locale is Korean but the address
// bar lost it, so /ko URLs survive reload and sharing. It never touches English
// (locale === defaultLocale), so English URLs are unaffected.
export default function LocaleUrlGuardian() {
  const locale = useLocale()
  const pathname = usePathname()

  useEffect(() => {
    if (locale === defaultLocale) return
    const prefix = `/${locale}`
    const current = window.location.pathname
    if (current === prefix || current.startsWith(prefix + '/')) return
    const fixed =
      prefix +
      (current === '/' ? '' : current) +
      window.location.search +
      window.location.hash
    window.history.replaceState(window.history.state, '', fixed)
  }, [locale, pathname])

  return null
}
