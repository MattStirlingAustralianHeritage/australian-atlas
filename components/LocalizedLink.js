'use client'

import Link from 'next/link'
import { useLocale } from 'next-intl'
import { localizePath } from '@/lib/i18n/config'

// Drop-in replacement for next/link that keeps navigation within the active
// locale: internal hrefs are prefixed with `/ko` when the locale is Korean
// (as-needed — English is unprefixed). External, protocol-relative, and hash
// links are passed through untouched.
export default function LocalizedLink({ href, children, ...rest }) {
  const locale = useLocale()
  let localized = href
  if (typeof href === 'string' && href.startsWith('/') && !href.startsWith('//')) {
    localized = localizePath(href, locale)
  }
  return (
    <Link href={localized} {...rest}>
      {children}
    </Link>
  )
}
