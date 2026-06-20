/** @type {import('next').NextConfig} */

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
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
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

export default nextConfig;
