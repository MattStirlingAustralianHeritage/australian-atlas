'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import ListingCard, { TypographicCard, VERTICAL_TOKENS } from '@/components/ListingCard'
import SearchAutocomplete from '@/components/SearchAutocomplete'
import VibeSearch from './VibeSearch'
import { getListingRegion } from '@/lib/regions'
import { isApprovedImageSource } from '@/lib/image-utils'
import { isStrongMatch } from '@/lib/search/relevanceFloor'
import { detectVerticalIntent } from '@/lib/search/verticalIntent'
import { VERTICAL_MUTED, isVerticalPublic } from '@/lib/verticalUrl'
import { useLocation } from '@/components/LocationProvider'

import { VERTICAL_STYLES } from '@/components/VerticalBadge'

// As-the-crow-flies distance (km) between two lat/lng points.
function haversineKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => typeof v !== 'number' || Number.isNaN(v))) return null
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// Popular categories for the zero-result recovery + empty-state nudges.
const POPULAR_CATEGORIES = ['Breweries', 'Wineries', 'Chocolatiers', 'Cafés', 'Bookshops', 'Galleries']

// Humanise a sub_type key for the facet chips.
function prettySubType(key) {
  return String(key || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// Significant query terms (drop short/stop-ish words) for snippet matching.
function queryTerms(q) {
  return [...new Set((q || '').toLowerCase().match(/[a-z0-9]{3,}/g) || [])]
}

// Build a description excerpt CENTRED on the first matching query term, so a
// match in sentence 3 isn't hidden behind the opening 180 chars.
function buildSnippet(desc, terms, maxLen = 180) {
  const text = (desc || '').trim()
  if (!text) return ''
  let firstIdx = -1
  if (terms.length) {
    const lower = text.toLowerCase()
    for (const t of terms) {
      const i = lower.indexOf(t)
      if (i >= 0 && (firstIdx < 0 || i < firstIdx)) firstIdx = i
    }
  }
  if (firstIdx <= maxLen - 40) {
    // Match is already near the start (or no match) → original head excerpt.
    return text.length > maxLen ? text.slice(0, maxLen).replace(/\s+\S*$/, '') + '…' : text
  }
  let start = Math.max(0, firstIdx - 60)
  const sp = text.indexOf(' ', start)
  if (sp >= 0 && sp < start + 20) start = sp + 1
  let out = text.slice(start, start + maxLen)
  if (start + maxLen < text.length) out = out.replace(/\s+\S*$/, '') + '…'
  return '…' + out
}

// Render a snippet with matched terms bolded (terms are [a-z0-9]+ → regex-safe).
function highlightTerms(text, terms) {
  if (!text || !terms.length) return text
  const re = new RegExp('(' + terms.join('|') + ')', 'ig')
  return text.split(re).map((part, i) =>
    terms.includes(part.toLowerCase())
      ? <strong key={i} style={{ fontWeight: 600, color: 'var(--color-ink)', opacity: 1 }}>{part}</strong>
      : part
  )
}

/**
 * Heuristic intent classifier: does the query look like an itinerary request?
 * Returns true if the query matches itinerary-like patterns.
 */
function isItineraryIntent(query) {
  if (!query || query.trim().length < 5) return false
  const q = query.toLowerCase().trim()

  // Multi-word phrases (check first, most specific)
  const phrases = [
    'day trip', 'road trip', 'weekend away', 'weekend in', 'weekend trip',
    'long weekend', '2 nights', '3 nights', '2 days', '3 days', '4 days', '5 days',
    'build me', 'build a', 'plan a', 'plan my', 'plan me', 'build a trail', 'create a trail',
    'overnight in', 'overnight trip', 'nights in', 'days in',
  ]
  for (const p of phrases) {
    if (q.includes(p)) return true
  }

  // Single keywords that strongly signal itinerary intent
  const keywords = [
    'itinerary', 'trail', 'route', 'overnight', 'tour',
  ]
  for (const kw of keywords) {
    if (q.includes(kw)) return true
  }

  // Pattern: number + duration word (e.g. "2 night", "3 day")
  if (/\d+\s*(night|day|nights|days)/.test(q)) return true

  // Pattern: word numbers + duration (e.g. "three day", "two nights")
  if (/\b(one|two|three|four|five|six|seven)\s*(night|day|nights|days)\b/.test(q)) return true

  return false
}

// Use VerticalBadge text colors for pill accents
const VERTICAL_ACCENT = Object.fromEntries(
  Object.entries(VERTICAL_STYLES || {}).map(([k, v]) => [k, v.text])
)

const VERTICALS = [
  { key: '', label: 'All', atlas: '' },
  { key: 'sba', label: 'Small Batch', atlas: 'Drink' },
  { key: 'craft', label: 'Craft', atlas: 'Makers' },
  { key: 'collection', label: 'Culture', atlas: 'Culture' },
  { key: 'fine_grounds', label: 'Fine Grounds', atlas: 'Coffee' },
  { key: 'rest', label: 'Rest', atlas: 'Stay' },
  { key: 'field', label: 'Field', atlas: 'Nature' },
  { key: 'corner', label: 'Corner', atlas: 'Shop' },
  { key: 'found', label: 'Found', atlas: 'Vintage' },
  { key: 'table', label: 'Table', atlas: 'Food' },
  { key: 'way', label: 'Way', atlas: 'Experiences' },
].filter(v => !v.key || isVerticalPublic(v.key))

const VERTICAL_LABEL_MAP = Object.fromEntries(VERTICALS.filter(v => v.key).map(v => [v.key, v.label]))

const STATES = ['', 'VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']

// ── Contextual header mapping ────────────────────────────────
// The query→atlas keyword detection lives in lib/search/verticalIntent.js so the
// API (which biases ranking) and this header read the SAME signal — the header
// never claims an atlas the results aren't actually focused on.

const CONTEXTUAL_VERTICAL_NAMES = {
  sba: 'Small Batch Atlas',
  collection: 'Culture Atlas',
  craft: 'Maker Studios',
  fine_grounds: 'Fine Grounds',
  rest: 'Boutique Stays',
  field: 'Field Atlas',
  corner: 'Corner Atlas',
  found: 'Found Atlas',
  table: 'Table Atlas',
}

const CONTEXTUAL_VERTICAL_COLORS = VERTICAL_MUTED

const CONTEXTUAL_CATEGORY_LABELS = {
  sba: 'producers',
  collection: 'cultural places',
  craft: 'maker studios',
  fine_grounds: 'coffee places',
  rest: 'stays',
  field: 'natural places',
  corner: 'independent shops',
  found: 'vintage finds',
  table: 'food producers',
}

const CONTEXTUAL_LOCATION_KEYWORDS = {
  'barossa': 'the Barossa',
  'yarra valley': 'the Yarra Valley',
  'mornington': 'the Mornington Peninsula',
  'blue mountains': 'the Blue Mountains',
  'byron': 'Byron Bay',
  'adelaide hills': 'the Adelaide Hills',
  'hunter valley': 'the Hunter Valley',
  'margaret river': 'Margaret River',
  'daylesford': 'Daylesford',
  'melbourne': 'Melbourne',
  'sydney': 'Sydney',
  'brisbane': 'Brisbane',
  'adelaide': 'Adelaide',
  'perth': 'Perth',
  'hobart': 'Hobart',
  'fremantle': 'Fremantle',
  'newcastle': 'Newcastle',
  'goldfields': 'the Goldfields',
  'dandenong': 'the Dandenong Ranges',
  'macedon': 'the Macedon Ranges',
  'bellarine': 'the Bellarine',
  'gippsland': 'Gippsland',
  'sunshine coast': 'the Sunshine Coast',
  'gold coast': 'the Gold Coast',
  'noosa': 'Noosa',
  'tasmania': 'Tasmania',
  'vic': 'Victoria',
  'nsw': 'New South Wales',
  'qld': 'Queensland',
  'sa': 'South Australia',
  'wa': 'Western Australia',
}

function detectContextualHeader(query) {
  if (!query || query.trim().length < 3) return null
  const lower = query.toLowerCase().trim()

  // Vertical match — shared with the API's ranking bias (single source of truth).
  const matchedVertical = detectVerticalIntent(query)?.vertical || null

  // Find location match (longest match first)
  let matchedLocation = null
  const locEntries = Object.entries(CONTEXTUAL_LOCATION_KEYWORDS).sort((a, b) => b[0].length - a[0].length)
  for (const [kw, displayName] of locEntries) {
    if (lower.includes(kw)) {
      matchedLocation = displayName
      break
    }
  }

  if (!matchedVertical) return null

  return {
    vertical: matchedVertical,
    verticalName: CONTEXTUAL_VERTICAL_NAMES[matchedVertical],
    verticalColor: CONTEXTUAL_VERTICAL_COLORS[matchedVertical],
    categoryLabel: CONTEXTUAL_CATEGORY_LABELS[matchedVertical],
    location: matchedLocation,
  }
}

function SkeletonCard() {
  return (
    <div className="bg-[var(--color-card-bg)] rounded-xl overflow-hidden border border-[var(--color-border)] animate-pulse">
      <div className="aspect-[16/10] bg-gray-100" />
      <div className="p-4 space-y-3">
        <div className="h-5 bg-gray-100 rounded w-3/4" />
        <div className="h-3 bg-gray-50 rounded w-1/2" />
        <div className="space-y-1.5">
          <div className="h-3 bg-gray-50 rounded w-full" />
          <div className="h-3 bg-gray-50 rounded w-2/3" />
        </div>
      </div>
    </div>
  )
}

function fmtCategory(cat) {
  if (!cat) return null
  return String(cat).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const EVENT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Compact event card for the search "What's on" lane. Date block + title +
// venue line; links to the event's public page.
function SearchEventCard({ event }) {
  const start = new Date(`${event.start_date}T00:00:00`)
  const day = start.getDate()
  const month = EVENT_MONTHS[start.getMonth()]
  const place = [event.location_name, event.suburb || event.state].filter(Boolean).join(' · ')
  return (
    <a
      href={`/events/${event.slug}`}
      className="listing-card"
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        minWidth: 280, maxWidth: 340, flexShrink: 0,
        padding: '12px 16px 12px 12px',
        background: 'var(--color-card-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-card)',
        textDecoration: 'none',
      }}
    >
      <div style={{
        width: 52, height: 56, borderRadius: 'var(--radius-sm)', flexShrink: 0,
        background: 'var(--color-cream)', border: '1px solid var(--color-border)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, lineHeight: 1.1, color: 'var(--color-ink)' }}>{day}</span>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-gold)' }}>{month}</span>
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{
          fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 16, lineHeight: 1.25,
          color: 'var(--color-ink)', margin: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {event.title}
        </p>
        {place && (
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 12, color: 'var(--color-muted)',
            margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {place}
          </p>
        )}
        <p style={{ margin: '5px 0 0', display: 'flex', gap: 6, alignItems: 'center' }}>
          {event.category && (
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: 10.5, fontWeight: 500,
              padding: '1px 8px', borderRadius: 'var(--radius-pill)',
              background: 'var(--color-cream)', border: '1px solid var(--color-border)',
              color: 'var(--color-muted)', textTransform: 'capitalize',
            }}>
              {event.category}
            </span>
          )}
          {event.is_free && (
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: 10.5, fontWeight: 600,
              padding: '1px 8px', borderRadius: 'var(--radius-pill)',
              background: 'rgba(122,143,107,0.14)', color: '#3a7d44',
            }}>
              Free
            </span>
          )}
        </p>
      </div>
    </a>
  )
}

// Enlarged "top result" card — a taller visual header plus a detail panel with
// category, location, the venue address, and a description excerpt.
function FeaturedCard({ listing, query }) {
  const region = getListingRegion(listing)
  const tokens = VERTICAL_TOKENS[listing.vertical] || VERTICAL_TOKENS.portal
  const hasImg = listing.hero_image_url && isApprovedImageSource(listing.hero_image_url)
  const category = fmtCategory(listing.sub_type)
  const locParts = [listing.suburb, region?.name, listing.state]
    .filter(Boolean)
    .filter((v, i, a) => a.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i)
  const loc = locParts.join('  ·  ')
  const terms = queryTerms(query)
  const excerpt = buildSnippet(listing.description, terms)

  return (
    <a
      href={`/place/${listing.slug}`}
      className="group block overflow-hidden"
      style={{ borderRadius: 14, border: '0.5px solid var(--color-border)', background: '#fff' }}
    >
      <div style={{ position: 'relative' }}>
        {hasImg ? (
          <div style={{ aspectRatio: '4/3', overflow: 'hidden' }}>
            <img src={listing.hero_image_url} alt={listing.name} loading="lazy"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          </div>
        ) : (
          <TypographicCard name={listing.name} vertical={listing.vertical} category={listing.sub_type}
            region={region?.name} state={listing.state} aspectRatio="4/3" showVerticalTag={true} />
        )}
        <span style={{
          position: 'absolute', top: 12, left: 12, zIndex: 3,
          fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          padding: '4px 10px', borderRadius: 100, color: '#fff', background: 'var(--color-accent)',
        }}>Top result</span>
      </div>

      <div style={{ padding: '1.15rem 1.3rem 1.3rem' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 23, lineHeight: 1.18, color: 'var(--color-ink)', margin: 0 }}>
          {listing.name}
        </h3>
        {(category || loc) && (
          <p style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 11.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: tokens.bg, margin: '7px 0 0', lineHeight: 1.4 }}>
            {[category, loc].filter(Boolean).join('  ·  ')}
          </p>
        )}
        {excerpt && (
          <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 13.5, color: 'var(--color-ink)', opacity: 0.82, margin: '11px 0 0', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {highlightTerms(excerpt, terms)}
          </p>
        )}
      </div>
    </a>
  )
}

function SearchPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [mode, setMode] = useState(searchParams.get('mode') === 'vibe' ? 'vibe' : 'search')
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [vertical, setVertical] = useState(searchParams.get('vertical') || '')
  const [state, setState] = useState(searchParams.get('state') || '')
  const [region, setRegion] = useState(searchParams.get('region') || '')
  const [autoState, setAutoState] = useState('')  // State detected from query text by API
  const [autoSuburb, setAutoSuburb] = useState('')  // Suburb detected from query text by API
  const [results, setResults] = useState([])
  const [events, setEvents] = useState([])
  const [total, setTotal] = useState(0)
  const [capped, setCapped] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [initialLoad, setInitialLoad] = useState(true)
  const [slowSearch, setSlowSearch] = useState(false)
  const [detectedVertical, setDetectedVertical] = useState(null)
  const [autoRegion, setAutoRegion] = useState(null)   // region detected from query text
  const [detectedPlace, setDetectedPlace] = useState(null) // town/suburb resolved from query (gazetteer/geocoded)
  const [noBind, setNoBind] = useState(false)          // user dismissed the detected-region/place chip
  const [noVerticalBind, setNoVerticalBind] = useState(false) // user broadened past the detected atlas
  const [didYouMean, setDidYouMean] = useState(null)   // fuzzy suggestion on zero results
  const [facets, setFacets] = useState({ subTypes: [] })
  const [subType, setSubType] = useState('')           // sub_type facet refine
  const [sortBy, setSortBy] = useState('relevance')    // relevance | az | nearest
  const [trending, setTrending] = useState([])         // popular recent queries (discovery)

  const { location } = useLocation()                   // { lat, lng, name } or null

  // Trending searches — fetched once, used for the browse-mode discovery row and
  // as the zero-result recovery chips when we have real signal.
  useEffect(() => {
    let alive = true
    fetch('/api/search/trending')
      .then((r) => r.json())
      .then((d) => { if (alive) setTrending(Array.isArray(d.trending) ? d.trending : []) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // Sync URL when filters change (debounced alongside search)
  const updateUrl = useCallback((q, v, s, r) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (v) params.set('vertical', v)
    if (s) params.set('state', s)
    if (r) params.set('region', r)
    const qs = params.toString()
    router.replace(qs ? `/search?${qs}` : '/search', { scroll: false })
  }, [router])

  const search = useCallback(async (p = 1) => {
    setLoading(true)
    setSlowSearch(false)
    const slowTimer = setTimeout(() => setSlowSearch(true), 4000)
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (vertical) params.set('vertical', vertical)
    if (state) params.set('state', state)
    if (region) params.set('region', region)
    if (subType) params.set('sub_type', subType)
    if (noBind) params.set('bind', '0')
    if (noVerticalBind) params.set('vbind', '0')
    params.set('page', p.toString())
    params.set('limit', '24')

    try {
      const res = await fetch(`/api/search?${params}`)
      const data = await res.json()
      setResults(data.listings || [])
      setEvents(data.events || [])
      setTotal(data.total || 0)
      setCapped(!!data.capped)
      setPage(data.page || 1)
      setTotalPages(data.totalPages || 0)
      setFacets(data.facets || { subTypes: [] })
      setDidYouMean(data.didYouMean || null)
      // Sync auto-detected location from query text (for chip highlighting)
      if (data.detectedState && !state) {
        setAutoState(data.detectedState)
      } else {
        setAutoState('')
      }
      setAutoSuburb(data.detectedSuburb || '')
      setAutoRegion(data.detectedRegion || null)
      setDetectedPlace(data.detectedPlace || null)
      // Track detected vertical for contextual header
      setDetectedVertical(data.detectedVertical || null)
    } catch (e) {
      console.error('Search error:', e)
    } finally {
      clearTimeout(slowTimer)
      setLoading(false)
      setSlowSearch(false)
      setInitialLoad(false)
    }
  }, [query, vertical, state, region, subType, noBind, noVerticalBind])

  // A fresh query re-enables atlas auto-detection: broadening ("All") applied to
  // one query shouldn't silently suppress the focus for the next, unrelated one.
  useEffect(() => { setNoVerticalBind(false) }, [query])

  // Check for itinerary intent on initial load (from homepage submission)
  useEffect(() => {
    const initialQ = searchParams.get('q')
    if (initialQ && isItineraryIntent(initialQ)) {
      router.replace(`/itinerary?q=${encodeURIComponent(initialQ)}`)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount

  // Idle-debounced search + URL sync. The itinerary redirect is NOT fired here
  // (it used to hijack any query containing "tour"/"day"/"trail" mid-typing) —
  // it only fires on explicit submit (handleSubmit) now.
  useEffect(() => {
    if (mode !== 'search') return  // Vibe mode runs its own search; don't double-fire.
    const timer = setTimeout(() => {
      updateUrl(query, vertical, state, region)
      search(1)
    }, 600)
    return () => clearTimeout(timer)
  }, [search, updateUrl, query, vertical, state, region, subType, noBind, noVerticalBind, mode])

  // Explicit submit (Enter / search button): force an immediate search, and
  // honour itinerary intent here (only on a deliberate action, not while typing).
  function handleSubmit(e) {
    if (e) e.preventDefault()
    if (query && isItineraryIntent(query)) {
      router.push(`/itinerary?q=${encodeURIComponent(query)}`)
      return
    }
    updateUrl(query, vertical, state, region)
    search(1)
  }

  // Fire-and-forget click logging (CTR-at-rank). sendBeacon survives the
  // navigation the click triggers; never blocks it.
  function trackSearchClick(listing, rank) {
    try {
      const payload = JSON.stringify({ query, slug: listing.slug, listingId: listing.id, vertical: listing.vertical, rank })
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon('/api/search/click', new Blob([payload], { type: 'application/json' }))
      } else {
        fetch('/api/search/click', { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {})
      }
    } catch { /* analytics must never break navigation */ }
  }

  // Build contextual results message
  function getResultsMessage() {
    if (loading) return 'Searching...'
    const count = total.toLocaleString()
    const vertLabel = VERTICAL_LABEL_MAP[vertical]
    const stateLabel = state || autoState
    const locationLabel = region || autoSuburb || stateLabel
    // Place-aware framing: the query resolved to a town/suburb and the results
    // are geographic (nearest-first), not a relevance ranking to "match".
    if (detectedPlace && detectedPlace.proximity) {
      const vlabel = vertLabel ? `${vertLabel} ` : ''
      return detectedPlace.source === 'geocoded'
        ? `No ${vlabel}places in ${detectedPlace.label} yet — ${count} nearest`
        : `${count} ${vlabel}places in & around ${detectedPlace.label}`
    }
    if (detectedPlace && query) {
      return `${count} results for “${query}” near ${detectedPlace.label}`
    }
    // Nothing cleared the relevance floor — relabel honestly (never a confident "results")
    if (query && results.length > 0 && !results.some(isStrongMatch)) {
      return `${count} related ${locationLabel ? `listings in ${locationLabel}` : 'listings'} for “${query}”`
    }

    if (query && vertical && locationLabel) {
      return `${count} ${vertLabel} results for \u201c${query}\u201d in ${locationLabel}`
    }
    if (query && vertical) {
      return `${count} ${vertLabel} results for \u201c${query}\u201d`
    }
    if (query && locationLabel) {
      return `${count} results for \u201c${query}\u201d in ${locationLabel}`
    }
    if (query) {
      return `${count} results for \u201c${query}\u201d`
    }
    if (vertical && locationLabel) {
      return `${count} ${vertLabel} listings in ${locationLabel}`
    }
    if (vertical) {
      return `${count} ${vertLabel} listings`
    }
    if (locationLabel) {
      return `${count} listings in ${locationLabel}`
    }
    return `${count} listings across ten atlases`
  }

  // Contextual header detection
  const contextualHeader = query ? detectContextualHeader(query) : null

  // Distance + client-side sort. When the query resolved to a place (town/
  // suburb), distances are measured FROM that place — "how far from Apollo Bay"
  // — not from the visitor; otherwise from the visitor's own location.
  const hasLoc = location && typeof location.lat === 'number' && typeof location.lng === 'number'
  const placeOrigin = detectedPlace && typeof detectedPlace.lat === 'number' && typeof detectedPlace.lng === 'number'
    ? detectedPlace : null
  const distOrigin = placeOrigin || (hasLoc ? location : null)
  const withDistance = results.map(r => ({
    ...r,
    distanceKm: distOrigin ? haversineKm(distOrigin.lat, distOrigin.lng, r.lat, r.lng) : null,
  }))
  let displayResults = withDistance
  if (sortBy === 'az') {
    displayResults = [...withDistance].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  } else if (sortBy === 'nearest' && hasLoc) {
    displayResults = [...withDistance].sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
  }

  // ── Relevance-floor gating: only results clearing their vertical's calibrated
  // floor earn the enlarged + badged "Top result" treatment (earned, not positional).
  // Only in relevance sort — a re-sorted page has no "top relevance result".
  const anyStrong = displayResults.some(isStrongMatch)
  const featured = (sortBy === 'relevance' && page === 1 && displayResults.length >= 3 && anyStrong)
    ? displayResults.filter(isStrongMatch).slice(0, 3)
    : []
  const featuredIds = new Set(featured.map(f => f.id))
  const gridListings = featured.length > 0 ? displayResults.filter(r => !featuredIds.has(r.id)) : displayResults
  // Proximity/place results carry no semantic similarity, so they never "clear
  // the floor" — but they're geographically correct, not weak. Don't shame them
  // with the "no strong matches" banner; the place chip already frames them.
  const placeProximity = !!(detectedPlace && detectedPlace.proximity)
  const weakOnly = displayResults.length > 0 && !anyStrong && !placeProximity
  const hasActiveFilters = !!(vertical || state || region || subType || autoState || autoRegion || (detectedVertical && !noVerticalBind))

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Search header */}
      <div className="max-w-2xl">
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400 }} className="text-3xl sm:text-4xl text-[var(--color-ink)]">Search</h1>
        <p className="mt-1" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '14px', color: 'var(--color-muted)' }}>Find places across all ten atlases</p>
      </div>

      {/* Mode toggle: Search / Vibe */}
      <div className="mt-4 flex items-center gap-1" style={{ maxWidth: '18rem' }}>
        <button
          onClick={() => setMode('search')}
          style={{
            flex: 1,
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: '0.8125rem',
            transition: 'all 0.15s',
            background: mode === 'search' ? 'var(--color-ink)' : 'transparent',
            color: mode === 'search' ? '#fff' : 'var(--color-muted)',
          }}
        >
          Search
        </button>
        <button
          onClick={() => setMode('vibe')}
          style={{
            flex: 1,
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: '0.8125rem',
            transition: 'all 0.15s',
            background: mode === 'vibe' ? 'var(--color-ink)' : 'transparent',
            color: mode === 'vibe' ? '#fff' : 'var(--color-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.375rem',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
          </svg>
          Vibe
        </button>
      </div>

      {/* One-line mode subtitle so Search vs Vibe is self-explaining. */}
      <p className="mt-2" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '12.5px', color: 'var(--color-muted)' }}>
        {mode === 'vibe'
          ? 'Describe a mood or scenario — we match the feeling, not just the words.'
          : 'Search by name, place, category, or style across all ten atlases.'}
      </p>

      {/* Vibe mode — seeded with the current query so toggling keeps your text. */}
      {mode === 'vibe' && <VibeSearch initialQuery={query} onQueryChange={setQuery} />}

      {/* Standard search mode */}
      {mode === 'search' && <>

      {/* Search input — a form so Enter submits (and only then redirects to the
          itinerary builder, instead of hijacking the query mid-typing). */}
      <form onSubmit={handleSubmit} role="search" className="mt-6 flex items-center gap-3 bg-white rounded-2xl px-5 py-4 max-w-2xl shadow-sm focus-within:shadow-md transition-all" style={{ border: '0.5px solid var(--color-border)' }}>
        <svg className="w-6 h-6 text-[var(--color-accent)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <SearchAutocomplete
          value={query}
          onChange={setQuery}
          onSelect={(item) => {
            if (item.type === 'place' && item.slug) {
              router.push(`/place/${item.slug}`)
            } else if (item.type === 'suburb') {
              setQuery(item.label)
            } else if (item.type === 'category') {
              setQuery(item.query || item.label)
            } else if (item.type === 'region' && item.slug) {
              router.push(`/regions/${item.slug}`)
            }
          }}
          placeholder="Search by name, place, or style..."
        />
        {query && (
          <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors flex items-center justify-center" style={{ minWidth: 44, minHeight: 44, padding: 8 }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </form>

      {/* Category filters -- horizontal scroll on mobile */}
      <div className="mt-5 -mx-4 px-4 overflow-x-auto scrollbar-hide">
        <div className="flex gap-2 min-w-max pb-1">
          {VERTICALS.map(v => {
            // An explicit pill wins; otherwise the atlas the query was auto-focused
            // to lights up (unless the user broadened past it). Keeps the pills in
            // sync with the actual ranking bias.
            const activeVertical = vertical || (!noVerticalBind ? (detectedVertical || '') : '')
            const isActive = activeVertical === v.key
            const vs = v.key ? VERTICAL_STYLES[v.key] : null

            return (
              <button
                key={v.key}
                onClick={() => {
                  if (!v.key) { setVertical(''); setNoVerticalBind(true) }   // "All" → broaden past any auto-focus
                  else { setVertical(v.key); setNoVerticalBind(false) }
                }}
                className="px-4 py-2.5 rounded-full transition-all whitespace-nowrap"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontWeight: 500,
                  fontSize: '13px',
                  ...(isActive && vs ? {
                    backgroundColor: vs.bg,
                    border: `1px solid ${vs.text}40`,
                    color: vs.text,
                  } : isActive && !vs ? {
                    backgroundColor: 'var(--color-ink)',
                    border: '1px solid var(--color-ink)',
                    color: '#fff',
                  } : {
                    backgroundColor: '#fff',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-muted)',
                  }),
                }}
              >
                {v.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* State filters */}
      <div className="mt-3 -mx-4 px-4 overflow-x-auto scrollbar-hide">
        <div className="flex gap-2 min-w-max pb-1">
          {STATES.map(s => {
            const effectiveState = state || autoState
            const isActive = effectiveState === s || (!effectiveState && !s)
            return (
              <button
                key={s || 'all'}
                onClick={() => { setState(s); setAutoState('') }}
                className="px-4 py-2.5 rounded-full transition-colors whitespace-nowrap"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontWeight: 400,
                  fontSize: '12px',
                  ...(isActive
                    ? { backgroundColor: 'var(--color-ink)', color: '#fff', border: '1px solid var(--color-ink)' }
                    : { backgroundColor: '#fff', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }),
                }}
              >
                {s || 'All states'}
              </button>
            )
          })}
        </div>
      </div>

      {/* Active region filter */}
      {region && (
        <div className="mt-3 flex items-center gap-2">
          <span
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm"
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 500,
              fontSize: '13px',
              background: 'var(--color-ink)',
              color: '#fff',
            }}
          >
            {region}
            <button
              onClick={() => setRegion('')}
              className="hover:opacity-70 transition-opacity flex items-center justify-center"
              style={{ marginLeft: '2px' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        </div>
      )}

      {/* Auto-detected region from the query text — make the silent scoping
          visible and removable (× broadens the search back to the state). */}
      {autoRegion && !region && (
        <div className="mt-3 flex items-center gap-2">
          <span
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm"
            style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px', background: 'var(--color-cream)', color: 'var(--color-ink)', border: '1px solid var(--color-border)' }}
            title="Results scoped to this region, detected from your search"
          >
            in {autoRegion.name}
            <button
              type="button"
              aria-label={`Remove ${autoRegion.name} region filter`}
              onClick={() => setNoBind(true)}
              className="hover:opacity-70 transition-opacity flex items-center justify-center"
              style={{ marginLeft: '2px' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        </div>
      )}

      {/* Auto-detected town/suburb from the query text (gazetteer or geocoded).
          Same affordance as the region chip — × broadens the search back out. */}
      {detectedPlace && !region && !autoRegion && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm"
            style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px', background: 'var(--color-cream)', color: 'var(--color-ink)', border: '1px solid var(--color-border)' }}
            title={detectedPlace.source === 'geocoded'
              ? `No Atlas places in ${detectedPlace.label} yet — showing the nearest`
              : `Results in & around ${detectedPlace.label}, nearest first`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
            </svg>
            {detectedPlace.source === 'geocoded' ? `near ${detectedPlace.label}` : `in & around ${detectedPlace.label}`}
            {detectedPlace.state ? <span style={{ color: 'var(--color-muted)' }}>{detectedPlace.state}</span> : null}
            <button
              type="button"
              aria-label={`Remove ${detectedPlace.label} location filter`}
              onClick={() => setNoBind(true)}
              className="hover:opacity-70 transition-opacity flex items-center justify-center"
              style={{ marginLeft: '2px' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        </div>
      )}

      {/* Contextual header \u2014 shown only when the API actually focused results on
          this atlas (detectedVertical), so the banner never over-claims. The
          "Search all atlases" link broadens past the focus. */}
      {contextualHeader && detectedVertical === contextualHeader.vertical && !loading && results.length > 0 && (
        <div
          className="mt-6 mb-2"
          style={{
            padding: '1rem 1.25rem',
            borderRadius: '0.75rem',
            borderLeft: `3px solid ${contextualHeader.verticalColor}`,
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              fontSize: '1.125rem',
              color: contextualHeader.verticalColor,
              margin: 0,
              lineHeight: 1.3,
            }}
          >
            {contextualHeader.verticalName}
            <span style={{ color: 'var(--color-ink)', fontWeight: 400 }}>
              {' \u2014 Independent '}
              {contextualHeader.categoryLabel}
              {contextualHeader.location && ` in ${contextualHeader.location}`}
            </span>
          </p>
          <button
            type="button"
            onClick={() => setNoVerticalBind(true)}
            style={{
              fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 500,
              color: 'var(--color-muted)', background: 'none', border: 'none',
              cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'underline',
              textUnderlineOffset: 3,
            }}
            title="Show matches from every atlas, not just this one"
          >
            Search all atlases
          </button>
        </div>
      )}

      {/* Trending searches — discovery row in browse mode (no query typed). */}
      {!query && trending.length > 0 && (
        <div className="mt-5">
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-gold)', margin: '0 0 10px' }}>
            Trending searches
          </p>
          <div className="flex flex-wrap gap-2">
            {trending.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => { setNoBind(false); setSubType(''); setQuery(t) }}
                className="px-3 py-1.5 rounded-full whitespace-nowrap"
                style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px', background: '#fff', color: 'var(--color-ink)', border: '1px solid var(--color-border)' }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results count + sort. role=status/aria-live so screen readers hear the
          count change and the "Searching…" state. */}
      <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
        <p role="status" aria-live="polite" style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '13px', color: 'var(--color-muted)' }}>
          {getResultsMessage()}{capped && !loading ? ' (showing top matches)' : ''}
        </p>
        {!loading && displayResults.length > 1 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-muted)' }}>
            Sort:
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label="Sort results"
              style={{ fontFamily: 'var(--font-body)', fontSize: '12px', padding: '6px 8px', borderRadius: 8, border: '1px solid var(--color-border)', background: '#fff', color: 'var(--color-ink)', cursor: 'pointer' }}
            >
              <option value="relevance">Relevance</option>
              <option value="az">A–Z</option>
              {hasLoc && <option value="nearest">Nearest</option>}
            </select>
          </label>
        )}
      </div>

      {/* Sub_type facet chips (counts over the result pool) */}
      {!loading && facets.subTypes && facets.subTypes.length > 1 && (
        <div className="mt-3 -mx-4 px-4 overflow-x-auto scrollbar-hide">
          <div className="flex gap-2 min-w-max pb-1">
            <button
              type="button"
              onClick={() => setSubType('')}
              className="px-3 py-1.5 rounded-full whitespace-nowrap"
              style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '12px', ...(!subType ? { background: 'var(--color-ink)', color: '#fff', border: '1px solid var(--color-ink)' } : { background: '#fff', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }) }}
            >
              All types
            </button>
            {facets.subTypes.map(f => {
              const active = subType === f.key
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setSubType(active ? '' : f.key)}
                  className="px-3 py-1.5 rounded-full whitespace-nowrap"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '12px', ...(active ? { background: 'var(--color-ink)', color: '#fff', border: '1px solid var(--color-ink)' } : { background: '#fff', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }) }}
                >
                  {prettySubType(f.key)} <span style={{ opacity: 0.55 }}>{f.count}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Upcoming events matching the search — a separate lane so time-bound
          events never dilute the venue ranking. */}
      {!loading && events.length > 0 && (
        <div className="mt-5">
          <div className="flex items-baseline justify-between" style={{ marginBottom: '10px' }}>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              color: 'var(--color-gold)', margin: 0,
            }}>
              What&apos;s on
            </p>
            <a href="/events" style={{
              fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 500,
              color: 'var(--color-muted)', textDecoration: 'none',
            }}>
              All events &rarr;
            </a>
          </div>
          <div className="scroll-row" style={{ paddingBottom: 4 }}>
            {events.map(ev => <SearchEventCard key={ev.id} event={ev} />)}
          </div>
        </div>
      )}

      {/* Re-search affordance: a thin progress bar + (after 4s) a "still
          searching" note, so a slow re-search isn't silent and users don't
          click stale cards thinking they're final (the grid below dims). */}
      {loading && !initialLoad && (
        <div className="mt-4" aria-hidden="true">
          <div style={{ height: 2, borderRadius: 2, overflow: 'hidden', background: 'var(--color-border)' }}>
            <div style={{ height: '100%', width: '40%', background: 'var(--color-accent)', borderRadius: 2, animation: 'search-progress 1s ease-in-out infinite' }} />
          </div>
          {slowSearch && (
            <p style={{ marginTop: 8, fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-muted)' }}>Still searching…</p>
          )}
        </div>
      )}

      {/* Results grid */}
      {initialLoad ? (
        /* Skeleton loading state */
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 12 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : results.length === 0 && !loading ? (
        /* Empty state */
        <div className="mt-12 text-center py-16">
          <svg className="w-12 h-12 text-[var(--color-border)] mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '20px' }} className="mb-2">No results found</h3>
          <p className="max-w-md mx-auto mb-5" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px', color: 'var(--color-muted)' }}>
            {query
              ? `No results for \u201c${query}\u201d.`
              : 'Try adjusting your filters or searching for something specific.'}
          </p>

          {/* Did you mean \u2014 fuzzy correction of the raw query */}
          {didYouMean && (
            <p className="mb-5" style={{ fontFamily: 'var(--font-body)', fontSize: '15px', color: 'var(--color-ink)' }}>
              Did you mean{' '}
              <button type="button" onClick={() => { setNoBind(false); setSubType(''); setQuery(didYouMean) }} style={{ color: 'var(--color-accent)', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                {didYouMean}
              </button>?
            </p>
          )}

          {/* Clear the filters that may be the culprit */}
          {hasActiveFilters && (
            <div className="mb-5">
              <button
                type="button"
                onClick={() => { setVertical(''); setState(''); setRegion(''); setSubType(''); setAutoState(''); setAutoRegion(null); setNoBind(true); setNoVerticalBind(true) }}
                className="px-4 rounded-full"
                style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px', background: 'var(--color-ink)', color: '#fff', minHeight: 40 }}
              >
                Clear filters
              </button>
            </div>
          )}

          {/* Popular / trending searches */}
          <div className="mb-6">
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-muted)', marginBottom: 8 }}>{trending.length ? 'Trending searches' : 'Popular searches'}</p>
            <div className="flex flex-wrap items-center justify-center gap-2" style={{ maxWidth: 480, margin: '0 auto' }}>
              {(trending.length ? trending : POPULAR_CATEGORIES).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setNoBind(false); setSubType(''); setVertical(''); setState(''); setQuery(c) }}
                  className="px-3 py-1.5 rounded-full"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px', background: '#fff', color: 'var(--color-ink)', border: '1px solid var(--color-border)' }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center gap-3">
            <a href="/map" className="text-[var(--color-accent)] hover:opacity-80 transition-opacity" style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '14px', padding: '10px 4px', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
              Explore the map
            </a>
            <span className="text-[var(--color-border)]">|</span>
            <a href="/regions" className="text-[var(--color-accent)] hover:opacity-80 transition-opacity" style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '14px', padding: '10px 4px', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
              Browse regions
            </a>
          </div>
        </div>
      ) : (
        <>
          {/* Enlarged top-3 — only results that clear the calibrated relevance floor earn it */}
          {featured.length > 0 && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-5" style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s', pointerEvents: loading ? 'none' : 'auto' }}>
              {featured.map(listing => (
                <FeaturedCard key={listing.id} listing={listing} query={query} />
              ))}
            </div>
          )}
          {/* Nothing cleared the floor (e.g. a nonsense query): no confident top-3 */}
          {page === 1 && weakOnly && (
            <div className="mt-4" style={{ padding: '0.9rem 1.2rem', borderRadius: '0.75rem', border: '0.5px solid var(--color-border)', background: '#fff' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '14px', color: 'var(--color-ink)', margin: 0 }}>
                No strong matches for “{query}”. Closest related listings:
              </p>
            </div>
          )}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5" style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s', pointerEvents: loading ? 'none' : 'auto' }}>
            {gridListings.map((listing, idx) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                distanceKm={listing.distanceKm}
                onClick={query ? () => trackSearchClick(listing, featured.length + idx + 1) : undefined}
              />
            ))}
          </div>

          {/* Sparse results suggestion */}
          {results.length > 0 && results.length < 6 && vertical && (
            <div className="mt-8 text-center py-4">
              <p className="text-sm text-[var(--color-muted)]">
                Showing all matching results.{' '}
                <button
                  onClick={() => { setVertical(''); setState(''); setQuery('') }}
                  className="text-[var(--color-sage)] font-medium hover:text-[var(--color-sage-dark)] transition-colors"
                >
                  Browse all listings
                </button>
              </p>
            </div>
          )}
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          <button
            onClick={() => search(page - 1)}
            disabled={page <= 1}
            className="px-5 py-3 rounded-lg border border-[var(--color-border)] disabled:opacity-40 hover:bg-white transition-colors"
            style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '13px', minHeight: 44 }}
          >
            Previous
          </button>
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '13px', color: 'var(--color-muted)' }}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => search(page + 1)}
            disabled={page >= totalPages}
            className="px-5 py-3 rounded-lg border border-[var(--color-border)] disabled:opacity-40 hover:bg-white transition-colors"
            style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '13px', minHeight: 44 }}
          >
            Next
          </button>
        </div>
      )}

      </>}
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="max-w-2xl">
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400 }} className="text-3xl sm:text-4xl text-[var(--color-ink)]">Search</h1>
          <p className="mt-1" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '14px', color: 'var(--color-muted)' }}>Find places across all ten atlases</p>
        </div>
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 12 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    }>
      <SearchPageInner />
    </Suspense>
  )
}
