/** @type {import('next').NextConfig} */

import createNextIntlPlugin from 'next-intl/plugin'

// next-intl request config lives at ./i18n/request.js. We run next-intl in
// "without i18n routing" mode — the locale is resolved from a header set by
// middleware.js, so existing English URLs are never restructured.
const withNextIntl = createNextIntlPlugin('./i18n/request.js')

// Baseline security headers applied to every route. (No Content-Security-Policy
// yet — a strict CSP needs testing against Mapbox/Stripe/inline styles and is
// tracked as a follow-up.)
const SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), browsing-topics=()' },
]

const nextConfig = {
  images: {
    // Only our own Supabase-hosted images are sent through the optimizer (see
    // components/OptimizedImage.js — approved external hosts pass through as-is,
    // so we don't need to allowlist every operator CDN here).
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [360, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [96, 160, 240, 320, 480],
    minimumCacheTTL: 31536000,
  },
  async redirects() {
    return [
      {
        source: '/explore/:slug',
        destination: '/regions/:slug',
        permanent: true,
      },
      {
        source: '/long-weekend',
        destination: '/plan-my-stay',
        permanent: true,
      },
    ]
  },
  async headers() {
    // /embed/* is intentionally embeddable in third-party sites (council region
    // widgets). It drops X-Frame-Options and sets a permissive CSP frame-ancestors
    // so councils can iframe it from any origin. This is the ONLY route family
    // exempt from the site-wide frame lock — everything else stays SAMEORIGIN.
    const embedHeaders = [
      ...SECURITY_HEADERS.filter((h) => h.key !== 'X-Frame-Options'),
      { key: 'Content-Security-Policy', value: 'frame-ancestors *' },
    ]
    return [
      { source: '/embed/:path*', headers: embedHeaders },
      // Negative lookahead excludes /embed so this rule never re-adds the frame lock there.
      { source: '/((?!embed/).*)', headers: SECURITY_HEADERS },
    ]
  },
};

export default withNextIntl(nextConfig);
