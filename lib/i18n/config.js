// Multilingual launch (feat/ko-launch → feat/zh-launch) — i18n routing config.
//
// next-intl is used in "without i18n routing" mode: English URLs are never
// prefixed and are served by the existing route tree untouched. Each other
// locale is served under a `/<locale>` prefix via a middleware rewrite (see
// middleware.js), which keeps the browser URL prefixed while internally serving
// the same route with an `x-atlas-locale: <locale>` header that
// i18n/request.js reads. Korean (/ko) and Simplified Chinese (/zh) are live.
//
// This module is imported from the edge middleware, server components, and
// client components, so it must stay pure JS with no Node/Next APIs.

export const locales = ['en', 'ko', 'zh']
export const defaultLocale = 'en'

// Short label shown in the header language switcher (native script).
export const LOCALE_LABELS = { en: 'EN', ko: '한국어', zh: '中文' }

// BCP-47 tags for Intl / toLocaleDateString. Every non-default locale MUST have
// an entry; unknown locales fall back to Australian English.
const BCP47 = { en: 'en-AU', ko: 'ko-KR', zh: 'zh-CN' }
export function dateLocale(locale) {
  return BCP47[locale] || BCP47[defaultLocale]
}

// OpenGraph `og:locale` values. Same fallback discipline as dateLocale.
const OG = { en: 'en_AU', ko: 'ko_KR', zh: 'zh_CN' }
export function ogLocale(locale) {
  return OG[locale] || OG[defaultLocale]
}
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
