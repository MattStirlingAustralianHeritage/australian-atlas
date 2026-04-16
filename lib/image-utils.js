const APPROVED_HOSTS = ['supabase.co', 'storage.googleapis.com']

export function isApprovedImageSource(url) {
  if (!url) return false
  try {
    const hostname = new URL(url).hostname
    return APPROVED_HOSTS.some(host => hostname.endsWith(host))
  } catch {
    return false
  }
}
