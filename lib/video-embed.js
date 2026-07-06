/**
 * Operator video embeds — a paid perk (migration 225). A listing may feature
 * ONE video from an allowlisted platform: YouTube, TikTok or Instagram.
 *
 * listings.video_url stores the canonical WATCH url, normalised by
 * parseVideoUrl() at save time. Render layers re-parse the stored value and
 * build the iframe src from the extracted video id — the stored string is
 * never used as an embed src directly, so a value written outside the API
 * (or a future allowlist change) can never inject an arbitrary iframe.
 *
 * Sync contract: video_url is master-only — absent from lib/sync/fieldMaps,
 * so inbound vertical syncs never touch it (same as hours / highlights).
 */

const MAX_URL_LENGTH = 300

export const VIDEO_PROVIDER_LABELS = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
}

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'])
const TIKTOK_HOSTS = new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'])
const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com'])

const YT_ID = /^[A-Za-z0-9_-]{11}$/
const TT_ID = /^\d{5,25}$/
const TT_HANDLE = /^@[A-Za-z0-9._-]{1,60}$/
const IG_CODE = /^[A-Za-z0-9_-]{5,40}$/

/**
 * Parse a user-pasted video link into a safe, canonical embed description.
 *
 * Accepts the common share shapes:
 *   YouTube   — youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID,
 *               youtube.com/embed/ID, youtube.com/live/ID
 *   TikTok    — tiktok.com/@handle/video/1234567890
 *   Instagram — instagram.com/p/CODE, /reel/CODE, /reels/CODE, /tv/CODE
 *
 * Returns { provider, id, watchUrl, embedUrl } or null when the link is not
 * a recognisable video on an allowlisted platform. watchUrl is what we store;
 * embedUrl is built from the id and is the ONLY thing an iframe may load.
 */
export function parseVideoUrl(raw) {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return null

  let url
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null

  const host = url.hostname.toLowerCase()
  const segs = url.pathname.split('/').filter(Boolean)

  // ── YouTube ──
  if (host === 'youtu.be') {
    const id = segs[0] || ''
    return YT_ID.test(id) ? youtube(id) : null
  }
  if (YOUTUBE_HOSTS.has(host)) {
    if (segs[0] === 'watch') {
      const id = url.searchParams.get('v') || ''
      return YT_ID.test(id) ? youtube(id) : null
    }
    if (['shorts', 'embed', 'live', 'v'].includes(segs[0])) {
      const id = segs[1] || ''
      return YT_ID.test(id) ? youtube(id) : null
    }
    return null
  }

  // ── TikTok ──
  if (TIKTOK_HOSTS.has(host)) {
    // tiktok.com/@handle/video/ID (also accepts /photo/ links' shape rejected by TT_ID pos)
    if (segs.length >= 3 && TT_HANDLE.test(segs[0]) && segs[1] === 'video' && TT_ID.test(segs[2])) {
      return {
        provider: 'tiktok',
        id: segs[2],
        watchUrl: `https://www.tiktok.com/${segs[0]}/video/${segs[2]}`,
        embedUrl: `https://www.tiktok.com/embed/v2/${segs[2]}`,
      }
    }
    // embed/v2/ID (round-trips our own canonical form)
    if (segs[0] === 'embed' && segs[1] === 'v2' && TT_ID.test(segs[2] || '')) {
      return {
        provider: 'tiktok',
        id: segs[2],
        watchUrl: `https://www.tiktok.com/embed/v2/${segs[2]}`,
        embedUrl: `https://www.tiktok.com/embed/v2/${segs[2]}`,
      }
    }
    return null
  }

  // ── Instagram ──
  if (INSTAGRAM_HOSTS.has(host)) {
    let kind = segs[0]
    let code = segs[1]
    // Profile-scoped shape: instagram.com/{user}/reel/CODE
    if (segs.length >= 3 && ['p', 'reel', 'reels', 'tv'].includes(segs[1])) {
      kind = segs[1]
      code = segs[2]
    }
    if (!['p', 'reel', 'reels', 'tv'].includes(kind) || !IG_CODE.test(code || '')) return null
    const path = kind === 'reels' ? 'reel' : kind
    return {
      provider: 'instagram',
      id: code,
      watchUrl: `https://www.instagram.com/${path}/${code}/`,
      embedUrl: `https://www.instagram.com/${path}/${code}/embed/`,
    }
  }

  return null
}

function youtube(id) {
  return {
    provider: 'youtube',
    id,
    watchUrl: `https://www.youtube.com/watch?v=${id}`,
    // nocookie host: no tracking cookies until the visitor presses play
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
  }
}
