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
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },
};

export default nextConfig;
