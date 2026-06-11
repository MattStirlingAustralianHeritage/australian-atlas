// ============================================================
// Operator Highlights — server-side validation & normalisation
// ============================================================
//
// Turns raw operator input into the canonical stored shape, enforcing:
//   • the field set for the listing's vertical/sub_type (unknown keys dropped)
//   • length caps (LIMITS) and list-item caps
//   • http(s)-only URLs (dangerous schemes rejected, bare domains coerced)
//   • the Atlas banned-phrase check — highlights publish directly, so they hold
//     the same plain, non-promotional voice as everything else on a page
//
// Imports are RELATIVE (not '@/…') so this module and its config can be
// exercised by a plain `node` test harness as well as by Next.

import { bannedPhraseCheck } from '../operator-intake/voice.mjs'
import {
  LIMITS,
  getHighlightFields,
  emptyHighlights,
} from './config.js'

// Strip control characters and collapse intra-line whitespace while preserving
// intentional newlines (textarea/list inputs). CRLF/CR are normalised to LF
// first so pasted Windows/clipboard text behaves.
function tidyText(s) {
  return String(s == null ? '' : s)
    .replace(/\r\n?/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // controls, keeping \t and \n
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function cap(s, n) {
  return s.length > n ? s.slice(0, n).trim() : s
}

// http(s)-only URL coercion. Returns { ok:true, url } (url may be null = empty)
// or { ok:false, error } for an explicitly dangerous scheme. Mirrors the
// discipline in lib/admin/updateListing.js.
export function cleanHighlightUrl(raw) {
  const s = tidyText(raw).replace(/\n+/g, '')
  if (!s) return { ok: true, url: null }
  if (/^(javascript|data|vbscript|about|file|ftp):/i.test(s)) {
    return { ok: false, error: 'Links must start with http:// or https://' }
  }
  let url = s.replace(/^https?\/\//, 'https://').replace(/^https?:\/(?=[^/])/, 'https://')
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  if (url.startsWith('http://')) url = url.replace(/^http:\/\//, 'https://')
  url = cap(url.replace(/ /g, '%20'), LIMITS.url)
  try {
    // Must parse and have a dotted host (reject "https://localhost"-style junk).
    const u = new URL(url)
    if (!u.hostname.includes('.')) return { ok: true, url: null }
    return { ok: true, url }
  } catch {
    return { ok: true, url: null }
  }
}

// Run the Atlas banned-phrase check over a piece of operator text. Returns an
// error string naming the offending phrase, or null when clean.
function voiceError(text, where) {
  const { passed, violations } = bannedPhraseCheck(text)
  if (passed) return null
  return `“${violations[0]}” reads as marketing — Atlas pages stay plain and factual. Please rephrase ${where}.`
}

/**
 * Normalise raw operator-highlight input for a listing.
 *
 * @param {object} input    - { hiring?: {open,url,note}, fields?: {<key>:value} }
 * @param {string} vertical - listing.vertical
 * @param {string} subType  - listing.sub_type (roaster/cafe split for fine_grounds)
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 */
export function normalizeHighlights(input, vertical, subType) {
  const src = input && typeof input === 'object' ? input : {}
  const out = emptyHighlights()

  // ── Hiring block ──
  const rawHiring = src.hiring && typeof src.hiring === 'object' ? src.hiring : {}
  out.hiring.open = rawHiring.open === true || rawHiring.open === 'true'

  const urlRes = cleanHighlightUrl(rawHiring.url)
  if (!urlRes.ok) return { ok: false, error: `Jobs link: ${urlRes.error}` }
  out.hiring.url = urlRes.url

  const note = cap(tidyText(rawHiring.note).replace(/\n+/g, ' '), LIMITS.hiringNote)
  if (note) {
    const vErr = voiceError(note, 'the hiring note')
    if (vErr) return { ok: false, error: vErr }
  }
  out.hiring.note = note || null

  // ── Type-specific fields (only known keys for this vertical/sub_type) ──
  const fields = getHighlightFields(vertical, subType)
  const rawFields = src.fields && typeof src.fields === 'object' ? src.fields : {}

  for (const field of fields) {
    const raw = rawFields[field.key]

    if (field.type === 'url') {
      const res = cleanHighlightUrl(raw)
      if (!res.ok) return { ok: false, error: `${field.label}: ${res.error}` }
      if (res.url) out.fields[field.key] = res.url
      continue
    }

    if (field.type === 'list') {
      // Accept an array or a newline-delimited string.
      const items = Array.isArray(raw) ? raw : tidyText(raw).split('\n')
      const cleaned = []
      for (const item of items) {
        const v = cap(tidyText(item).replace(/\n+/g, ' '), LIMITS.listItem)
        if (v && !cleaned.includes(v)) cleaned.push(v)
        if (cleaned.length >= LIMITS.listItems) break
      }
      if (cleaned.length) {
        const vErr = voiceError(cleaned.join('\n'), `“${field.label}”`)
        if (vErr) return { ok: false, error: vErr }
        out.fields[field.key] = cleaned
      }
      continue
    }

    // text / textarea
    const limit = field.type === 'textarea' ? LIMITS.textarea : LIMITS.text
    let v = tidyText(raw)
    if (field.type === 'text') v = v.replace(/\n+/g, ' ')
    v = cap(v, limit)
    if (v) {
      const vErr = voiceError(v, `“${field.label}”`)
      if (vErr) return { ok: false, error: vErr }
      out.fields[field.key] = v
    }
  }

  out.updated_at = new Date().toISOString()
  return { ok: true, value: out }
}
