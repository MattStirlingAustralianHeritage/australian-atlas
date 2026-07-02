export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/dashboard/', '/vendor/', '/account/', '/claim/'],
      },
    ],
    sitemap: 'https://australianatlas.com.au/sitemap.xml',
  }
}
