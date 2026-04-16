'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

const VERTICAL_NAMES = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A', fine_grounds: '#8A7055',
  rest: '#5A8A9A', field: '#4A7C59', corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

const VERTICAL_TYPE_LABELS = {
  sba: 'Artisan Producer', collection: 'Culture', craft: 'Maker Studio',
  fine_grounds: 'Coffee', rest: 'Boutique Stay', field: 'Nature Destination',
  corner: 'Independent Shop', found: 'Vintage & Antique', table: 'Food & Produce',
}

const VERTICAL_FULL_NAMES = {
  sba: 'Small Batch Atlas', collection: 'Culture Atlas', craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas', rest: 'Rest Atlas', field: 'Field Atlas',
  corner: 'Corner Atlas', found: 'Found Atlas', table: 'Table Atlas',
}

// Subcategory options per vertical — values must match DB CHECK constraints on meta tables
const SUBCATEGORY_OPTIONS = {
  sba: [
    { value: 'brewery', label: 'Brewery' },
    { value: 'winery', label: 'Winery' },
    { value: 'distillery', label: 'Distillery' },
    { value: 'cidery', label: 'Cidery' },
    { value: 'meadery', label: 'Meadery' },
    { value: 'cellar_door', label: 'Cellar Door' },
    { value: 'sour_brewery', label: 'Sour Brewery' },
    { value: 'non_alcoholic', label: 'Non-Alcoholic' },
  ],
  collection: [
    { value: 'museum', label: 'Museum' },
    { value: 'gallery', label: 'Gallery' },
    { value: 'heritage_site', label: 'Heritage Site' },
    { value: 'cultural_centre', label: 'Cultural Centre' },
    { value: 'botanical_garden', label: 'Botanical Garden' },
    { value: 'sculpture_park', label: 'Sculpture Park' },
  ],
  craft: [
    { value: 'ceramics_clay', label: 'Ceramics & Clay' },
    { value: 'visual_art', label: 'Visual Art' },
    { value: 'jewellery_metalwork', label: 'Jewellery & Metalwork' },
    { value: 'textile_fibre', label: 'Textile & Fibre' },
    { value: 'wood_furniture', label: 'Wood & Furniture' },
    { value: 'glass', label: 'Glass' },
    { value: 'printmaking', label: 'Printmaking' },
  ],
  fine_grounds: [
    { value: 'roaster', label: 'Roaster' },
    { value: 'cafe', label: 'Cafe' },
  ],
  rest: [
    { value: 'boutique_hotel', label: 'Boutique Hotel' },
    { value: 'guesthouse', label: 'Guesthouse' },
    { value: 'bnb', label: 'B&B' },
    { value: 'farm_stay', label: 'Farm Stay' },
    { value: 'glamping', label: 'Glamping' },
    { value: 'cottage', label: 'Cottage' },
    { value: 'eco_resort', label: 'Eco Resort' },
  ],
  field: [
    { value: 'swimming_hole', label: 'Swimming Hole' },
    { value: 'waterfall', label: 'Waterfall' },
    { value: 'lookout', label: 'Lookout' },
    { value: 'gorge', label: 'Gorge' },
    { value: 'coastal_walk', label: 'Coastal Walk' },
    { value: 'hot_spring', label: 'Hot Spring' },
    { value: 'cave', label: 'Cave' },
    { value: 'national_park', label: 'National Park' },
    { value: 'wildlife_zoo', label: 'Wildlife & Zoo' },
    { value: 'bush_walk', label: 'Bush Walk' },
  ],
  corner: [
    { value: 'bookshop', label: 'Bookshop' },
    { value: 'records', label: 'Records & Music' },
    { value: 'homewares', label: 'Homewares & Interiors' },
    { value: 'stationery', label: 'Stationery & Paper Goods' },
    { value: 'jewellery', label: 'Jewellery' },
    { value: 'toys', label: 'Toys & Children\'s' },
    { value: 'general', label: 'General Store' },
    { value: 'clothing', label: 'Clothing' },
    { value: 'food_drink', label: 'Food & Drink' },
    { value: 'plants', label: 'Plants' },
    { value: 'art_supplies', label: 'Art Supplies' },
    { value: 'other', label: 'Other' },
  ],
  found: [
    { value: 'vintage_clothing', label: 'Vintage Clothing' },
    { value: 'vintage_furniture', label: 'Vintage Furniture' },
    { value: 'antiques', label: 'Antiques' },
    { value: 'op_shop', label: 'Op Shop' },
    { value: 'books_ephemera', label: 'Books & Ephemera' },
    { value: 'art_objects', label: 'Art Objects' },
    { value: 'market', label: 'Market' },
  ],
  table: [
    { value: 'restaurant', label: 'Restaurant' },
    { value: 'cafe', label: 'Cafe' },
    { value: 'bakery', label: 'Bakery' },
    { value: 'market', label: 'Market' },
    { value: 'farm_gate', label: 'Farm Gate' },
    { value: 'artisan_producer', label: 'Artisan Producer' },
    { value: 'specialty_retail', label: 'Specialty Retail' },
    { value: 'destination', label: 'Destination' },
    { value: 'cooking_school', label: 'Cooking School' },
    { value: 'providore', label: 'Providore' },
    { value: 'food_trail', label: 'Food Trail' },
    { value: 'creamery', label: 'Creamery' },
  ],
}

// Geo anchors for map preview — fuzzy region matching
const GEO_ANCHORS = {
  'Barossa': { lat: -34.56, lng: 138.95 }, 'Yarra Valley': { lat: -37.73, lng: 145.51 },
  'Mornington Peninsula': { lat: -38.37, lng: 145.03 }, 'Blue Mountains': { lat: -33.72, lng: 150.31 },
  'Byron Bay': { lat: -28.64, lng: 153.61 }, 'Byron': { lat: -28.64, lng: 153.61 },
  'Adelaide Hills': { lat: -35.02, lng: 138.72 }, 'Hunter Valley': { lat: -32.75, lng: 151.28 },
  'Margaret River': { lat: -33.95, lng: 115.07 }, 'Daylesford': { lat: -37.35, lng: 144.15 },
  'Macedon Ranges': { lat: -37.35, lng: 144.55 }, 'Dandenong Ranges': { lat: -37.85, lng: 145.35 },
  'Goldfields': { lat: -37.05, lng: 144.28 }, 'Bellarine': { lat: -38.25, lng: 144.55 },
  'Gippsland': { lat: -38.05, lng: 146.00 }, 'Southern Highlands': { lat: -34.50, lng: 150.45 },
  'McLaren Vale': { lat: -35.22, lng: 138.55 }, 'Clare Valley': { lat: -33.83, lng: 138.60 },
  'Great Ocean Road': { lat: -38.68, lng: 143.55 }, 'Grampians': { lat: -37.15, lng: 142.45 },
  'Bruny Island': { lat: -43.30, lng: 147.33 }, 'Tamar Valley': { lat: -41.30, lng: 147.05 },
  'Kangaroo Island': { lat: -35.80, lng: 137.20 }, 'Scenic Rim': { lat: -28.10, lng: 152.80 },
  'Cradle Mountain': { lat: -41.65, lng: 145.95 }, 'Sunshine Coast': { lat: -26.65, lng: 153.05 },
  'Noosa': { lat: -26.39, lng: 153.09 }, 'Flinders Ranges': { lat: -32.00, lng: 138.60 },
  'Melbourne': { lat: -37.81, lng: 144.96 }, 'Sydney': { lat: -33.87, lng: 151.21 },
  'Brisbane': { lat: -27.47, lng: 153.03 }, 'Adelaide': { lat: -34.93, lng: 138.60 },
  'Perth': { lat: -31.95, lng: 115.86 }, 'Hobart': { lat: -42.88, lng: 147.33 },
  'Bendigo': { lat: -36.76, lng: 144.28 }, 'Ballarat': { lat: -37.56, lng: 143.85 },
  'Beechworth': { lat: -36.36, lng: 146.69 }, 'Bright': { lat: -36.73, lng: 146.96 },
  'Launceston': { lat: -41.45, lng: 147.14 }, 'Canberra': { lat: -35.28, lng: 149.13 },
  'Orange': { lat: -33.28, lng: 149.10 }, 'Mudgee': { lat: -32.60, lng: 149.59 },
  'Gold Coast': { lat: -28.00, lng: 153.40 }, 'Central Coast': { lat: -33.30, lng: 151.35 },
  'Fremantle': { lat: -32.05, lng: 115.75 }, 'Darwin': { lat: -12.46, lng: 130.84 },
  'Healesville': { lat: -37.65, lng: 145.52 }, 'Hepburn': { lat: -37.32, lng: 144.14 },
}

function resolveRegionCoords(region) {
  if (!region) return null
  if (GEO_ANCHORS[region]) return GEO_ANCHORS[region]
  const lower = region.toLowerCase()
  for (const [key, coords] of Object.entries(GEO_ANCHORS)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return coords
    }
  }
  return null
}

// ─── Inline Editable Field ───────────────────────────────

function EditableField({ value, field, candidateId, onSaved, multiline, placeholder, style, className }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const [saving, setSaving] = useState(false)
  const ref = useRef(null)

  useEffect(() => { setDraft(value || '') }, [value])
  useEffect(() => { if (editing && ref.current) ref.current.focus() }, [editing])

  const save = useCallback(async () => {
    const trimmed = draft.trim()
    if (trimmed === (value || '').trim()) { setEditing(false); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/candidates/${candidateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: trimmed || null }),
      })
      if (res.ok) {
        const { candidate } = await res.json()
        onSaved?.(candidate)
      }
    } catch (err) {
      console.error('Auto-save failed:', err)
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }, [draft, value, field, candidateId, onSaved])

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { setDraft(value || ''); setEditing(false) }
    if (e.key === 'Enter' && !multiline) { e.preventDefault(); save() }
    e.stopPropagation()
  }

  if (editing) {
    const baseStyle = {
      fontFamily: 'inherit', color: 'inherit', fontSize: 'inherit', fontWeight: 'inherit',
      border: '2px solid var(--color-sage)', borderRadius: 6,
      padding: '6px 10px', background: '#fff', outline: 'none',
      width: '100%', boxSizing: 'border-box', lineHeight: 'inherit',
      ...style,
    }
    if (multiline) {
      return (
        <textarea ref={ref} value={draft} onChange={e => setDraft(e.target.value)}
          onBlur={save} onKeyDown={handleKeyDown} rows={4}
          style={{ ...baseStyle, resize: 'vertical' }} />
      )
    }
    return (
      <input ref={ref} type="text" value={draft} onChange={e => setDraft(e.target.value)}
        onBlur={save} onKeyDown={handleKeyDown} style={baseStyle} />
    )
  }

  const display = value || placeholder || 'Click to add...'
  const isEmpty = !value
  return (
    <span onClick={() => setEditing(true)} title="Click to edit"
      className={className}
      style={{
        cursor: 'pointer', display: 'inline',
        borderBottom: '1px dashed transparent',
        transition: 'border-color 0.2s, background 0.2s',
        borderRadius: 3, padding: '1px 2px',
        color: isEmpty ? 'var(--color-muted)' : undefined,
        fontStyle: isEmpty ? 'italic' : undefined,
        opacity: saving ? 0.5 : 1,
        ...style,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderBottomColor = 'var(--color-sage)'
        e.currentTarget.style.background = 'rgba(95, 138, 126, 0.04)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderBottomColor = 'transparent'
        e.currentTarget.style.background = 'transparent'
      }}>
      {display}
    </span>
  )
}

function Kbd({ children }) {
  return (
    <kbd style={{
      display: 'inline-block', fontFamily: 'var(--font-body)', fontSize: 10,
      fontWeight: 600, padding: '1px 6px', borderRadius: 3, background: '#fff',
      border: '1px solid var(--color-border)', color: 'var(--color-ink)',
      boxShadow: '0 1px 0 rgba(0,0,0,0.06)', lineHeight: '16px',
    }}>
      {children}
    </kbd>
  )
}

function VerticalSelect({ value, candidateId, onSaved }) {
  const [saving, setSaving] = useState(false)
  const color = VERTICAL_COLORS[value] || 'var(--color-muted)'

  const handleChange = async (e) => {
    const newVertical = e.target.value
    if (newVertical === value) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/candidates/${candidateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vertical: newVertical }),
      })
      if (res.ok) {
        const { candidate } = await res.json()
        onSaved?.(candidate)
      }
    } catch (err) {
      console.error('Vertical update failed:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <select value={value || ''} onChange={handleChange} disabled={saving}
      style={{
        fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
        letterSpacing: '0.12em', textTransform: 'uppercase',
        color: '#fff', background: color,
        padding: '4px 22px 4px 10px', borderRadius: 3,
        border: 'none', cursor: 'pointer', outline: 'none',
        appearance: 'none', WebkitAppearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='5' viewBox='0 0 8 5' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L4 4L7 1' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 6px center',
        opacity: saving ? 0.6 : 1,
      }}>
      {Object.entries(VERTICAL_NAMES).map(([key, label]) => (
        <option key={key} value={key} style={{ background: '#fff', color: '#333', textTransform: 'none' }}>{label}</option>
      ))}
    </select>
  )
}

function SubcategorySelect({ vertical, value, onChange, exclude, placeholder }) {
  let options = SUBCATEGORY_OPTIONS[vertical] || []
  if (exclude) options = options.filter(o => o.value !== exclude)
  const color = VERTICAL_COLORS[vertical] || 'var(--color-muted)'
  const hasValue = !!value

  if ((SUBCATEGORY_OPTIONS[vertical] || []).length === 0) return null

  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)}
      style={{
        fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 10,
        letterSpacing: '0.06em',
        color: hasValue ? color : 'var(--color-muted)',
        background: hasValue ? `${color}12` : '#fff',
        padding: '4px 22px 4px 10px', borderRadius: 3,
        border: `1px solid ${hasValue ? `${color}40` : 'var(--color-border)'}`,
        cursor: 'pointer', outline: 'none',
        appearance: 'none', WebkitAppearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='5' viewBox='0 0 8 5' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L4 4L7 1' stroke='%23999' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 6px center',
        transition: 'all 0.15s',
      }}>
      <option value="" style={{ color: '#999' }}>{placeholder || 'Subcategory...'}</option>
      {options.map(opt => (
        <option key={opt.value} value={opt.value} style={{ color: '#333' }}>{opt.label}</option>
      ))}
    </select>
  )
}

// ─── Map Preview (Mapbox static image) ────────────────────

function MapPreview({ region, style }) {
  const coords = resolveRegionCoords(region)
  if (!coords) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #f5f0e8 0%, #e8e0d4 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--color-muted)', fontFamily: 'var(--font-body)',
        fontSize: 12, fontStyle: 'italic', ...style,
      }}>
        No region for map preview
      </div>
    )
  }

  const token = typeof window !== 'undefined' ? (window.__MAPBOX_TOKEN || '') : ''
  const zoom = 10
  const width = 640
  const height = 360
  const pin = `pin-s+5F8A7E(${coords.lng},${coords.lat})`
  const src = token
    ? `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/${pin}/${coords.lng},${coords.lat},${zoom},0/${width}x${height}@2x?access_token=${token}`
    : null

  return (
    <div style={{
      background: 'linear-gradient(135deg, #f5f0e8 0%, #e8e0d4 100%)',
      position: 'relative', overflow: 'hidden', ...style,
    }}>
      {src ? (
        <img
          src={src}
          alt={`Map of ${region}`}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          loading="lazy"
        />
      ) : (
        <div style={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: 'var(--color-muted)',
          fontFamily: 'var(--font-body)', fontSize: 12,
        }}>
          Map preview unavailable
        </div>
      )}
    </div>
  )
}

// ─── Hero Placeholder ─────────────────────────────────────

function HeroPlaceholder({ vertical }) {
  const color = VERTICAL_COLORS[vertical] || '#5F8A7E'
  return (
    <div style={{
      width: '100%', height: 200,
      background: `linear-gradient(135deg, ${color}15 0%, ${color}08 50%, ${color}18 100%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      borderBottom: `3px solid ${color}20`,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: `${color}15`, border: `2px dashed ${color}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 10px',
        }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="2" y="4" width="16" height="12" rx="1.5" stroke={`${color}50`} strokeWidth="1.5" />
            <circle cx="7" cy="9" r="1.5" stroke={`${color}50`} strokeWidth="1.2" />
            <path d="M2 14L6 11L10 13L14 9L18 12" stroke={`${color}50`} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <span style={{
          fontFamily: 'var(--font-body)', fontSize: 11, color: `${color}80`,
          fontWeight: 500, letterSpacing: '0.04em',
        }}>
          Hero image added after publish
        </span>
      </div>
    </div>
  )
}

// ─── Gate Results Display ─────────────────────────────────

function GateResultsDisplay({ gateResults }) {
  if (!gateResults?.gates) return null
  const gates = gateResults.gates
  const score = gateResults.score
  const gp = gateResults.google_places || null
  const lines = []

  // Source indicator
  if (gateResults.source === 'google_places') {
    const parts = ['Sourced from Google Places']
    if (gp?.business_status === 'OPERATIONAL') parts.push('confirmed open')
    if (gp?.rating) parts.push(`${gp.rating}\u2605 (${gp.rating_count || 0})`)
    lines.push({ pass: true, text: parts.join(' \u2014 '), source: true })
  }

  if (gates.gate0) {
    lines.push({ pass: gates.gate0.pass, text: 'Not a duplicate' })
  }
  if (gates.gate1) {
    const url = gates.gate1.url
    const domain = url ? url.replace(/^https?:\/\/(?:www\.)?/, '').replace(/\/.*$/, '') : null
    lines.push({ pass: gates.gate1.pass, text: domain ? `Website verified — ${domain}` : 'Website verified' })
  }
  if (gates.gate2) {
    const g = gates.gate2
    const place = g.placeName
    if (g.details?.warning) {
      lines.push({ pass: true, text: `Address — ${g.details.warning}`, warning: true })
    } else if (place) {
      lines.push({ pass: g.pass, text: `Address geocoded — ${place}${g.geocodeConfidence ? ` (${g.geocodeConfidence})` : ''}` })
    } else {
      lines.push({ pass: g.pass, text: 'Address verified' })
    }
  }
  if (gates.gate3) {
    const signals = gates.gate3.signals || []
    lines.push({ pass: gates.gate3.pass, text: `Business active — ${signals.length > 0 ? signals.slice(0, 2).join(', ').toLowerCase() : 'activity confirmed'}` })
  }
  if (gates.gate4) {
    const g = gates.gate4
    if (g.details?.warning) {
      lines.push({ pass: true, text: `Vertical fit — ${g.details.warning}`, warning: true })
    } else {
      const conf = g.confidence ? `${Math.round(g.confidence * 100)}%` : null
      const parts = [g.justification, conf ? `(${conf})` : null].filter(Boolean).join(' ')
      lines.push({ pass: g.pass, text: `Vertical fit — ${parts || 'confirmed'}` })
    }
  }
  if (lines.length === 0) return null

  return (
    <div style={{
      padding: '16px 0', borderTop: '1px solid var(--color-border)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--color-muted)',
          fontFamily: 'var(--font-body)',
        }}>
          Quality Gates
        </span>
        {score != null && (
          <span style={{
            fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
            color: score >= 80 ? '#4A7C59' : score >= 65 ? '#C49A3C' : 'var(--color-muted)',
          }}>
            {score}/100
          </span>
        )}
      </div>
      {lines.map((line, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'flex-start', gap: 6,
          marginBottom: i < lines.length - 1 ? 4 : 0,
          fontFamily: 'var(--font-body)', fontSize: 12, lineHeight: 1.4,
          color: line.source ? '#1565C0' : line.warning ? 'var(--color-muted)' : line.pass ? '#4A7C59' : '#CC4444',
          fontWeight: line.source ? 500 : 400,
        }}>
          <span style={{ flexShrink: 0, fontSize: 13, lineHeight: '16px' }}>
            {line.source ? '\u2139' : line.warning ? '\u2013' : line.pass ? '\u2713' : '\u2717'}
          </span>
          <span style={{ fontWeight: 400 }}>{line.text}</span>
        </div>
      ))}
    </div>
  )
}

const AUTO_ADVANCE_MS = 3000

// ─── Candidate Preview (Full listing layout) ─────────────

function CandidatePreview({ candidate, isFocused, index, onApprove, onReject, onUpdate, focusDescRefs }) {
  const [status, setStatus] = useState('idle')
  const [result, setResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [exiting, setExiting] = useState(false)
  const busyRef = useRef(false)
  const autoAdvanceRef = useRef(null)
  const cardRef = useRef(null)

  // Subcategory state — pre-populate from gate_results if available
  const [subcategory, setSubcategory] = useState(() => {
    const gr = candidate.gate_results
    if (!gr) return ''
    // Check for category stored directly
    if (gr.category) {
      const opts = SUBCATEGORY_OPTIONS[candidate.vertical] || []
      if (opts.find(o => o.value === gr.category)) return gr.category
    }
    return ''
  })
  const [subcategorySecondary, setSubcategorySecondary] = useState('')

  const vertical = candidate.vertical || 'sba'
  const color = VERTICAL_COLORS[vertical] || '#5F8A7E'
  const confidence = candidate.confidence || 0
  const confidencePercent = Math.round(confidence * 100)
  const buttonsDisabled = status !== 'idle' && status !== 'error'
  const noSubcategory = !subcategory && (SUBCATEGORY_OPTIONS[vertical]?.length > 0)

  // Cross-vertical duplicate check (e.g. Table Atlas cafe → also in Fine Grounds?)
  const [crossMatches, setCrossMatches] = useState([])
  useEffect(() => {
    const CROSS_CHECK_VERTICALS = ['table', 'fine_grounds', 'sba', 'collection', 'craft']
    if (!CROSS_CHECK_VERTICALS.includes(vertical) || !candidate.name) {
      setCrossMatches([])
      return
    }
    let cancelled = false
    const check = async () => {
      try {
        const params = new URLSearchParams({ name: candidate.name, vertical })
        const res = await fetch(`/api/admin/candidates/cross-check?${params}`)
        if (!cancelled && res.ok) {
          const { matches } = await res.json()
          setCrossMatches(matches || [])
        }
      } catch { /* ignore */ }
    }
    check()
    return () => { cancelled = true }
  }, [vertical, candidate.name])

  // Reset subcategory when vertical changes (unless new vertical still has the same value)
  const prevVerticalRef = useRef(vertical)
  useEffect(() => {
    if (vertical !== prevVerticalRef.current) {
      const opts = SUBCATEGORY_OPTIONS[vertical] || []
      if (!opts.find(o => o.value === subcategory)) {
        setSubcategory('')
      }
      setSubcategorySecondary('')
      prevVerticalRef.current = vertical
    }
  }, [vertical, subcategory])

  // Clear secondary if it matches the newly selected primary
  useEffect(() => {
    if (subcategorySecondary && subcategorySecondary === subcategory) {
      setSubcategorySecondary('')
    }
  }, [subcategory, subcategorySecondary])

  const advanceNow = useCallback(() => {
    if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current)
    setExiting(true)
    const region = result?.listing?.region || candidate.region || null
    setTimeout(() => onApprove(candidate.id, region), 500)
  }, [candidate.id, candidate.region, result, onApprove])

  const handleAction = async (action) => {
    if (busyRef.current) return
    busyRef.current = true
    setErrorMsg(null)

    if (action === 'reject') {
      setStatus('rejecting')
      try {
        const res = await fetch(`/api/admin/candidates/${candidate.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reject' }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          setErrorMsg(d.error || 'Rejection failed')
          setStatus('error')
          busyRef.current = false
          return
        }
        setStatus('rejected')
        setTimeout(() => {
          setExiting(true)
          setTimeout(() => onReject(candidate.id), 500)
        }, 400)
      } catch (err) {
        setErrorMsg(err.message || 'Network error')
        setStatus('error')
        busyRef.current = false
      }
      return
    }

    // Approve — 5-15s with enrichment + geocoding + vertical sync
    setStatus('approving')
    try {
      const res = await fetch(`/api/admin/candidates/${candidate.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          subcategory: subcategory || undefined,
          subcategory_secondary: subcategorySecondary || undefined,
          // Reviewer edits always win — send current card state so the API
          // uses these as the authoritative values over enriched/AI data
          reviewerOverrides: {
            name: candidate.name || undefined,
            description: candidate.description || undefined,
            website_url: candidate.website_url || undefined,
            region: candidate.region || undefined,
          },
        }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setErrorMsg(data.error || 'Publish failed')
        setStatus('error')
        busyRef.current = false
        return
      }

      // Vertical sync failure is NOT a publish failure — listing is saved to master DB.
      // Show success with a warning note; cron will retry the vertical push.
      if (!data.verticalSync?.success && data.verticalSync?.warning) {
        data._syncWarning = data.verticalSync.warning
      }

      setResult(data)
      setStatus('success')
      autoAdvanceRef.current = setTimeout(advanceNow, AUTO_ADVANCE_MS)
    } catch (err) {
      setErrorMsg(err.message || 'Network error')
      setStatus('error')
      busyRef.current = false
    }
  }

  useEffect(() => {
    focusDescRefs.current[index] = () => {
      const el = cardRef.current?.querySelector('[data-field="description"]')
      if (el) el.click()
    }
  }, [index, focusDescRefs])

  return (
    <div
      ref={cardRef}
      style={{
        position: 'relative',
        borderRadius: 16,
        background: '#fff',
        overflow: 'hidden',
        transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
        opacity: exiting ? 0 : 1,
        maxHeight: exiting ? 0 : 3000,
        marginBottom: exiting ? 0 : 24,
        transform: exiting ? 'translateY(-12px) scale(0.98)' : 'translateY(0) scale(1)',
        boxShadow: isFocused
          ? '0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)'
          : '0 1px 4px rgba(0,0,0,0.04)',
        border: `1px solid ${isFocused ? color + '30' : 'var(--color-border)'}`,
      }}
    >
      {/* ── Admin Toolbar ─────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 20px',
        background: 'var(--color-cream)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <VerticalSelect value={vertical} candidateId={candidate.id} onSaved={onUpdate} />
          <SubcategorySelect vertical={vertical} value={subcategory} onChange={setSubcategory} placeholder="Primary..." />
          <SubcategorySelect vertical={vertical} value={subcategorySecondary} onChange={setSubcategorySecondary} exclude={subcategory} placeholder="Secondary..." />
          <span style={{
            fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 11,
            color: confidence > 0.85 ? '#4A7C59' : confidence < 0.60 ? '#C49A3C' : 'var(--color-muted)',
          }}>
            {confidencePercent}% match
          </span>
          {candidate.source && (
            <span style={{
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 10,
              letterSpacing: '0.04em', textTransform: 'uppercase',
              color: 'var(--color-muted)', opacity: 0.7,
            }}>
              via {candidate.source.replace(/_/g, ' ')}
            </span>
          )}
          {crossMatches.length > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 6,
              background: '#FFF3E0', border: '1px solid #FFB74D',
              fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
              color: '#E65100', letterSpacing: '0.02em',
            }}
              title={crossMatches.map(m => `${m.name} — ${m.verticalName}`).join('\n')}
            >
              ⚠ Also in {crossMatches.map(m => m.verticalName).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button data-action="approve" onClick={() => handleAction('approve')} disabled={buttonsDisabled || noSubcategory}
            title={noSubcategory ? 'Select a subcategory before publishing' : 'Approve (Y or Right Arrow)'}
            style={{
              height: 36, padding: '0 16px', borderRadius: 8,
              background: noSubcategory ? '#a0b8ae' : status === 'approving' ? '#3a6a49' : '#4A7C59',
              border: 'none', cursor: (buttonsDisabled || noSubcategory) ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'all 0.15s',
              boxShadow: noSubcategory ? 'none' : '0 1px 3px rgba(74,124,89,0.3)',
              opacity: (buttonsDisabled && status !== 'approving') ? 0.5 : 1,
              fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
              color: '#fff', letterSpacing: '0.02em',
            }}
            onMouseEnter={e => { if (!buttonsDisabled) e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}>
            {status === 'approving' ? (
              <>
                <div style={{
                  width: 14, height: 14,
                  border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
                  borderRadius: '50%', animation: 'candidateSpinner 0.6s linear infinite',
                }} />
                Publishing...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2.5 7.5L5.5 10.5L11.5 4.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Publish
              </>
            )}
          </button>
          <button data-action="reject" onClick={() => handleAction('reject')} disabled={buttonsDisabled}
            title="Reject (N or Left Arrow)"
            style={{
              height: 36, padding: '0 14px', borderRadius: 8,
              background: '#fff', border: '1px solid var(--color-border)',
              cursor: buttonsDisabled ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              transition: 'all 0.15s',
              opacity: buttonsDisabled ? 0.5 : 1,
              fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
              color: 'var(--color-muted)',
            }}
            onMouseEnter={e => { if (!buttonsDisabled) { e.currentTarget.style.borderColor = '#CC4444'; e.currentTarget.style.color = '#CC4444' } }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-muted)' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Skip
          </button>
        </div>
      </div>

      {/* ── Hero Image Placeholder ────────────────────────── */}
      <HeroPlaceholder vertical={vertical} />

      {/* ── Listing Content ──────────────────────────────── */}
      <div style={{ padding: '0 28px 28px' }}>

        {/* Type badge */}
        <div style={{ marginTop: 24, marginBottom: 16 }}>
          <span style={{
            display: 'inline-block', padding: '4px 12px',
            background: `${color}12`, border: `1px solid ${color}25`,
            borderRadius: 3, fontSize: 10, fontWeight: 600,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: color, fontFamily: 'var(--font-body)',
          }}>
            {VERTICAL_TYPE_LABELS[vertical] || vertical}
          </span>
        </div>

        {/* Name */}
        <h2 style={{ margin: '0 0 6px', lineHeight: 1.15 }}>
          <EditableField
            value={candidate.name} field="name" candidateId={candidate.id}
            onSaved={onUpdate} placeholder="Venue name"
            style={{
              fontFamily: 'var(--font-display, Georgia)', fontWeight: 400,
              fontSize: 'clamp(24px, 4vw, 38px)', color: 'var(--color-ink)',
              lineHeight: 1.15,
            }}
          />
        </h2>

        {/* Address + Region + State */}
        {(() => {
          const gate2 = candidate.gate_results?.gates?.gate2
          const geocodedAddress = gate2?.placeName || gate2?.details?.placeName || null
          const geocodeConf = gate2?.geocodeConfidence || gate2?.details?.geocodeConfidence || null
          const detectedState = gate2?.details?.expectedState || null
          // Parse state from region if it contains one (e.g., "Melbourne, VIC")
          const stateMatch = (candidate.region || '').match(/\b(NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\b/i)
          const displayState = detectedState || (stateMatch ? stateMatch[1].toUpperCase() : null)

          return (
            <div style={{ marginBottom: 20 }}>
              {/* Geocoded address — full, no truncation */}
              {geocodedAddress && (
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4,
                  fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink)',
                  lineHeight: 1.4,
                }}>
                  <span>{geocodedAddress}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 600, letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: geocodeConf === 'exact' ? '#4A7C59' : '#C49A3C',
                    opacity: 0.8, flexShrink: 0,
                  }}>
                    geocoded{geocodeConf ? ` (${geocodeConf})` : ''}
                  </span>
                </div>
              )}
              {/* Region + State — scannable at a glance */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontFamily: 'var(--font-display, Georgia)', fontStyle: 'italic', fontSize: 15, color: 'var(--color-muted)' }}>
                  <EditableField
                    value={candidate.region} field="region" candidateId={candidate.id}
                    onSaved={onUpdate} placeholder="Region, State"
                    style={{ fontFamily: 'inherit', fontStyle: 'inherit', fontSize: 'inherit', color: 'inherit' }}
                  />
                </div>
                {displayState && (
                  <span style={{
                    display: 'inline-block', padding: '2px 8px',
                    background: 'var(--color-cream, #f8f5ef)', border: '1px solid var(--color-border)',
                    borderRadius: 3, fontSize: 10, fontWeight: 700,
                    letterSpacing: '0.1em', color: 'var(--color-ink)',
                    fontFamily: 'var(--font-body)', flexShrink: 0,
                  }}>
                    {displayState}
                  </span>
                )}
              </div>
            </div>
          )
        })()}

        {/* Description — "The Story" */}
        <div style={{
          borderLeft: `3px solid ${color}35`,
          paddingLeft: 20, marginBottom: 24,
        }}>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--color-muted)',
            marginBottom: 8, fontFamily: 'var(--font-body)',
          }}>
            The Story
          </div>
          <div data-field="description">
            <EditableField
              value={candidate.description} field="description" candidateId={candidate.id}
              onSaved={onUpdate} multiline placeholder="Add a description... (enriched from website on publish)"
              style={{
                fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 15,
                color: 'var(--color-ink)', lineHeight: 1.7,
              }}
            />
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28 }}>
          {candidate.website_url ? (
            <a href={candidate.website_url} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: color, color: '#fff',
                padding: '10px 20px', borderRadius: 4,
                fontSize: 11, fontWeight: 600, textDecoration: 'none',
                letterSpacing: '0.08em', textTransform: 'uppercase',
                fontFamily: 'var(--font-body)',
              }}>
              Visit Website
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.7 }}>
                <path d="M1 9L9 1M9 1H3M9 1V7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          ) : (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--color-cream)', color: 'var(--color-muted)',
              padding: '10px 20px', borderRadius: 4,
              fontSize: 11, fontWeight: 500, letterSpacing: '0.06em',
              fontFamily: 'var(--font-body)', fontStyle: 'italic',
              border: '1px dashed var(--color-border)',
            }}>
              No website
            </span>
          )}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'transparent', color: 'var(--color-muted)',
            border: '1px solid var(--color-border)',
            padding: '10px 20px', borderRadius: 4,
            fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
            textTransform: 'uppercase', fontFamily: 'var(--font-body)', opacity: 0.5,
          }}>
            Get Directions
          </span>
        </div>

        {/* ── Two Column Grid ──────────────────────────────── */}
        <div className="candidate-grid-2col" style={{
          display: 'grid', gridTemplateColumns: '1fr 280px', gap: 24,
        }}>
          {/* Left: Details */}
          <div>
            <div style={{ padding: '16px 0', borderTop: '1px solid var(--color-border)' }}>
              <div style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--color-muted)',
                marginBottom: 6, fontFamily: 'var(--font-body)',
              }}>
                Website
              </div>
              <EditableField
                value={candidate.website_url} field="website_url" candidateId={candidate.id}
                onSaved={onUpdate} placeholder="Add website URL..."
                style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: color }}
              />
            </div>

            <div style={{ padding: '16px 0', borderTop: '1px solid var(--color-border)' }}>
              <div style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--color-muted)',
                marginBottom: 6, fontFamily: 'var(--font-body)',
              }}>
                Internal Notes
              </div>
              <EditableField
                value={candidate.notes} field="notes" candidateId={candidate.id}
                onSaved={onUpdate} multiline placeholder="Add internal notes..."
                style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.5 }}
              />
            </div>

            {(candidate.source_detail || candidate.source) && (
              <div style={{ padding: '16px 0', borderTop: '1px solid var(--color-border)' }}>
                <div style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
                  textTransform: 'uppercase', color: 'var(--color-muted)',
                  marginBottom: 6, fontFamily: 'var(--font-body)',
                }}>
                  Source
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {candidate.source === 'google_places' && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      background: '#E8F5E9', color: '#2E7D32',
                      padding: '3px 8px', borderRadius: 3,
                      fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-body)',
                      letterSpacing: '0.05em',
                    }}>
                      <span style={{ fontSize: 11 }}>{'\u2713'}</span> Google Places Verified
                    </span>
                  )}
                  {candidate.source === 'ai_prospector' && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      background: '#FFF3E0', color: '#E65100',
                      padding: '3px 8px', borderRadius: 3,
                      fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-body)',
                      letterSpacing: '0.05em',
                    }}>
                      AI Generated
                    </span>
                  )}
                  <p style={{
                    fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)',
                    lineHeight: 1.5, margin: 0, opacity: 0.7,
                  }}>
                    {candidate.source_detail || candidate.source}
                  </p>
                </div>
              </div>
            )}

            {/* Gate results (from prospector pipeline) */}
            {candidate.gate_results?.gates && (
              <GateResultsDisplay gateResults={candidate.gate_results} />
            )}

            <div style={{ padding: '16px 0', borderTop: '1px solid var(--color-border)' }}>
              <div style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--color-muted)',
                marginBottom: 8, fontFamily: 'var(--font-body)',
              }}>
                On Publish
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[
                  { label: 'Address + geocoding', has: true },
                  { label: 'Opening hours', has: !!candidate.website_url },
                  { label: 'Phone + email', has: !!candidate.website_url },
                  { label: 'Category assignment', has: true },
                  { label: 'Description from website', has: !!candidate.website_url && !candidate.description },
                ].filter(f => f.has).map(f => (
                  <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{
                      width: 4, height: 4, borderRadius: '50%',
                      background: 'var(--color-sage)', opacity: 0.5,
                    }} />
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)' }}>
                      {f.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Map */}
          <div>
            <MapPreview
              region={candidate.region}
              style={{ height: 220, borderRadius: 10, overflow: 'hidden' }}
            />
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)',
              textAlign: 'center', marginTop: 8, opacity: 0.6,
            }}>
              Approximate location — geocoded on publish
            </p>
          </div>
        </div>
      </div>

      {/* ── Status Overlays ────────────────────────────────── */}

      {status === 'approving' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          background: 'rgba(255,255,255,0.92)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(2px)',
        }}>
          <div style={{
            width: 48, height: 48, marginBottom: 16,
            border: '3px solid rgba(74,124,89,0.15)', borderTopColor: '#4A7C59',
            borderRadius: '50%', animation: 'candidateSpinner 0.8s linear infinite',
          }} />
          <p style={{
            fontFamily: 'var(--font-display, Georgia)', fontSize: 20,
            fontWeight: 400, color: 'var(--color-ink)', margin: '0 0 6px',
          }}>
            Publishing...
          </p>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 13,
            color: 'var(--color-muted)', margin: 0,
          }}>
            Enriching from website, geocoding, syncing to {VERTICAL_FULL_NAMES[vertical]}
          </p>
        </div>
      )}

      {status === 'success' && result?.listing && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          background: 'rgba(255,255,255,0.95)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(2px)',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'rgba(74, 124, 89, 0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16,
          }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M7 14.5L12 19.5L21 10.5" stroke="#4A7C59" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p style={{
            fontFamily: 'var(--font-display, Georgia)', fontSize: 22,
            fontWeight: 400, color: '#4A7C59', margin: '0 0 4px',
          }}>
            {result._syncWarning ? 'Published to master' : `Live on ${result.listing.verticalName}`}
          </p>
          {result._syncWarning && (
            <div style={{ margin: '0 0 8px', maxWidth: 340, textAlign: 'center' }}>
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: 12,
                color: '#C49A3C', margin: '0 0 6px',
                lineHeight: 1.4,
              }}>
                ⚠ {result._syncWarning}
              </p>
              <button
                onClick={async (e) => {
                  e.stopPropagation()
                  const btn = e.currentTarget
                  btn.disabled = true
                  btn.textContent = 'Retrying...'
                  try {
                    const res = await fetch(`/api/admin/listings/${result.listing.id}/retry-push`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                    })
                    const data = await res.json()
                    if (data.success) {
                      btn.textContent = `Synced to ${data.verticalName}`
                      btn.style.color = '#4A7C59'
                      btn.style.borderColor = '#4A7C59'
                      // Clear the warning
                      setResult(prev => ({ ...prev, _syncWarning: null }))
                    } else {
                      btn.textContent = `Failed: ${data.error || 'unknown'}`
                      btn.style.color = '#CC4444'
                      btn.disabled = false
                    }
                  } catch (err) {
                    btn.textContent = 'Retry failed'
                    btn.style.color = '#CC4444'
                    btn.disabled = false
                  }
                }}
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
                  color: '#C49A3C', background: 'none',
                  border: '1px solid #C49A3C', borderRadius: 6,
                  padding: '5px 14px', cursor: 'pointer',
                  letterSpacing: '0.03em',
                }}
              >
                Retry push
              </button>
            </div>
          )}
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 14,
            color: 'var(--color-ink)', margin: '0 0 20px',
          }}>
            {result.listing.name}{result.listing.region ? ` \u00b7 ${result.listing.region}` : ''}
          </p>
          {result.enrichment?.fieldsExtracted?.length > 0 && (
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 12,
              color: 'var(--color-muted)', margin: '0 0 20px',
            }}>
              Enriched: {result.enrichment.fieldsExtracted.join(', ')}
            </p>
          )}
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {result.listing.url && (
              <a href={result.listing.url} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
                  color: '#fff', background: '#4A7C59',
                  padding: '10px 20px', borderRadius: 8,
                  textDecoration: 'none',
                  boxShadow: '0 2px 6px rgba(74,124,89,0.3)',
                }}>
                View listing &rarr;
              </a>
            )}
            <button onClick={advanceNow}
              style={{
                fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
                color: 'var(--color-muted)', background: 'none',
                border: '1px solid var(--color-border)', borderRadius: 8,
                padding: '10px 20px', cursor: 'pointer',
              }}>
              Continue &rarr;
            </button>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          background: 'rgba(255,255,255,0.95)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(2px)',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'rgba(204, 68, 68, 0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16,
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#CC4444" strokeWidth="2"/>
              <path d="M8 8L16 16M16 8L8 16" stroke="#CC4444" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
            color: '#CC4444', margin: '0 0 6px', textAlign: 'center', maxWidth: 400,
          }}>
            {errorMsg}
          </p>
          <button
            onClick={() => { setStatus('idle'); setErrorMsg(null); busyRef.current = false }}
            style={{
              fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
              color: '#CC4444', background: 'rgba(204, 68, 68, 0.06)',
              border: '1px solid rgba(204, 68, 68, 0.2)', borderRadius: 8,
              padding: '8px 20px', cursor: 'pointer', marginTop: 12,
            }}>
            Retry
          </button>
        </div>
      )}

      {status === 'rejected' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          background: 'rgba(204, 68, 68, 0.04)',
          transition: 'opacity 0.3s ease',
        }} />
      )}
    </div>
  )
}

// ─── Completion Illustration ──────────────────────────────

function PinDropIllustration() {
  return (
    <div style={{ width: 80, height: 80, position: 'relative', margin: '0 auto 24px' }}>
      <style>{`
        @keyframes pinSettleDrop {
          0% { transform: translateY(-30px) scale(0.8); opacity: 0; }
          60% { transform: translateY(2px) scale(1.05); opacity: 1; }
          80% { transform: translateY(-3px) scale(0.98); }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes dotReveal {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(0); opacity: 0; }
          70% { transform: scale(1.3); opacity: 0.5; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes ringPulse {
          0% { transform: scale(0.5); opacity: 0; }
          40% { transform: scale(0.5); opacity: 0; }
          65% { transform: scale(1); opacity: 0.35; }
          100% { transform: scale(1.8); opacity: 0; }
        }
      `}</style>
      {/* Amber pulse ring */}
      <div style={{
        position: 'absolute', left: '50%', bottom: 10, width: 24, height: 24,
        marginLeft: -12, borderRadius: '50%',
        border: '2px solid #C49A3C',
        animation: 'ringPulse 1.6s ease-out forwards',
      }} />
      {/* Amber dot */}
      <div style={{
        position: 'absolute', left: '50%', bottom: 16, width: 12, height: 12,
        marginLeft: -6, borderRadius: '50%',
        background: '#C49A3C',
        animation: 'dotReveal 1.2s ease-out forwards',
      }} />
      {/* Map pin */}
      <svg width="28" height="36" viewBox="0 0 28 36" fill="none"
        style={{
          position: 'absolute', left: '50%', bottom: 20, marginLeft: -14,
          animation: 'pinSettleDrop 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.12))',
        }}>
        <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z" fill="#4A7C59"/>
        <circle cx="14" cy="13" r="5" fill="#fff" opacity="0.9"/>
      </svg>
    </div>
  )
}

// ─── Completion Screen ────────────────────────────────────

const HEADLINES_PUBLISHED = [
  'Queue cleared. The Atlas grows.',
  "That's the lot. Well curated.",
  'All candidates reviewed. Independent Australia thanks you.',
  'Done for today. The map is better for it.',
]
const HEADLINE_NONE_PUBLISHED = 'Nothing made the cut today. The bar stays high.'

function CompletionScreen({ approved, rejected, regions }) {
  const [headlineIdx] = useState(() => Math.floor(Math.random() * HEADLINES_PUBLISHED.length))
  const headline = approved > 0 ? HEADLINES_PUBLISHED[headlineIdx] : HEADLINE_NONE_PUBLISHED
  const totalReviewed = approved + rejected
  const uniqueRegions = regions.length

  return (
    <div style={{
      textAlign: 'center', padding: '4rem 2.5rem',
      background: '#fff', borderRadius: 16,
      border: '1px solid var(--color-border)',
      boxShadow: '0 2px 16px rgba(0,0,0,0.04)',
    }}>
      <PinDropIllustration />

      <h2 style={{
        fontFamily: 'var(--font-display, Georgia)', fontSize: 'clamp(20px, 3.5vw, 26px)',
        fontWeight: 400, color: 'var(--color-ink)',
        margin: '0 0 24px', lineHeight: 1.35,
        maxWidth: 440, marginLeft: 'auto', marginRight: 'auto',
      }}>
        {headline}
      </h2>

      {/* Session stats */}
      {totalReviewed > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 6, flexWrap: 'wrap',
          fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 400,
          color: 'var(--color-muted)',
          marginBottom: 8,
        }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--color-muted)', opacity: 0.5 }}>
            Today
          </span>
          <span style={{ opacity: 0.25, margin: '0 4px' }}>&middot;</span>
          {approved > 0 && (
            <>
              <span style={{ color: '#4A7C59', fontWeight: 500 }}>
                {'\u2713'} {approved} published
              </span>
              <span style={{ opacity: 0.25 }}>&middot;</span>
            </>
          )}
          {rejected > 0 && (
            <>
              <span style={{ color: 'var(--color-muted)' }}>
                {'\u2717'} {rejected} skipped
              </span>
            </>
          )}
          {uniqueRegions > 0 && (
            <>
              <span style={{ opacity: 0.25 }}>&middot;</span>
              <span style={{ color: '#C49A3C', fontWeight: 500 }}>
                {uniqueRegions} new region{uniqueRegions !== 1 ? 's' : ''} covered
              </span>
            </>
          )}
        </div>
      )}

      {/* Region list */}
      {uniqueRegions > 0 && (
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap',
          marginTop: 12, marginBottom: 20,
        }}>
          {regions.map(r => (
            <span key={r} style={{
              fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500,
              color: 'var(--color-muted)', background: 'var(--color-cream)',
              padding: '3px 10px', borderRadius: 100,
            }}>
              {r}
            </span>
          ))}
        </div>
      )}

      {/* Next run note */}
      <p style={{
        fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 300,
        color: 'var(--color-muted)', opacity: 0.6,
        marginTop: 28, marginBottom: 0,
      }}>
        Check back tomorrow — the prospector runs overnight.
      </p>
    </div>
  )
}

// ─── Vertical Filter Bar ─────────────────────────────────

function VerticalFilterBar({ activeFilter, onFilterChange, queueDepth }) {
  const allCount = Object.values(queueDepth).reduce((s, n) => s + n, 0)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      padding: '10px 0', marginBottom: 16,
    }}>
      <button
        onClick={() => onFilterChange(null)}
        style={{
          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: activeFilter === null ? 600 : 400,
          color: activeFilter === null ? '#fff' : 'var(--color-muted)',
          background: activeFilter === null ? 'var(--color-sage)' : 'var(--color-cream)',
          border: 'none', borderRadius: 100, padding: '5px 12px',
          cursor: 'pointer', transition: 'all 0.15s',
        }}
      >
        All ({allCount})
      </button>
      {Object.entries(VERTICAL_NAMES).map(([key, label]) => {
        const count = queueDepth[key] || 0
        const isActive = activeFilter === key
        const color = VERTICAL_COLORS[key] || 'var(--color-muted)'
        return (
          <button
            key={key}
            onClick={() => onFilterChange(isActive ? null : key)}
            style={{
              fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: isActive ? 600 : 500,
              letterSpacing: '0.04em',
              color: isActive ? '#fff' : count > 0 ? color : 'var(--color-muted)',
              background: isActive ? color : count > 0 ? `${color}12` : 'transparent',
              border: `1px solid ${isActive ? color : count > 0 ? `${color}30` : 'var(--color-border)'}`,
              borderRadius: 100, padding: '4px 10px',
              cursor: 'pointer', transition: 'all 0.15s',
              opacity: count === 0 && !isActive ? 0.5 : 1,
            }}
          >
            {label} ({count})
          </button>
        )
      })}
    </div>
  )
}

// ─── Rejected Log ────────────────────────────────────────

function RejectedLog({ rejectedCandidates }) {
  if (!rejectedCandidates || rejectedCandidates.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '3rem 2rem',
        border: '1px dashed var(--color-border)', borderRadius: 8,
      }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 14,
          color: 'var(--color-muted)', margin: 0,
        }}>
          No rejected candidates yet.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {rejectedCandidates.map(c => {
        const color = VERTICAL_COLORS[c.vertical] || 'var(--color-muted)'
        const reviewedDate = c.reviewed_at ? new Date(c.reviewed_at).toLocaleDateString() : ''
        const confidencePercent = c.confidence ? Math.round(c.confidence * 100) : null
        return (
          <div key={c.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px', borderRadius: 8,
            background: '#fff', border: '1px solid var(--color-border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{
                fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: '#fff', background: color,
                padding: '2px 8px', borderRadius: 3, flexShrink: 0,
              }}>
                {VERTICAL_NAMES[c.vertical] || c.vertical}
              </span>
              <span style={{
                fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
                color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {c.name}
              </span>
              {c.region && (
                <span style={{
                  fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)',
                  fontStyle: 'italic', flexShrink: 0,
                }}>
                  {c.region}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              {confidencePercent !== null && (
                <span style={{
                  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500,
                  color: confidencePercent >= 80 ? '#4A7C59' : 'var(--color-muted)',
                }}>
                  {confidencePercent}%
                </span>
              )}
              <span style={{
                fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)',
              }}>
                {reviewedDate}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Generate Button ─────────────────────────────────────

function GenerateButton({ onGenerated }) {
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/admin/candidates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Generation failed')
      } else {
        setResult(data)
        if (data.total_queued > 0) onGenerated?.()
      }
    } catch (err) {
      setError(err.message || 'Network error')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
            letterSpacing: '0.04em',
            color: '#fff', background: generating ? '#3a6a49' : '#4A7C59',
            border: 'none', borderRadius: 8, padding: '10px 20px',
            cursor: generating ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
            transition: 'all 0.15s',
            boxShadow: '0 1px 3px rgba(74,124,89,0.3)',
          }}
        >
          {generating ? (
            <>
              <div style={{
                width: 14, height: 14,
                border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
                borderRadius: '50%', animation: 'candidateSpinner 0.6s linear infinite',
              }} />
              Generating...
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1V13M1 7H13" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Generate Now
            </>
          )}
        </button>
        {result && (
          <span style={{
            fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
            color: result.total_queued > 0 ? '#4A7C59' : 'var(--color-muted)',
          }}>
            {result.total_queued > 0
              ? `${result.total_queued} new candidates queued (${result.duration_seconds}s)`
              : `No new candidates found (${result.duration_seconds}s)`
            }
          </span>
        )}
        {error && (
          <span style={{
            fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
            color: '#CC4444',
          }}>
            {error}
          </span>
        )}
      </div>

      {/* Per-vertical results breakdown */}
      {result?.results?.length > 0 && (
        <div style={{
          marginTop: 10, padding: '10px 14px',
          background: 'var(--color-cream)', borderRadius: 8,
          display: 'flex', gap: 12, flexWrap: 'wrap',
        }}>
          {result.results.map(r => (
            <span key={r.vertical} style={{
              fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 500,
              color: r.queued > 0 ? '#4A7C59' : r.status === 'skipped' ? 'var(--color-muted)' : '#CC4444',
            }}>
              {VERTICAL_NAMES[r.vertical] || r.vertical}: {r.status === 'skipped' ? 'full' : `+${r.queued}`}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Queue Container ──────────────────────────────────────

export default function CandidateReviewQueue({ initialCandidates = [], initialRejected = [], queueDepth = {}, mapboxToken }) {
  const [candidates, setCandidates] = useState(initialCandidates)
  const [approved, setApproved] = useState(0)
  const [rejected, setRejected] = useState(0)
  const [publishedRegions, setPublishedRegions] = useState([])
  const [verticalFilter, setVerticalFilter] = useState(null)
  const [activeTab, setActiveTab] = useState('review') // 'review' | 'rejected'
  const [depth, setDepth] = useState(queueDepth)
  // Track candidates whose vertical was changed mid-review so they stay
  // visible in the current filter until explicitly published or skipped.
  const [verticalOverrides, setVerticalOverrides] = useState({}) // { candidateId: originalVertical }
  const focusDescRefs = useRef({})
  const totalReviewed = approved + rejected
  const totalQueue = candidates.length + totalReviewed

  // Filter candidates by vertical — but keep candidates whose vertical was
  // changed during this session (they should remain visible until actioned)
  const filteredCandidates = verticalFilter
    ? candidates.filter(c => c.vertical === verticalFilter || verticalOverrides[c.id])
    : candidates

  useEffect(() => {
    if (mapboxToken) window.__MAPBOX_TOKEN = mapboxToken
  }, [mapboxToken])

  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return
      if (filteredCandidates.length === 0) return
      switch (e.key) {
        case 'ArrowRight': case 'y': case 'Y': {
          e.preventDefault()
          const btn = document.querySelector('[data-candidate-index="0"] [data-action="approve"]')
          if (btn) btn.click()
          break
        }
        case 'ArrowLeft': case 'n': case 'N': {
          e.preventDefault()
          const btn = document.querySelector('[data-candidate-index="0"] [data-action="reject"]')
          if (btn) btn.click()
          break
        }
        case 'e': case 'E': {
          e.preventDefault()
          if (focusDescRefs.current[0]) focusDescRefs.current[0]()
          break
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [filteredCandidates.length])

  const handleApprove = useCallback((id, region) => {
    const candidate = candidates.find(c => c.id === id)
    setCandidates(prev => prev.filter(c => c.id !== id))
    setApproved(a => a + 1)
    setVerticalOverrides(vo => { const { [id]: _, ...rest } = vo; return rest })
    if (region) {
      setPublishedRegions(prev => prev.includes(region) ? prev : [...prev, region])
    }
    // Update depth counter — use the candidate's current (possibly changed) vertical
    if (candidate) {
      setDepth(prev => ({
        ...prev,
        [candidate.vertical]: Math.max(0, (prev[candidate.vertical] || 0) - 1),
      }))
    }
  }, [candidates])
  const handleReject = useCallback((id) => {
    const candidate = candidates.find(c => c.id === id)
    setCandidates(prev => prev.filter(c => c.id !== id))
    setRejected(r => r + 1)
    setVerticalOverrides(vo => { const { [id]: _, ...rest } = vo; return rest })
    if (candidate) {
      setDepth(prev => ({
        ...prev,
        [candidate.vertical]: Math.max(0, (prev[candidate.vertical] || 0) - 1),
      }))
    }
  }, [candidates])
  const handleUpdate = useCallback((updated) => {
    setCandidates(prev => prev.map(c => {
      if (c.id !== updated.id) return c
      // If the vertical changed and we have an active filter, pin the candidate
      // so it doesn't vanish from the queue mid-review.
      if (updated.vertical && updated.vertical !== c.vertical && verticalFilter) {
        setVerticalOverrides(vo => ({ ...vo, [c.id]: c.vertical }))
      }
      return { ...c, ...updated }
    }))
  }, [verticalFilter])
  const handleGenerated = useCallback(() => {
    // Reload the page to pick up new candidates
    window.location.reload()
  }, [])

  const progressPct = totalQueue > 0 ? (totalReviewed / totalQueue) * 100 : 0
  const queueEmpty = filteredCandidates.length === 0

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <style>{`
        @keyframes candidateSpinner { to { transform: rotate(360deg) } }
        @media (max-width: 720px) {
          .candidate-grid-2col { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 16,
        borderBottom: '1px solid var(--color-border)',
      }}>
        {[
          { key: 'review', label: `Review Queue (${candidates.length})` },
          { key: 'rejected', label: `Rejected Log (${initialRejected.length})` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? 'var(--color-ink)' : 'var(--color-muted)',
              background: 'none', border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid var(--color-sage)' : '2px solid transparent',
              padding: '10px 20px', cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'rejected' ? (
        <RejectedLog rejectedCandidates={initialRejected} />
      ) : (
        <>
          {/* Vertical filter bar with queue depth */}
          <VerticalFilterBar
            activeFilter={verticalFilter}
            onFilterChange={setVerticalFilter}
            queueDepth={depth}
          />

          {/* Generate button — shown when queue is low */}
          {candidates.length < 50 && (
            <GenerateButton onGenerated={handleGenerated} />
          )}

          {/* Keyboard hints — only while reviewing */}
          {!queueEmpty && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 16, padding: '10px 16px', marginBottom: 20,
              background: 'var(--color-cream)', borderRadius: 8,
              fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)',
              fontWeight: 400, flexWrap: 'wrap',
            }}>
              <span><Kbd>Y</Kbd> / <Kbd>{'\u2192'}</Kbd> publish</span>
              <span style={{ opacity: 0.3 }}>|</span>
              <span><Kbd>N</Kbd> / <Kbd>{'\u2190'}</Kbd> skip</span>
              <span style={{ opacity: 0.3 }}>|</span>
              <span><Kbd>E</Kbd> edit description</span>
            </div>
          )}

          {/* Progress bar — only while reviewing */}
          {!queueEmpty && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, color: 'var(--color-ink)' }}>
                  {totalReviewed} of {totalQueue} reviewed
                  {verticalFilter && (
                    <span style={{ fontWeight: 400, color: 'var(--color-muted)' }}>
                      {' '}({VERTICAL_NAMES[verticalFilter]} filter)
                    </span>
                  )}
                </span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)' }}>
                  <span style={{ color: '#4A7C59' }}>{approved} published</span>
                  {' / '}
                  <span style={{ color: '#CC4444' }}>{rejected} skipped</span>
                </span>
              </div>
              <div style={{ height: 3, borderRadius: 2, background: 'var(--color-border)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${progressPct}%`,
                  background: 'var(--color-sage)', borderRadius: 2,
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </div>
          )}

          {/* Active review or completion */}
          {!queueEmpty ? (
            <div>
              <div key={filteredCandidates[0].id} data-candidate-index={0}>
                <CandidatePreview
                  candidate={filteredCandidates[0]} isFocused={true} index={0}
                  onApprove={handleApprove} onReject={handleReject} onUpdate={handleUpdate}
                  focusDescRefs={focusDescRefs}
                />
              </div>
              {filteredCandidates.length > 1 && (
                <p style={{
                  textAlign: 'center', fontFamily: 'var(--font-body)',
                  fontSize: 13, color: 'var(--color-muted)', marginTop: 8,
                }}>
                  {filteredCandidates.length - 1} more candidate{filteredCandidates.length - 1 !== 1 ? 's' : ''} in queue
                </p>
              )}
            </div>
          ) : totalReviewed > 0 ? (
            <CompletionScreen
              approved={approved}
              rejected={rejected}
              regions={publishedRegions}
            />
          ) : (
            <div style={{
              textAlign: 'center', padding: '5rem 2rem',
              background: '#fff', borderRadius: 16,
              border: '1px solid var(--color-border)',
            }}>
              <p style={{
                fontFamily: 'var(--font-display, Georgia)', fontSize: 22,
                fontWeight: 400, color: 'var(--color-ink)', marginBottom: 8,
              }}>
                {verticalFilter ? `No pending ${VERTICAL_NAMES[verticalFilter]} candidates` : 'No pending candidates'}
              </p>
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
                color: 'var(--color-muted)', lineHeight: 1.5,
              }}>
                {verticalFilter
                  ? 'Try removing the filter or click Generate Now above.'
                  : 'Click Generate Now to populate the candidate queue.'
                }
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
