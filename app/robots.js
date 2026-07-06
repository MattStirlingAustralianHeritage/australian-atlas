export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/dashboard/', '/vendor/', '/account/', '/claim/'],
      },
    ],
    sitemap: 'https://www.australianatlas.com.au/sitemap.xml',
  }
}
