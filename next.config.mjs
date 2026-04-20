/** @type {import('next').NextConfig} */
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
    ]
  },
};

export default nextConfig;
