// Korean launch (feat/ko-launch) — i18n routing config.
//
// next-intl is used in "without i18n routing" mode: English URLs are never
// prefixed and are served by the existing route tree untouched. Korean is
// served under a `/ko` prefix via a middleware rewrite (see middleware.js),
// which keeps the browser URL prefixed while internally serving the same route
// with an `x-atlas-locale: ko` header that i18n/request.js reads.
//
// This module is imported from the edge middleware, server components, and
// client components, so it must stay pure JS with no Node/Next APIs.

export const locales = ['en', 'ko']
export const defaultLocale = 'en'
// Matches the spec's requested `localePrefix: 'as-needed'` semantics: the
// default locale is unprefixed, every other locale is prefixed.
export const localePrefix = 'as-needed'

// The request header the middleware injects and i18n/request.js reads.
export const LOCALE_HEADER = 'x-atlas-locale'

export function isLocale(value) {
  return typeof value === 'string' && locales.includes(value)
}

// Non-default locales are served under `/<locale>`. Currently only Korean.
export const PREFIXED_LOCALES = locales.filter((l) => l !== defaultLocale)

// Split a request pathname into its locale and the underlying (unprefixed) path.
// `/ko/place/x` → { locale: 'ko', basePath: '/place/x' }
// `/place/x`    → { locale: 'en', basePath: '/place/x' }
export function splitLocale(pathname) {
  for (const loc of PREFIXED_LOCALES) {
    const prefix = `/${loc}`
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      return { locale: loc, basePath: pathname.slice(prefix.length) || '/' }
    }
  }
  return { locale: defaultLocale, basePath: pathname }
}

// Build a locale-aware href from an unprefixed base path (as-needed prefixing).
// localizePath('/place/x', 'ko') → '/ko/place/x'
// localizePath('/', 'ko')        → '/ko'
// localizePath('/place/x', 'en') → '/place/x'
export function localizePath(basePath, locale) {
  const clean = !basePath ? '/' : basePath.startsWith('/') ? basePath : `/${basePath}`
  if (locale === defaultLocale || !isLocale(locale)) return clean
  return clean === '/' ? `/${locale}` : `/${locale}${clean}`
}
