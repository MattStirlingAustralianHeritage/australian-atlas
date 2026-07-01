import { getRequestConfig } from 'next-intl/server'
import { headers } from 'next/headers'
import { defaultLocale, isLocale, LOCALE_HEADER } from '@/lib/i18n/config'

// next-intl "without i18n routing" request config. The active locale is resolved
// from the `x-atlas-locale` request header that middleware.js injects for `/ko`
// requests; everything else falls back to the default locale (English).
//
// Messages are loaded relative to this file so both locales are bundled and
// resolvable at build time.
export default getRequestConfig(async () => {
  const requested = headers().get(LOCALE_HEADER)
  const locale = isLocale(requested) ? requested : defaultLocale
  const messages = (await import(`../messages/${locale}.json`)).default
  return { locale, messages }
})
