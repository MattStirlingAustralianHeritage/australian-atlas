'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import ListingCard, { TypographicCard, VERTICAL_TOKENS } from '@/components/ListingCard'
import SearchAutocomplete from '@/components/SearchAutocomplete'
import SearchResultCard, { queryTerms, buildSnippet, highlightTerms } from '@/components/SearchResultCard'
import VibeSearch from './VibeSearch'
import { getListingRegion } from '@/lib/regions'
import { isApprovedImageSource } from '@/lib/image-utils'
import { isStrongMatch } from '@/lib/search/relevanceFloor'
import { detectVerticalIntent } from '@/lib/search/verticalIntent'
import { isInquiryQuery } from '@/lib/search/inquiryIntent'
import { VERTICAL_MUTED, isVerticalPublic } from '@/lib/verticalUrl'
import { useLocation } from '@/components/LocationProvider'

import { VERTICAL_STYLES } from '@/components/VerticalBadge'

// Mapbox GL must never render on the server.
const SearchResultsMap = dynamic(() => import('@/components/SearchResultsMap'), { ssr: false })

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

const VIEWS = [
  { key: 'grid', label: 'Grid', icon: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></> },
  { key: 'list', label: 'List', icon: <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="4" cy="6" r="0.8" /><circle cx="4" cy="12" r="0.8" /><circle cx="4" cy="18" r="0.8" /></> },
  { key: 'map', label: 'Map', icon: <><path d="M9 20l-6-3V4l6 3 6-3 6 3v13l-6-3-6 3z" /><line x1="9" y1="7" x2="9" y2="20" /><line x1="15" y1="4" x2="15" y2="17" /></> },
]

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

// Skeletons in the warm family — grey placeholder blocks read as dirt on the
// stone ground, so the shimmer tints come from the kraft/cream ramp instead.
function SkeletonCard() {
  const tone = { background: '#F0EAE0' }
  const toneSoft = { background: '#F6F1E9' }
  return (
    <div className="bg-[var(--color-card-bg)] rounded-xl overflow-hidden border border-[var(--color-border)] animate-pulse">
      <div className="aspect-[16/10]" style={tone} />
      <div className="p-4 space-y-3">
        <div className="h-5 rounded w-3/4" style={tone} />
        <div className="h-3 rounded w-1/2" style={toneSoft} />
        <div className="space-y-1.5">
          <div className="h-3 rounded w-full" style={toneSoft} />
          <div className="h-3 rounded w-2/3" style={toneSoft} />
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
  const t = useTranslations('search')
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
              {t('eventFree')}
            </span>
          )}
        </p>
      </div>
    </a>
  )
}

// Enlarged "top result" card — a taller visual header plus a detail panel with
// category, location, the venue address, and a description excerpt.
function FeaturedCard({ listing, query, onClick, onHover, active }) {
  const t = useTranslations('search')
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
      {...(onClick ? { onClick } : {})}
      {...(onHover ? { onMouseEnter: () => onHover(listing.id), onMouseLeave: () => onHover(null) } : {})}
      className="group block overflow-hidden listing-card"
      style={{
        borderRadius: 14,
        border: active ? '1px solid var(--color-gold)' : '0.5px solid var(--color-border)',
        background: '#fff',
      }}
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
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
          letterSpacing: '0.1em', textTransform: 'uppercase',
          padding: '4px 11px', borderRadius: 100,
          color: 'var(--color-gold)', background: 'rgba(26,24,21,0.88)',
          backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6L12 0z" />
          </svg>
          {t('topResult')}
        </span>
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
  const t = useTranslations('search')
  const locale = useLocale()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [mode, setMode] = useState(searchParams.get('mode') === 'vibe' ? 'vibe' : 'search')
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [vertical, setVertical] = useState(searchParams.get('vertical') || '')
  const [state, setState] = useState(searchParams.get('state') || '')
  const [region, setRegion] = useState(searchParams.get('region') || '')
  const initialView = ['grid', 'list', 'map'].includes(searchParams.get('view')) ? searchParams.get('view') : 'grid'
  const [view, setView] = useState(initialView)          // grid | list | map
  const [autoState, setAutoState] = useState('')  // State detected from query text by API
  const [autoSuburb, setAutoSuburb] = useState('')  // Suburb detected from query text by API
  const [results, setResults] = useState([])
  const [pins, setPins] = useState([])                 // full ranked pool as map pins
  const [hoveredId, setHoveredId] = useState(null)     // card↔pin hover sync
  const [events, setEvents] = useState([])
  const [total, setTotal] = useState(0)
  const [capped, setCapped] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [initialLoad, setInitialLoad] = useState(true)
  const [slowSearch, setSlowSearch] = useState(false)
  const [detectedVertical, setDetectedVertical] = useState(null)
  const [autoRegion, setAutoRegion] = useState(null)   // region detected from query text
  const [detectedPlace, setDetectedPlace] = useState(null) // town/suburb resolved from query (gazetteer/geocoded)
  const [noBind, setNoBind] = useState(false)          // user dismissed the detected-region/place chip
  const [noVerticalBind, setNoVerticalBind] = useState(false) // user broadened past the detected atlas
  const [didYouMean, setDidYouMean] = useState(null)   // fuzzy suggestion on zero/weak results
  const [facets, setFacets] = useState({ subTypes: [], regions: [] })
  const [subType, setSubType] = useState('')           // sub_type facet refine
  const [facetRegion, setFacetRegion] = useState('')   // region facet refine
  const [sortBy, setSortBy] = useState('relevance')    // relevance | az | nearest
  const [trending, setTrending] = useState([])         // popular recent queries (discovery)
  const [askAnswer, setAskAnswer] = useState(null)     // concierge reply for a plain-language inquiry
  const [forceExact, setForceExact] = useState(false)  // user opted out of the concierge for this query

  const { location } = useLocation()                   // { lat, lng, name } or null
  const formRef = useRef(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const resultsAnchorRef = useRef(null)
  const prevViewRef = useRef(view)

  // Toggling INTO the map view scrolls the results into frame — otherwise the
  // freshly-mounted map sits below the fold and the toggle looks like a no-op.
  useEffect(() => {
    if (prevViewRef.current === view) return
    prevViewRef.current = view
    if (view === 'map' && resultsAnchorRef.current) {
      const y = resultsAnchorRef.current.getBoundingClientRect().top + window.scrollY - 175
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' })
    }
  }, [view])

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

  // "/" focuses the search field from anywhere on the page (never while the
  // user is already typing in a field).
  useEffect(() => {
    function onKey(e) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target
      const tag = (t?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || t?.isContentEditable) return
      const input = formRef.current?.querySelector('input')
      if (input) { e.preventDefault(); input.focus(); input.select?.() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Sync URL when filters change (debounced alongside search)
  const updateUrl = useCallback((q, v, s, r) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (v) params.set('vertical', v)
    if (s) params.set('state', s)
    if (r) params.set('region', r)
    if (viewRef.current !== 'grid') params.set('view', viewRef.current)
    const qs = params.toString()
    router.replace(qs ? `/search?${qs}` : '/search', { scroll: false })
  }, [router])

  // A view change is client-side only (no refetch) but should survive
  // reload/share — write it into the URL on its own.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (view === 'grid') params.delete('view')
    else params.set('view', view)
    const qs = params.toString()
    router.replace(qs ? `/search?${qs}` : '/search', { scroll: false })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  const search = useCallback(async (p = 1, { append = false } = {}) => {
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      setSlowSearch(false)
    }
    const slowTimer = append ? null : setTimeout(() => setSlowSearch(true), 4000)

    // A plain-language request (a gift, an occasion, "somewhere to take mum")
    // is answered by the concierge instead of ranked as a name/category lookup.
    // Itinerary-shaped queries are handled separately (redirect to /itinerary).
    const useAsk = mode === 'search' && !!query && p === 1 && !append && !forceExact &&
      isInquiryQuery(query) && !isItineraryIntent(query)

    try {
      if (useAsk) {
        const res = await fetch('/api/search/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            vertical: vertical || undefined,
            state: state || undefined,
          }),
        })
        const data = res.ok ? await res.json() : null
        // Only take the concierge over if it actually found places; otherwise
        // fall through to the standard search (broader recall + did-you-mean).
        if (data && Array.isArray(data.listings) && data.listings.length > 0) {
          setResults(data.listings)
          setAskAnswer({ answer: data.answer || null, intent: data.intent || null, atlas: data.atlas || null })
          setTotal(data.total || data.listings.length)
          setEvents([]); setCapped(false); setPage(1); setTotalPages(0)
          setFacets({ subTypes: [], regions: [] }); setDidYouMean(null); setPins([])
          setDetectedVertical(data.atlas || null)
          setAutoState(data.detectedState && !state ? data.detectedState : '')
          setAutoSuburb(''); setAutoRegion(data.detectedRegion || null); setDetectedPlace(null)
          return
        }
      }

      // ── Standard search path ────────────────────────────────────────────
      const params = new URLSearchParams()
      if (query) params.set('q', query)
      if (vertical) params.set('vertical', vertical)
      if (state) params.set('state', state)
      if (region) params.set('region', region)
      if (subType) params.set('sub_type', subType)
      if (facetRegion) params.set('facet_region', facetRegion)
      if (noBind) params.set('bind', '0')
      if (noVerticalBind) params.set('vbind', '0')
      if (locale) params.set('locale', locale)
      params.set('page', p.toString())
      params.set('limit', '24')

      const res = await fetch(`/api/search?${params}`)
      const data = await res.json()
      if (append) {
        // Accumulate below the already-loaded results; merge pins by id (query
        // mode returns the same pool each page, browse mode grows page-by-page).
        setResults((prev) => {
          const seen = new Set(prev.map((l) => l.id))
          return [...prev, ...(data.listings || []).filter((l) => !seen.has(l.id))]
        })
        setPins((prev) => {
          const seen = new Set(prev.map((pin) => pin.id))
          return [...prev, ...(data.pins || []).filter((pin) => !seen.has(pin.id))]
        })
      } else {
        setAskAnswer(null)
        setResults(data.listings || [])
        setPins(data.pins || [])
      }
      setEvents(data.events || [])
      setTotal(data.total || 0)
      setCapped(!!data.capped)
      setPage(data.page || 1)
      setTotalPages(data.totalPages || 0)
      setFacets(data.facets || { subTypes: [], regions: [] })
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
      if (slowTimer) clearTimeout(slowTimer)
      if (append) {
        setLoadingMore(false)
      } else {
        setLoading(false)
        setSlowSearch(false)
        setInitialLoad(false)
      }
    }
  }, [query, vertical, state, region, subType, facetRegion, noBind, noVerticalBind, mode, forceExact, locale])

  // A fresh query re-enables atlas auto-detection: broadening ("All") applied to
  // one query shouldn't silently suppress the focus for the next, unrelated one.
  // It also re-arms the concierge and clears facet refines that belonged to the
  // previous query's pool.
  useEffect(() => { setNoVerticalBind(false); setForceExact(false); setSubType(''); setFacetRegion('') }, [query])

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
    // A concierge (inquiry) run costs two Claude calls, so give it a longer
    // idle window than a plain keyword search before firing.
    const delay = query && isInquiryQuery(query) && !isItineraryIntent(query) ? 900 : 600
    const timer = setTimeout(() => {
      updateUrl(query, vertical, state, region)
      search(1)
    }, delay)
    return () => clearTimeout(timer)
  }, [search, updateUrl, query, vertical, state, region, subType, facetRegion, noBind, noVerticalBind, mode, forceExact])

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
    if (askAnswer) {
      if (loading) return t('askingTheAtlas')
      return t('placesToConsider', { count: total })
    }
    if (loading) return t('searchingEllipsis')
    const count = total
    const vertLabel = VERTICAL_LABEL_MAP[vertical]
    const stateLabel = state || autoState
    const locationLabel = region || facetRegion || autoSuburb || stateLabel
    // Place-aware framing: the query resolved to a town/suburb and the results
    // are geographic (nearest-first), not a relevance ranking to "match".
    if (detectedPlace && detectedPlace.proximity) {
      if (detectedPlace.source === 'geocoded') {
        return vertLabel
          ? t('msgPlaceGeocodedVertical', { count, place: detectedPlace.label, vertical: vertLabel })
          : t('msgPlaceGeocoded', { count, place: detectedPlace.label })
      }
      return vertLabel
        ? t('msgPlaceAroundVertical', { count, place: detectedPlace.label, vertical: vertLabel })
        : t('msgPlaceAround', { count, place: detectedPlace.label })
    }
    if (detectedPlace && query) {
      return t('msgResultsNearPlace', { count, query, place: detectedPlace.label })
    }
    // Nothing cleared the relevance floor — relabel honestly (never a confident "results")
    if (query && results.length > 0 && !results.some(isStrongMatch)) {
      return locationLabel
        ? t('msgRelatedInLocation', { count, query, location: locationLabel })
        : t('msgRelated', { count, query })
    }

    if (query && vertical && locationLabel) {
      return t('msgQueryVerticalLocation', { count, query, vertical: vertLabel, location: locationLabel })
    }
    if (query && vertical) {
      return t('msgQueryVertical', { count, query, vertical: vertLabel })
    }
    if (query && locationLabel) {
      return t('msgQueryLocation', { count, query, location: locationLabel })
    }
    if (query) {
      return t('msgQuery', { count, query })
    }
    if (vertical && locationLabel) {
      return t('msgVerticalLocation', { count, vertical: vertLabel, location: locationLabel })
    }
    if (vertical) {
      return t('msgVertical', { count, vertical: vertLabel })
    }
    if (locationLabel) {
      return t('msgLocation', { count, location: locationLabel })
    }
    return t('msgAllAtlases', { count })
  }

  // Contextual header detection
  const contextualHeader = query ? detectContextualHeader(query) : null

  // Concierge (inquiry) mode: a plain-language request got a written answer +
  // per-result reasons. Its render bypasses the featured/facet/view machinery
  // in favour of the answer panel and reason-annotated cards.
  const askMode = !!askAnswer

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
  } else if (sortBy === 'nearest' && distOrigin) {
    displayResults = [...withDistance].sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
  }

  // ── Relevance-floor gating: only results clearing their vertical's calibrated
  // floor earn the enlarged + badged "Top result" treatment (earned, not positional).
  // Only in relevance sort — a re-sorted page has no "top relevance result" —
  // and only in the grid view (list is a straight ranked index; map is spatial).
  const anyStrong = displayResults.some(isStrongMatch)
  const featured = (view === 'grid' && sortBy === 'relevance' && displayResults.length >= 3 && anyStrong)
    ? displayResults.filter(isStrongMatch).slice(0, 3)
    : []
  const featuredIds = new Set(featured.map(f => f.id))
  const gridListings = featured.length > 0 ? displayResults.filter(r => !featuredIds.has(r.id)) : displayResults
  // Proximity/place results carry no semantic similarity, so they never "clear
  // the floor" — but they're geographically correct, not weak. Don't shame them
  // with the "no strong matches" banner; the place chip already frames them.
  const placeProximity = !!(detectedPlace && detectedPlace.proximity)
  const weakOnly = displayResults.length > 0 && !anyStrong && !placeProximity
  const hasActiveFilters = !!(vertical || state || region || subType || facetRegion || autoState || autoRegion || (detectedVertical && !noVerticalBind))
  const canLoadMore = !askMode && totalPages > 1 && page < totalPages
  const remaining = Math.max(0, total - displayResults.length)

  // Origin marker for the map (the place the query resolved to, or the visitor).
  const mapOrigin = placeOrigin
    ? { lat: placeOrigin.lat, lng: placeOrigin.lng, label: placeOrigin.label }
    : (hasLoc ? { lat: location.lat, lng: location.lng, label: t('yourLocation') } : null)

  // Shared props for every result card (hover sync + CTR logging).
  const cardProps = (listing, idx) => ({
    listing,
    query,
    distanceKm: listing.distanceKm,
    active: hoveredId === listing.id,
    onHover: setHoveredId,
    onClick: query ? () => trackSearchClick(listing, idx + 1) : undefined,
  })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-8">
      {/* Card entrance — a quiet rise, staggered per card by inline delay. */}
      <style>{`
        @keyframes search-card-in {
          from { opacity: 0; transform: translateY(7px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Search masthead — the shared publication opening block. */}
      <div className="page-masthead max-w-2xl">
        <p className="section-dateline">{t('mastheadKicker')}</p>
        <h1 className="masthead-title">{t('mastheadTitle')}</h1>
        <p className="masthead-sub">{t('mastheadSub')}</p>
      </div>

      {/* Mode toggle: Search / Vibe — a proper segmented control. */}
      <div
        className="flex items-center"
        style={{
          maxWidth: '18rem',
          padding: '3px',
          background: '#fff',
          border: '1px solid var(--color-border)',
          borderRadius: '999px',
          boxShadow: 'var(--shadow-xs)',
        }}
      >
        <button
          onClick={() => setMode('search')}
          aria-pressed={mode === 'search'}
          style={{
            flex: 1,
            padding: '0.5rem 1rem',
            borderRadius: '999px',
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
          {t('modeSearch')}
        </button>
        <button
          onClick={() => setMode('vibe')}
          aria-pressed={mode === 'vibe'}
          style={{
            flex: 1,
            padding: '0.5rem 1rem',
            borderRadius: '999px',
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
          {t('modeVibe')}
        </button>
      </div>

      {/* Vibe needs a one-line explainer; Search is already framed by the
          masthead standfirst, so repeating it would just add noise. */}
      {mode === 'vibe' && (
        <p className="mt-2" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '12.5px', color: 'var(--color-muted)' }}>
          {t('vibeExplainer')}
        </p>
      )}

      {/* Vibe mode — seeded with the current query so toggling keeps your text. */}
      {mode === 'vibe' && <VibeSearch initialQuery={query} onQueryChange={setQuery} />}

      {/* Standard search mode */}
      {mode === 'search' && <>

      {/* Search input — a form so Enter submits (and only then redirects to the
          itinerary builder, instead of hijacking the query mid-typing). */}
      <form ref={formRef} onSubmit={handleSubmit} role="search" className="mt-6 flex items-center gap-3 bg-white rounded-2xl px-5 py-4 max-w-2xl shadow-sm focus-within:shadow-md transition-all" style={{ border: '0.5px solid var(--color-border)' }}>
        <svg className="w-6 h-6 text-[var(--color-accent)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <SearchAutocomplete
          value={query}
          onChange={setQuery}
          onSelect={(item) => {
            if (item.type === 'ask') {
              // Already the typed query — the concierge auto-runs on the debounce.
              if (item.query && item.query !== query) setQuery(item.query)
            } else if (item.type === 'place' && item.slug) {
              router.push(`/place/${item.slug}`)
            } else if (item.type === 'suburb') {
              setQuery(item.label)
            } else if (item.type === 'category') {
              setQuery(item.query || item.label)
            } else if (item.type === 'region' && item.slug) {
              router.push(`/regions/${item.slug}`)
            }
          }}
          placeholder={t('inputPlaceholder')}
        />
        {query && (
          <button type="button" aria-label={t('clearSearch')} onClick={() => setQuery('')} className="text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors flex items-center justify-center" style={{ minWidth: 44, minHeight: 44, padding: 8 }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </form>

      {/* ── Sticky control deck: atlas pills, states, view toggle, sort ─────
          Stays pinned under the site nav while results scroll, so refining a
          long result set never means scrolling back to the top. */}
      <div
        className="-mx-4 px-4 sm:-mx-6 sm:px-6 mt-5"
        style={{
          position: 'sticky', top: 56, zIndex: 30,
          background: 'rgba(239,231,216,0.94)',
          backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          paddingTop: 8, paddingBottom: 10,
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        {/* Atlas pills */}
        <div className="-mx-4 px-4 sm:-mx-6 sm:px-6 overflow-x-auto scrollbar-hide">
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
                  className="px-4 py-2 rounded-full transition-all whitespace-nowrap"
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
                  {v.key ? v.label : t('allAtlases')}
                </button>
              )
            })}
          </div>
        </div>

        {/* States + view toggle + sort */}
        <div className="mt-2 flex items-center gap-3">
          <div className="overflow-x-auto scrollbar-hide" style={{ flex: 1, minWidth: 0 }}>
            <div className="flex gap-2 min-w-max pb-0.5">
              {STATES.map(s => {
                const effectiveState = state || autoState
                const isActive = effectiveState === s || (!effectiveState && !s)
                return (
                  <button
                    key={s || 'all'}
                    onClick={() => { setState(s); setAutoState('') }}
                    className="px-3.5 py-1.5 rounded-full transition-colors whitespace-nowrap"
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 400,
                      fontSize: '12px',
                      ...(isActive
                        ? { backgroundColor: 'var(--color-ink)', color: '#fff', border: '1px solid var(--color-ink)' }
                        : { backgroundColor: '#fff', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }),
                    }}
                  >
                    {s || t('allStates')}
                  </button>
                )
              })}
            </div>
          </div>

          {/* View toggle — grid / list / map */}
          {!askMode && (
            <div
              role="group"
              aria-label={t('resultsView')}
              className="flex items-center shrink-0"
              style={{ padding: 2, background: '#fff', border: '1px solid var(--color-border)', borderRadius: 999, boxShadow: 'var(--shadow-xs)' }}
            >
              {VIEWS.map(vw => {
                const active = view === vw.key
                return (
                  <button
                    key={vw.key}
                    type="button"
                    onClick={() => setView(vw.key)}
                    aria-pressed={active}
                    title={t('viewTitle', { view: t(`view_${vw.key}`) })}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '6px 11px', borderRadius: 999, border: 'none', cursor: 'pointer',
                      fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 12,
                      transition: 'all 0.15s',
                      background: active ? 'var(--color-ink)' : 'transparent',
                      color: active ? '#fff' : 'var(--color-muted)',
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {vw.icon}
                    </svg>
                    <span className="hidden sm:inline">{t(`view_${vw.key}`)}</span>
                  </button>
                )
              })}
            </div>
          )}
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
            title={t('autoRegionTitle')}
          >
            {t('inLocation', { location: autoRegion.name })}
            <button
              type="button"
              aria-label={t('removeRegionFilter', { region: autoRegion.name })}
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
              ? t('placeChipGeocodedTitle', { place: detectedPlace.label })
              : t('placeChipAroundTitle', { place: detectedPlace.label })}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
            </svg>
            {detectedPlace.source === 'geocoded' ? t('placeChipNear', { place: detectedPlace.label }) : t('placeChipAround', { place: detectedPlace.label })}
            {detectedPlace.state ? <span style={{ color: 'var(--color-muted)' }}>{detectedPlace.state}</span> : null}
            <button
              type="button"
              aria-label={t('removeLocationFilter', { place: detectedPlace.label })}
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

      {/* Contextual header — shown only when the API actually focused results on
          this atlas (detectedVertical), so the banner never over-claims. The
          "Search all atlases" link broadens past the focus. */}
      {!askMode && contextualHeader && detectedVertical === contextualHeader.vertical && !loading && results.length > 0 && (
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
              {' — '}
              {contextualHeader.location
                ? t('contextualIndependentIn', { category: contextualHeader.categoryLabel, location: contextualHeader.location })
                : t('contextualIndependent', { category: contextualHeader.categoryLabel })}
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
            title={t('searchAllAtlasesTitle')}
          >
            {t('searchAllAtlases')}
          </button>
        </div>
      )}

      {/* Trending searches — discovery row in browse mode (no query typed). */}
      {!query && trending.length > 0 && (
        <div className="mt-5">
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-gold)', margin: '0 0 10px' }}>
            {t('trendingSearches')}
          </p>
          <div className="flex flex-wrap gap-2">
            {trending.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => { setNoBind(false); setQuery(t) }}
                className="px-3 py-1.5 rounded-full whitespace-nowrap"
                style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px', background: '#fff', color: 'var(--color-ink)', border: '1px solid var(--color-border)' }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Concierge answer — a plain-language request gets a written, grounded
          reply framing the picks below, not just a ranked list. */}
      {askMode && (
        <div
          className="mt-6"
          style={{
            padding: '1.25rem 1.4rem',
            borderRadius: '1rem',
            background: 'var(--color-cream)',
            border: '1px solid var(--color-border)',
            borderLeft: '3px solid var(--color-gold)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-gold)' }} aria-hidden="true">
              <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
            </svg>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-gold)' }}>
              {t('atlasConcierge')}
            </span>
            {askAnswer.intent && (
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500, color: 'var(--color-muted)', background: '#fff', border: '1px solid var(--color-border)', borderRadius: 999, padding: '2px 10px', textTransform: 'lowercase' }}>
                {askAnswer.intent}
              </span>
            )}
          </div>
          <p style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 'clamp(1.05rem, 2.4vw, 1.3rem)', lineHeight: 1.5, color: 'var(--color-ink)', margin: '10px 0 0' }}>
            {loading
              ? t('conciergeReading')
              : (askAnswer.answer || t('conciergeDefaultAnswer'))}
          </p>
          <p style={{ margin: '11px 0 0', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)' }}>
            {t('answeringPlainEnglish')}{' '}
            <button
              type="button"
              onClick={() => setForceExact(true)}
              style={{ color: 'var(--color-accent)', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, padding: 0 }}
              title={t('searchNamesInsteadTitle')}
            >
              {t('searchNamesInstead')}
            </button>
          </p>
        </div>
      )}

      {/* Did you mean — offered inline when the pool is weak (typo'd venue
          names usually still return "related" soup; this is the way out). */}
      {!askMode && !loading && didYouMean && results.length > 0 && (
        <div className="mt-5">
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--color-ink)', margin: 0 }}>
            {t.rich('didYouMean', {
              suggestion: (chunks) => (
                <button
                  type="button"
                  onClick={() => { setNoBind(false); setQuery(didYouMean) }}
                  style={{ color: 'var(--color-accent)', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 'inherit', fontFamily: 'inherit' }}
                >
                  {didYouMean}
                </button>
              ),
            })}
          </p>
        </div>
      )}

      {/* Results count + sort. role=status/aria-live so screen readers hear the
          count change and the "Searching…" state. */}
      <div ref={resultsAnchorRef} className="mt-6 flex items-center justify-between gap-3 flex-wrap">
        <p role="status" aria-live="polite" style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '13px', color: 'var(--color-muted)' }}>
          {getResultsMessage()}{capped && !loading ? ` ${t('cappedSuffix')}` : ''}
        </p>
        {!loading && displayResults.length > 1 && !askMode && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-muted)' }}>
            {t('sortLabel')}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label={t('sortResults')}
              className="atlas-select"
              style={{ fontFamily: 'var(--font-body)', fontSize: '12px', padding: '6px 12px', border: '1px solid var(--color-border)', background: '#fff', color: 'var(--color-ink)' }}
            >
              <option value="relevance">{t('sortRelevance')}</option>
              <option value="az">{t('sortAz')}</option>
              {distOrigin && <option value="nearest">{placeOrigin ? t('sortNearestPlace', { place: placeOrigin.label }) : t('sortNearestMe')}</option>}
            </select>
          </label>
        )}
      </div>

      {/* Sub_type facet chips (counts over the result pool) */}
      {!askMode && !loading && facets.subTypes && facets.subTypes.length > 1 && (
        <div className="mt-3 -mx-4 px-4 overflow-x-auto scrollbar-hide">
          <div className="flex gap-2 min-w-max pb-1">
            <button
              type="button"
              onClick={() => setSubType('')}
              className="px-3 py-1.5 rounded-full whitespace-nowrap"
              style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '12px', ...(!subType ? { background: 'var(--color-ink)', color: '#fff', border: '1px solid var(--color-ink)' } : { background: '#fff', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }) }}
            >
              {t('allTypes')}
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

      {/* Region facet chips — geographic drill-down over the same pool. */}
      {!askMode && !loading && facets.regions && facets.regions.length > 1 && (
        <div className="mt-2 -mx-4 px-4 overflow-x-auto scrollbar-hide">
          <div className="flex gap-2 min-w-max pb-1 items-center">
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-muted)', marginRight: 2 }}>
              {t('regionsLabel')}
            </span>
            {facets.regions.map(f => {
              const active = facetRegion === f.key
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFacetRegion(active ? '' : f.key)}
                  className="px-3 py-1.5 rounded-full whitespace-nowrap inline-flex items-center gap-1.5"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '12px', ...(active ? { background: 'var(--color-ink)', color: '#fff', border: '1px solid var(--color-ink)' } : { background: '#fff', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }) }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                  </svg>
                  {f.key} <span style={{ opacity: 0.55 }}>{f.count}</span>
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
              {t('whatsOn')}
            </p>
            <a href="/events" style={{
              fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 500,
              color: 'var(--color-muted)', textDecoration: 'none',
            }}>
              {t('allEvents')} &rarr;
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
            <p style={{ marginTop: 8, fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-muted)' }}>{t('stillSearching')}</p>
          )}
        </div>
      )}

      {/* Results */}
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
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '20px' }} className="mb-2">{t('noResultsTitle')}</h3>
          <p className="max-w-md mx-auto mb-5" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px', color: 'var(--color-muted)' }}>
            {query
              ? t('noResultsForQuery', { query })
              : t('noResultsHelp')}
          </p>

          {/* Did you mean — fuzzy correction of the raw query */}
          {didYouMean && (
            <p className="mb-5" style={{ fontFamily: 'var(--font-body)', fontSize: '15px', color: 'var(--color-ink)' }}>
              {t.rich('didYouMean', {
                suggestion: (chunks) => (
                  <button type="button" onClick={() => { setNoBind(false); setQuery(didYouMean) }} style={{ color: 'var(--color-accent)', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                    {didYouMean}
                  </button>
                ),
              })}
            </p>
          )}

          {/* Clear the filters that may be the culprit */}
          {hasActiveFilters && (
            <div className="mb-5">
              <button
                type="button"
                onClick={() => { setVertical(''); setState(''); setRegion(''); setSubType(''); setFacetRegion(''); setAutoState(''); setAutoRegion(null); setNoBind(true); setNoVerticalBind(true) }}
                className="px-4 rounded-full"
                style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px', background: 'var(--color-ink)', color: '#fff', minHeight: 40 }}
              >
                {t('clearFilters')}
              </button>
            </div>
          )}

          {/* Popular / trending searches */}
          <div className="mb-6">
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-muted)', marginBottom: 8 }}>{trending.length ? t('trendingSearches') : t('popularSearches')}</p>
            <div className="flex flex-wrap items-center justify-center gap-2" style={{ maxWidth: 480, margin: '0 auto' }}>
              {(trending.length ? trending : POPULAR_CATEGORIES).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setNoBind(false); setVertical(''); setState(''); setQuery(c) }}
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
              {t('exploreMap')}
            </a>
            <span className="text-[var(--color-border)]">|</span>
            <a href="/regions" className="text-[var(--color-accent)] hover:opacity-80 transition-opacity" style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '14px', padding: '10px 4px', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
              {t('browseRegions')}
            </a>
          </div>
        </div>
      ) : askMode ? (
        /* Concierge results — each card carries a one-line "why it fits" reason. */
        <div
          className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
          style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s', pointerEvents: loading ? 'none' : 'auto' }}
        >
          {displayResults.map((listing, idx) => (
            <div key={listing.id}>
              <ListingCard
                listing={listing}
                distanceKm={listing.distanceKm}
                onClick={() => trackSearchClick(listing, idx + 1)}
              />
              {listing.reason && (
                <p style={{ margin: '9px 2px 0', display: 'flex', gap: 7, alignItems: 'flex-start', fontFamily: 'var(--font-body)', fontSize: '12.5px', lineHeight: 1.5, color: 'var(--color-muted)' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-gold)', flexShrink: 0, marginTop: 2 }} aria-hidden="true">
                    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
                  </svg>
                  <span>{listing.reason}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      ) : view === 'map' ? (
        /* ── Map split view: every pooled match plotted, cards synced ── */
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5" style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s', pointerEvents: loading ? 'none' : 'auto' }}>
          <div className="order-1 lg:order-2 lg:col-span-7 xl:col-span-8">
            <div
              className="lg:sticky lg:top-[132px] h-[46vh] lg:h-[calc(100vh-160px)]"
              style={{
                minHeight: 340,
                borderRadius: 'var(--radius-card)', overflow: 'hidden',
                border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)',
                background: '#F1EADB',
              }}
            >
              <SearchResultsMap
                pins={pins}
                origin={mapOrigin}
                activeId={hoveredId}
                onPinHover={setHoveredId}
              />
            </div>
            {pins.length > 0 && (
              <p style={{ margin: '8px 2px 0', fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--color-muted)' }}>
                {pins.length === total
                  ? t('mapAllMatches', { count: pins.length })
                  : t('mapSomeMatches', { shown: pins.length, total })}
                {t('mapClickHint')}
              </p>
            )}
          </div>
          <div className="order-2 lg:order-1 lg:col-span-5 xl:col-span-4">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {displayResults.map((listing, idx) => (
                <div key={listing.id} style={{ animation: 'search-card-in 0.3s ease both', animationDelay: `${Math.min(idx, 10) * 25}ms` }}>
                  <SearchResultCard variant="compact" rank={idx + 1} {...cardProps(listing, idx)} />
                </div>
              ))}
            </div>
            {canLoadMore && (
              <LoadMoreButton remaining={remaining} loading={loadingMore} onClick={() => search(page + 1, { append: true })} />
            )}
          </div>
        </div>
      ) : view === 'list' ? (
        /* ── List view: the ranked editorial index ── */
        <div className="mt-4" style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s', pointerEvents: loading ? 'none' : 'auto' }}>
          {/* Nothing cleared the floor (e.g. a nonsense query): no confident ranking claim */}
          {weakOnly && (
            <div className="mb-3" style={{ padding: '0.9rem 1.2rem', borderRadius: '0.75rem', border: '0.5px solid var(--color-border)', background: '#fff' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '14px', color: 'var(--color-ink)', margin: 0 }}>
                {t('noStrongMatches', { query })}
              </p>
            </div>
          )}
          <div style={{ background: '#fff', borderRadius: 'var(--radius-card)', border: '0.5px solid var(--color-border)', padding: '6px 8px' }}>
            {displayResults.map((listing, idx) => (
              <div key={listing.id} style={{ animation: 'search-card-in 0.3s ease both', animationDelay: `${Math.min(idx, 10) * 25}ms`, borderTop: idx > 0 ? '1px solid var(--color-border)' : 'none' }}>
                <SearchResultCard variant="list" rank={idx + 1} {...cardProps(listing, idx)} />
              </div>
            ))}
          </div>
          {canLoadMore && (
            <LoadMoreButton remaining={remaining} loading={loadingMore} onClick={() => search(page + 1, { append: true })} />
          )}
        </div>
      ) : (
        /* ── Grid view (default) ── */
        <>
          {/* Enlarged top-3 — only results that clear the calibrated relevance floor earn it */}
          {featured.length > 0 && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-5" style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s', pointerEvents: loading ? 'none' : 'auto' }}>
              {featured.map((listing, idx) => (
                <FeaturedCard
                  key={listing.id}
                  listing={listing}
                  query={query}
                  active={hoveredId === listing.id}
                  onHover={setHoveredId}
                  onClick={query ? () => trackSearchClick(listing, idx + 1) : undefined}
                />
              ))}
            </div>
          )}
          {/* Nothing cleared the floor (e.g. a nonsense query): no confident top-3 */}
          {weakOnly && (
            <div className="mt-4" style={{ padding: '0.9rem 1.2rem', borderRadius: '0.75rem', border: '0.5px solid var(--color-border)', background: '#fff' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '14px', color: 'var(--color-ink)', margin: 0 }}>
                {t('noStrongMatches', { query })}
              </p>
            </div>
          )}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5" style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s', pointerEvents: loading ? 'none' : 'auto' }}>
            {gridListings.map((listing, idx) => (
              <div key={listing.id} style={{ animation: 'search-card-in 0.35s ease both', animationDelay: `${Math.min(idx % 24, 11) * 28}ms` }}>
                <SearchResultCard variant="grid" {...cardProps(listing, featured.length + idx)} />
              </div>
            ))}
          </div>

          {canLoadMore && (
            <LoadMoreButton remaining={remaining} loading={loadingMore} onClick={() => search(page + 1, { append: true })} />
          )}

          {/* Sparse results suggestion */}
          {results.length > 0 && results.length < 6 && vertical && (
            <div className="mt-8 text-center py-4">
              <p className="text-sm text-[var(--color-muted)]">
                {t('showingAllMatching')}{' '}
                <button
                  onClick={() => { setVertical(''); setState(''); setQuery('') }}
                  className="text-[var(--color-sage)] font-medium hover:text-[var(--color-sage-dark)] transition-colors"
                >
                  {t('browseAllListings')}
                </button>
              </p>
            </div>
          )}
        </>
      )}

      </>}
    </div>
  )
}

// "Show more" — appends the next page under the loaded results, so scanning a
// long result set never round-trips through pagination.
function LoadMoreButton({ remaining, loading, onClick }) {
  const t = useTranslations('search')
  return (
    <div className="mt-7 flex justify-center">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="listing-card"
        style={{
          fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13.5,
          padding: '12px 26px', borderRadius: 999, cursor: loading ? 'default' : 'pointer',
          background: '#fff', color: 'var(--color-ink)', border: '1px solid var(--color-border)',
          display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44,
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? t('loadingEllipsis') : (remaining > 0 ? t('showMoreCount', { count: remaining }) : t('showMore'))}
        {!loading && (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        )}
      </button>
    </div>
  )
}

export default function SearchPage() {
  const t = useTranslations('search')
  return (
    <Suspense fallback={
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-8">
        <div className="page-masthead max-w-2xl">
          <p className="section-dateline">{t('mastheadKicker')}</p>
          <h1 className="masthead-title">{t('mastheadTitle')}</h1>
          <p className="masthead-sub">{t('mastheadSub')}</p>
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
