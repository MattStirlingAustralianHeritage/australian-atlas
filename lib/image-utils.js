const APPROVED_HOSTS = [
  'supabase.co',
  'storage.googleapis.com',
  'static.wixstatic.com',
  'images.squarespace-cdn.com',
  'cdn.shopify.com',
  'res.cloudinary.com',
  'i0.wp.com', 'i1.wp.com', 'i2.wp.com',
  'img1.wsimg.com',
  'imagekit.io',
  'imgix.net',
  'amazonaws.com',
  'framerusercontent.com',
]

export function isApprovedImageSource(url) {
  if (!url) return false
  try {
    const hostname = new URL(url).hostname
    return APPROVED_HOSTS.some(host => hostname.endsWith(host))
  } catch {
    return false
  }
}
