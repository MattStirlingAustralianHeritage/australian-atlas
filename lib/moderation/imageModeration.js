// ============================================================
// Operator hero-image moderation — fast Haiku-class triage.
// ============================================================
//
// When an operator uploads a hero image (on claim / dashboard edit), we send it
// to a fast vision model and get a JSON verdict, then map that to a moderation
// STATUS that gates public display and vertical sync. This is triage, not deep
// analysis — synchronous in the operator save path at this volume.
//
// HARD RULE — fail closed. Any uncertainty (API error, parse failure, low
// confidence, unverifiable/unsupported source) resolves to 'held', never
// 'clean'. We never fail open.
//
// Verdict statuses (mirrors migration 164):
//   'clean'   — model is confident the image is acceptable     → eligible to display
//   'flagged' — model flagged it (explicit/offensive/...)       → never displayed/synced
//   'held'    — anything uncertain                              → never displayed/synced
//
// Pure helpers (parseModelJson / decideVerdict / normaliseCategory / clampConfidence)
// carry no I/O so they can be unit-tested without the network or an API key.

const MODEL = 'claude-haiku-4-5-20251001' // Haiku-class, vision-capable — matches the model string used elsewhere in the repo.
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

// Confidence at/above which a flagged=false verdict is trusted as 'clean'.
// Below this we HOLD rather than display (fail closed).
export const CONFIDENCE_THRESHOLD = 0.7

// The model can only see these formats. Anything else can't be verified → held.
const SUPPORTED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

// Categories the classifier may return.
export const REJECT_CATEGORIES = ['explicit', 'offensive', 'watermarked_stock', 'low_quality']
export const ALL_CATEGORIES = [...REJECT_CATEGORIES, 'clean']

const FETCH_IMAGE_TIMEOUT_MS = 10000
const MODEL_TIMEOUT_MS = 15000
const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // mirror the upload cap

const SYSTEM_PROMPT = `You are an image-moderation classifier for a curated directory of independent Australian venues — breweries, wineries, cafes, galleries, museums, shops, accommodation, makers, tour operators and the like. Operators upload a single "hero" photograph of their own venue, product, or place. Your job is fast triage: decide whether the image is acceptable as a public hero image.

FLAG (do not allow) an image if it is:
- explicit: nudity, sexual content, graphic violence or gore.
- offensive: hate symbols, slurs, harassment, or shocking/abusive content.
- watermarked_stock: carries a visible stock-photo watermark or sample mark (e.g. Shutterstock, Getty, iStock, Alamy, Adobe Stock, Dreamstime, "SAMPLE", "PREVIEW"). Operators must own their photography.
- low_quality: unusable as a hero — heavily blurred, corrupt, a screenshot, a plain logo/text graphic, a meme, a QR code, or clearly not a genuine photograph of a place/product/venue.

Otherwise treat genuine venue/product/place photography of reasonable quality as clean.

Respond with ONLY a single minified JSON object and nothing else — no preamble, no explanation, no markdown code fences:
{"flagged": <boolean>, "category": "explicit"|"offensive"|"watermarked_stock"|"low_quality"|"clean", "confidence": <number 0..1>, "reason": "<one short sentence>"}

Rules: set flagged=true when the image should NOT be shown publicly; choose the single best-fit category; use "clean" only when flagged is false; confidence is your certainty 0..1; reason is one short sentence.`

// ── Pure helpers ────────────────────────────────────────────

/**
 * Defensively extract a JSON object from model text. Strips markdown fences,
 * grabs the first {...} block, and JSON.parses inside try/catch.
 * @returns {object|null}
 */
export function parseModelJson(text) {
  if (!text || typeof text !== 'string') return null
  let s = text.trim()
  // Strip ```json ... ``` or ``` ... ``` fences if present.
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  // Grab the first balanced-looking {...} span.
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  const candidate = s.slice(start, end + 1)
  try {
    const obj = JSON.parse(candidate)
    return obj && typeof obj === 'object' ? obj : null
  } catch {
    return null
  }
}

/**
 * Coerce a confidence to a 0..1 number, or null if not a usable number.
 * Out-of-spec values resolve toward LOW (the fail-closed direction): a 0..100
 * percentage is rescaled (85 → 0.85), while a small overshoot of the 0..1 scale
 * (e.g. 1.5) lands low (0.015) and therefore HOLDS rather than auto-cleans.
 */
export function clampConfidence(v) {
  let n = typeof v === 'number' ? v : (typeof v === 'string' ? parseFloat(v) : NaN)
  if (!Number.isFinite(n)) return null
  if (n > 1 && n <= 100) n = n / 100 // tolerate a 0..100 scale; never produces a wrongly-HIGH value
  if (n < 0) n = 0
  if (n > 1) n = 1
  return n
}

/** Normalise a category to a known value given the flagged decision. */
export function normaliseCategory(cat, flagged) {
  const c = typeof cat === 'string' ? cat.trim().toLowerCase() : ''
  if (flagged) {
    return REJECT_CATEGORIES.includes(c) ? c : 'low_quality'
  }
  return 'clean'
}

function held(reason, category, confidence) {
  return {
    status: 'held',
    category: category || 'error',
    reason: reason || 'Could not verify image; held for review',
    confidence: confidence ?? null,
  }
}

/**
 * Map a parsed model verdict to a moderation decision. Pure + fail-closed.
 * @param {object|null} parsed - output of parseModelJson, or null on parse failure
 * @returns {{status:'clean'|'flagged'|'held', category:string, reason:string|null, confidence:number|null}}
 */
export function decideVerdict(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return held('Moderation response could not be parsed', 'parse_error', null)
  }

  const confidence = clampConfidence(parsed.confidence)
  const reason = typeof parsed.reason === 'string' && parsed.reason.trim()
    ? parsed.reason.trim().slice(0, 300)
    : null

  // Explicitly flagged → never display. (Confidence not required to reject.)
  if (parsed.flagged === true) {
    return {
      status: 'flagged',
      category: normaliseCategory(parsed.category, true),
      reason: reason || 'Flagged by automated moderation',
      confidence,
    }
  }

  // Not flagged AND confident → clean (eligible to display).
  if (parsed.flagged === false && confidence !== null && confidence >= CONFIDENCE_THRESHOLD) {
    return {
      status: 'clean',
      category: 'clean',
      reason: reason || 'Passed automated moderation',
      confidence,
    }
  }

  // Anything else — ambiguous flag value, missing/low confidence — HOLD.
  return held(
    reason || 'Moderation inconclusive; held for manual review',
    'low_confidence',
    confidence
  )
}

/** Best-effort media type from a URL extension. */
function mediaTypeFromUrl(url) {
  try {
    const path = new URL(url).pathname.toLowerCase()
    if (path.endsWith('.png')) return 'image/png'
    if (path.endsWith('.gif')) return 'image/gif'
    if (path.endsWith('.webp')) return 'image/webp'
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg'
    if (path.endsWith('.avif')) return 'image/avif'
  } catch { /* fall through */ }
  return null
}

function normaliseMediaType(raw) {
  if (!raw || typeof raw !== 'string') return null
  const t = raw.split(';')[0].trim().toLowerCase()
  if (t === 'image/jpg') return 'image/jpeg'
  return t
}

// ── Network ─────────────────────────────────────────────────

/**
 * Moderate a base64-encoded image. Always resolves (never throws) to a verdict;
 * any failure resolves to 'held' (fail closed).
 * @param {string} base64 - base64 image data (no data: prefix)
 * @param {string} mediaType - e.g. 'image/jpeg'
 */
export async function moderateImageBase64(base64, mediaType) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // No key → we cannot verify → hold (never silently allow).
    return held('Moderation unavailable (no API key configured)', 'unavailable', null)
  }
  if (!base64 || typeof base64 !== 'string') {
    return held('No image data to moderate', 'empty', null)
  }
  const type = normaliseMediaType(mediaType)
  if (!type || !SUPPORTED_MEDIA_TYPES.includes(type)) {
    return held(`Unsupported image format for moderation (${mediaType || 'unknown'})`, 'unsupported_format', null)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS)
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: type, data: base64 } },
              { type: 'text', text: 'Classify this operator-uploaded hero image. Respond with the JSON object only.' },
            ],
          },
        ],
      }),
    })

    if (!res.ok) {
      let detail = ''
      try { detail = (await res.text() || '').slice(0, 200) } catch { /* ignore */ }
      console.warn(`[imageModeration] API ${res.status}: ${detail}`)
      return held(`Moderation service error (${res.status})`, 'api_error', null)
    }

    const data = await res.json()
    const text = Array.isArray(data?.content)
      ? data.content.filter(b => b?.type === 'text').map(b => b.text).join('\n')
      : ''
    const parsed = parseModelJson(text)
    return decideVerdict(parsed)
  } catch (err) {
    const reason = err?.name === 'AbortError'
      ? 'Moderation timed out'
      : `Moderation request failed: ${err?.message || 'unknown error'}`
    console.warn(`[imageModeration] ${reason}`)
    return held(reason, 'request_error', null)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Retrieve an image from a URL and moderate it. Always resolves to a verdict;
 * a retrieval failure resolves to 'held' (fail closed).
 * @param {string} url - public image URL (expected to be our own Storage host)
 */
export async function moderateImageUrl(url) {
  if (!url || typeof url !== 'string') {
    return held('No image URL to moderate', 'empty', null)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_IMAGE_TIMEOUT_MS)
  let buffer
  let mediaType
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    if (!res.ok) {
      return held(`Could not retrieve image for moderation (${res.status})`, 'fetch_error', null)
    }
    mediaType = normaliseMediaType(res.headers.get('content-type')) || mediaTypeFromUrl(url)
    const arrayBuf = await res.arrayBuffer()
    if (arrayBuf.byteLength > MAX_IMAGE_BYTES) {
      return held('Image too large to moderate', 'too_large', null)
    }
    buffer = Buffer.from(arrayBuf)
  } catch (err) {
    const reason = err?.name === 'AbortError'
      ? 'Image retrieval timed out'
      : `Image retrieval failed: ${err?.message || 'unknown error'}`
    return held(reason, 'fetch_error', null)
  } finally {
    clearTimeout(timer)
  }

  return moderateImageBase64(buffer.toString('base64'), mediaType)
}
