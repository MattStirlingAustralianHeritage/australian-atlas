'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  WAY_PRIMARY_TYPE_OPTIONS, WAY_OPERATOR_TYPE_OPTIONS,
  WAY_PRESENCE_TYPE_OPTIONS, WAY_ACCREDITATION_OPTIONS,
  MONTH_OPTIONS, requiresCulturalAuthority, isAboriginalOperatorType,
} from '@/lib/wayLabels'
import AddListingForm from './AddListingForm'
import SuggestUrlPill from './SuggestUrlPill'
import { VERTICAL_ACCENTS } from '@/lib/verticalUrl'

const VERTICAL_NAMES = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
}

const VERTICAL_COLORS = VERTICAL_ACCENTS

const VERTICAL_TYPE_LABELS = {
  sba: 'Artisan Producer', collection: 'Culture', craft: 'Maker Studio',
  fine_grounds: 'Coffee', rest: 'Boutique Stay', field: 'Nature Destination',
  corner: 'Independent Shop', found: 'Vintage & Antique', table: 'Food & Produce',
  way: 'Experience Operator',
}

const VERTICAL_FULL_NAMES = {
  sba: 'Small Batch Atlas', collection: 'Culture Atlas', craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas', rest: 'Rest Atlas', field: 'Field Atlas',
  corner: 'Corner Atlas', found: 'Found Atlas', table: 'Table Atlas', way: 'Way Atlas',
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
    { value: 'cinema', label: 'Cinema' },
    { value: 'drive_in', label: 'Drive-In' },
    { value: 'live_music_venue', label: 'Live Music Venue' },
    { value: 'comedy_club', label: 'Comedy Club' },
  ],
  craft: [
    { value: 'ceramics_clay', label: 'Ceramics & Clay' },
    { value: 'visual_art', label: 'Visual Art' },
    { value: 'jewellery_metalwork', label: 'Jewellery & Metalwork' },
    { value: 'textile_fibre', label: 'Textile & Fibre' },
    { value: 'wood_furniture', label: 'Wood & Furniture' },
    { value: 'glass', label: 'Glass' },
    { value: 'printmaking', label: 'Printmaking' },
    { value: 'leathermaker', label: 'Leatherwork' },
    { value: 'shoemaker', label: 'Shoemaking' },
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
    { value: 'heritage_hotel', label: 'Heritage Hotel' },
    { value: 'national_park_stay', label: 'National Park Stay' },
    { value: 'heritage_lighthouse', label: 'Heritage Lighthouse' },
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
    { value: 'botanic_garden', label: 'Botanic Garden' },
    { value: 'nature_reserve', label: 'Nature Reserve' },
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
    { value: 'other', label: 'Other' },
  ],
  found: [
    { value: 'vintage_clothing', label: 'Vintage Clothing' },
    { value: 'vintage_furniture', label: 'Vintage Furniture' },
    { value: 'vintage_store', label: 'Vintage Store' },
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
  // Way Atlas primary types (extends Spec §III). Order matches the spec's
  // narrative grouping: walks → cultural → flights → marine → specialist
  // → heritage → workshop → mobility.
  way: [
    { value: 'guided_walk_multiday',       label: 'Guided Walk — Multi-day' },
    { value: 'guided_walk_day',            label: 'Guided Walk — Day' },
    { value: 'cultural_tour',              label: 'Cultural Tour (Aboriginal-led)' },
    { value: 'scenic_flight',              label: 'Scenic Flight' },
    { value: 'helicopter_tour',            label: 'Helicopter Tour' },
    { value: 'sailing_charter',            label: 'Sailing Charter' },
    { value: 'sea_kayak_tour',             label: 'Sea Kayak Tour' },
    { value: 'dive_operator',              label: 'Dive Operator' },
    { value: 'fishing_guide',              label: 'Fishing Guide' },
    { value: 'photography_expedition',     label: 'Photography Expedition' },
    { value: 'specialist_natural_history', label: 'Specialist Natural History' },
    { value: 'foraging_bushfood',          label: 'Foraging & Bush Food' },
    { value: 'heritage_tour',              label: 'Heritage Tour' },
    { value: 'workshop_intensive',         label: 'Workshop Intensive' },
    { value: 'river_canoe_tour',           label: 'River & Canoe Tour' },
    { value: 'horseback_expedition',       label: 'Horseback Expedition' },
    { value: 'four_wheel_drive_expedition',label: '4WD Expedition' },
    { value: 'hot_air_balloon',            label: 'Hot Air Ballooning' },
    { value: 'marine_wildlife_swim',       label: 'Marine Wildlife Swim' },
    { value: 'whale_watching',             label: 'Whale Watching' },
    { value: 'snorkelling',                label: 'Snorkelling' },
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

function VerticalSelect({ value, secondary, candidateId, onSaved }) {
  const [saving, setSaving] = useState(false)
  const color = VERTICAL_COLORS[value] || 'var(--color-muted)'

  const handleChange = async (e) => {
    const newVertical = e.target.value
    if (newVertical === value) return
    setSaving(true)
    try {
      // Keep the cross-vertical array coherent: new primary first, retain an
      // existing secondary unless it now collides with the new primary.
      const verticals = secondary && secondary !== newVertical
        ? [newVertical, secondary]
        : [newVertical]
      const res = await fetch(`/api/admin/candidates/${candidateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vertical: newVertical, verticals }),
      })
      if (res.ok) {
        const { candidate } = await res.json()
        if (candidate) onSaved?.(candidate)
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

// Optional second vertical — lets a venue be published across two verticals
// (e.g. a distillery that also has a cellar-door café). Ghost pill until set,
// then mirrors the chosen vertical's colour as an outline. Persists via the
// candidate `verticals` array (primary first).
function SecondaryVerticalSelect({ primary, value, candidateId, onSaved }) {
  const [saving, setSaving] = useState(false)
  const color = VERTICAL_COLORS[value] || 'var(--color-muted)'

  const handleChange = async (e) => {
    const next = e.target.value
    if (next === (value || '')) return
    setSaving(true)
    try {
      const verticals = next ? [primary, next] : [primary]
      const res = await fetch(`/api/admin/candidates/${candidateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verticals }),
      })
      if (res.ok) {
        const { candidate } = await res.json()
        if (candidate) onSaved?.(candidate)
      }
    } catch (err) {
      console.error('Secondary vertical update failed:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <select value={value || ''} onChange={handleChange} disabled={saving}
      title="Also list under a second vertical (optional)"
      style={{
        fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
        letterSpacing: '0.12em', textTransform: 'uppercase',
        color: value ? color : 'var(--color-muted)',
        background: value ? color + '14' : 'transparent',
        padding: '4px 22px 4px 10px', borderRadius: 3,
        border: `1px ${value ? 'solid' : 'dashed'} ${value ? color : 'var(--color-border)'}`,
        cursor: 'pointer', outline: 'none',
        appearance: 'none', WebkitAppearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='5' viewBox='0 0 8 5' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L4 4L7 1' stroke='%23999' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 6px center',
        opacity: saving ? 0.6 : 1,
      }}>
      <option value="" style={{ background: '#fff', color: '#333', textTransform: 'none' }}>+ 2nd vertical</option>
      {Object.entries(VERTICAL_NAMES).filter(([key]) => key !== primary).map(([key, label]) => (
        <option key={key} value={key} style={{ background: '#fff', color: '#333', textTransform: 'none' }}>Also: {label}</option>
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

function CandidatePreview({ candidate, isFocused, index, onApprove, onReject, onUpdate, focusDescRefs, regions = [] }) {
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
  const [addressOnRequest, setAddressOnRequest] = useState(false)
  const [visitable, setVisitable] = useState(true)
  const [presenceType, setPresenceType] = useState('permanent')
  const [offersClasses, setOffersClasses] = useState(false)

  // ─── Editable address / suburb / region (regions overhaul, 2026-04-30) ───
  // The address triggers geocoding on blur via /api/admin/candidates/[id]/geocode,
  // which writes lat/lng to the candidate row and runs spatial-containment lookup
  // against the regions polygon set. The reviewer can override the suggested
  // region from the dropdown. On publish, region_override_id is what's written
  // to listings — NOT the legacy region text column.
  const [editAddress, setEditAddress] = useState(candidate.address || '')
  const [editSuburb, setEditSuburb] = useState('')
  const [editRegionId, setEditRegionId] = useState(null)
  const [editLat, setEditLat] = useState(candidate.lat ?? null)
  const [editLng, setEditLng] = useState(candidate.lng ?? null)
  // geocodeStatus: 'idle' | 'pending' | 'auto_filled' | 'no_region' | 'failed' | 'manual'
  //   - idle:        no geocode attempted yet this session
  //   - pending:     POST in flight
  //   - auto_filled: geocode succeeded AND spatial lookup matched a region
  //   - no_region:   geocode succeeded BUT lat/lng falls outside any polygonised region
  //   - failed:      Mapbox returned no result; reviewer keeps their inputs
  //   - manual:      reviewer changed the dropdown after auto-fill
  const [geocodeStatus, setGeocodeStatus] = useState('idle')

  // ─── Way Atlas editorial classification state ─────────────────────
  // Only relevant when vertical === 'way'. Each field maps to a
  // way_meta column. The panel captures values; 4C wires the writes.
  const [wayOperatorType, setWayOperatorType] = useState('')
  const [wayAboriginalCommunity, setWayAboriginalCommunity] = useState('')
  const [wayCulturalAuthorityVerified, setWayCulturalAuthorityVerified] = useState(false)
  const [wayCulturalAuthorityNotes, setWayCulturalAuthorityNotes] = useState('')
  const [wayAccreditations, setWayAccreditations] = useState([])
  const [wayPrimaryRegionId, setWayPrimaryRegionId] = useState(() => {
    if (candidate.vertical !== 'way') return null
    return candidate.region_computed_id || null
  })
  const [wayAdditionalRegionIds, setWayAdditionalRegionIds] = useState([])
  const [wayDeparturePointName, setWayDeparturePointName] = useState('')
  const [waySecondaryTypes, setWaySecondaryTypes] = useState([])
  const [wayEstablishedYear, setWayEstablishedYear] = useState('')
  const [wayPresenceType, setWayPresenceType] = useState('year_round')
  const [wayOperatingSeasonMonths, setWayOperatingSeasonMonths] = useState([])
  const [wayMultipleDeparturePoints, setWayMultipleDeparturePoints] = useState(false)
  const [wayOperatorName, setWayOperatorName] = useState('')
  const [wayFormTouched, setWayFormTouched] = useState(false)

  const vertical = candidate.vertical || 'sba'
  // Cross-vertical: a candidate may carry a second vertical in `verticals`.
  const secondaryVertical = (Array.isArray(candidate.verticals) ? candidate.verticals : []).find(v => v && v !== vertical) || ''
  const color = VERTICAL_COLORS[vertical] || '#5F8A7E'
  const confidence = candidate.confidence || 0
  const confidencePercent = Math.round(confidence * 100)
  const buttonsDisabled = status !== 'idle' && status !== 'error'
  const noSubcategory = !subcategory && (SUBCATEGORY_OPTIONS[vertical]?.length > 0)

  // ── Way panel validation ──────────────────────────────────────
  // Single derived value drives both button disabled state and
  // inline error rendering. Returns true when not Way, so the
  // check is safe to add to the publish button unconditionally.
  const isWayPanelValid = vertical !== 'way' || (
    !!wayOperatorType &&
    (!isAboriginalOperatorType(wayOperatorType) || !!wayAboriginalCommunity.trim()) &&
    (!requiresCulturalAuthority(subcategory, wayOperatorType) || wayCulturalAuthorityVerified) &&
    (!wayCulturalAuthorityVerified || !!wayCulturalAuthorityNotes.trim()) &&
    !!wayPrimaryRegionId &&
    (wayPresenceType !== 'seasonal' || wayOperatingSeasonMonths.length > 0)
  )

  // Assembled payload — 4C reads this to write way_meta.
  const wayClassification = vertical === 'way' ? {
    operator_type: wayOperatorType || undefined,
    aboriginal_community: isAboriginalOperatorType(wayOperatorType) ? (wayAboriginalCommunity.trim() || undefined) : undefined,
    cultural_authority_verified: requiresCulturalAuthority(subcategory, wayOperatorType) ? wayCulturalAuthorityVerified : false,
    cultural_authority_notes: (requiresCulturalAuthority(subcategory, wayOperatorType) && wayCulturalAuthorityVerified)
      ? (wayCulturalAuthorityNotes.trim() || undefined) : undefined,
    accreditations: wayAccreditations.length > 0 ? wayAccreditations : [],
    primary_region_id: wayPrimaryRegionId || undefined,
    operating_region_ids: wayPrimaryRegionId
      ? [wayPrimaryRegionId, ...wayAdditionalRegionIds]
      : [],
    departure_point_name: (wayDeparturePointName.trim() || editSuburb.trim()) || undefined,
    secondary_types: waySecondaryTypes.length > 0 ? waySecondaryTypes : [],
    established_year: wayEstablishedYear ? parseInt(wayEstablishedYear, 10) : undefined,
    presence_type: wayPresenceType || 'year_round',
    operating_season_months: wayPresenceType === 'seasonal' ? wayOperatingSeasonMonths : [],
    multiple_departure_points: wayMultipleDeparturePoints,
    operator_legal_name: wayOperatorName.trim() || undefined,
  } : undefined

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

  // ── Way: clear hidden conditional fields on state change ──────
  // When a field hides because its condition is no longer met,
  // clear its value so orphan data doesn't persist into the payload.

  // Clear aboriginal_community when operator_type is not aboriginal_*
  useEffect(() => {
    if (vertical === 'way' && !isAboriginalOperatorType(wayOperatorType)) {
      setWayAboriginalCommunity('')
    }
  }, [vertical, wayOperatorType])

  // Clear cultural authority fields when Gate 4 no longer applies
  useEffect(() => {
    if (vertical === 'way' && !requiresCulturalAuthority(subcategory, wayOperatorType)) {
      setWayCulturalAuthorityVerified(false)
      setWayCulturalAuthorityNotes('')
    }
  }, [vertical, subcategory, wayOperatorType])

  // Clear cultural_authority_notes when verified is unchecked
  useEffect(() => {
    if (vertical === 'way' && !wayCulturalAuthorityVerified) {
      setWayCulturalAuthorityNotes('')
    }
  }, [vertical, wayCulturalAuthorityVerified])

  // Clear operating_season_months when presence changes from seasonal
  useEffect(() => {
    if (vertical === 'way' && wayPresenceType !== 'seasonal') {
      setWayOperatingSeasonMonths([])
    }
  }, [vertical, wayPresenceType])

  // Remove primary region from additional list when primary changes
  useEffect(() => {
    if (vertical === 'way' && wayPrimaryRegionId) {
      setWayAdditionalRegionIds(prev => prev.filter(id => id !== wayPrimaryRegionId))
    }
  }, [vertical, wayPrimaryRegionId])

  // Geocode + spatial region lookup. Fires on blur of EITHER the address
  // field OR the suburb field — whichever loses focus last "wins" via a
  // 300ms debounce. The reviewer's natural workflow is type-address →
  // tab → type-suburb → tab-out, so debouncing prevents two redundant
  // geocode calls (one stale, one current) when both blurs land in
  // quick succession.
  //
  // Latest field values are read from refs at fire time, so the timer
  // always uses the freshest input regardless of which blur scheduled it.
  // The geocoded combination is memoised to prevent re-firing the same
  // call (e.g. on a re-blur of an unchanged field).
  const editAddressRef = useRef(editAddress)
  const editSuburbRef = useRef(editSuburb)
  useEffect(() => { editAddressRef.current = editAddress }, [editAddress])
  useEffect(() => { editSuburbRef.current = editSuburb }, [editSuburb])

  const debounceTimerRef = useRef(null)
  const lastGeocodedKeyRef = useRef(null)
  const GEOCODE_DEBOUNCE_MS = 300

  const scheduleGeocode = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(async () => {
      const trimmedAddress = (editAddressRef.current || '').trim()
      const trimmedSuburb = (editSuburbRef.current || '').trim()
      if (!trimmedAddress && !trimmedSuburb) return // nothing to geocode against
      const key = `${trimmedAddress}||${trimmedSuburb}||${candidate.state || ''}`
      if (key === lastGeocodedKeyRef.current) return // identical input as last call

      setGeocodeStatus('pending')
      try {
        const res = await fetch(`/api/admin/candidates/${candidate.id}/geocode`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: trimmedAddress || null,
            suburb: trimmedSuburb || null,
            state: candidate.state || null,
          }),
        })
        if (!res.ok) {
          setGeocodeStatus('failed')
          return
        }
        const data = await res.json()
        lastGeocodedKeyRef.current = key
        if (data.geocode_failed) {
          setGeocodeStatus('failed')
          return
        }
        setEditLat(data.lat)
        setEditLng(data.lng)
        if (data.suggested_region_id) {
          setEditRegionId(data.suggested_region_id)
          setGeocodeStatus('auto_filled')
        } else {
          setGeocodeStatus('no_region')
        }
      } catch {
        setGeocodeStatus('failed')
      }
    }, GEOCODE_DEBOUNCE_MS)
  }, [candidate.id, candidate.state])

  // Clear any pending timer if the component unmounts mid-debounce
  // (otherwise the timer fires against a stale closure).
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [])

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
          address_on_request: addressOnRequest,
          visitable,
          presence_type: presenceType,
          offers_classes: offersClasses,
          wayClassification,
          reviewerOverrides: {
            name: candidate.name || undefined,
            description: candidate.description || undefined,
            website_url: candidate.website_url || undefined,
            region: candidate.region || undefined,
            // New editable fields — written to listings.address / suburb /
            // region_override_id / lat / lng. The legacy listings.region
            // text column is intentionally NOT written by the publish handler;
            // region resolution goes through region_override_id (set here)
            // and region_computed_id (set by the spatial trigger on lat/lng).
            address: (editAddress || '').trim() || undefined,
            suburb: (editSuburb || '').trim() || undefined,
            region_override_id: editRegionId || undefined,
            lat: editLat ?? undefined,
            lng: editLng ?? undefined,
            state: candidate.state || undefined,
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
          <VerticalSelect value={vertical} secondary={secondaryVertical} candidateId={candidate.id} onSaved={onUpdate} />
          <SecondaryVerticalSelect primary={vertical} value={secondaryVertical} candidateId={candidate.id} onSaved={onUpdate} />
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
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 500,
            color: addressOnRequest ? '#7C3AED' : 'var(--color-muted)',
            cursor: 'pointer', userSelect: 'none',
          }}>
            <input
              type="checkbox"
              checked={addressOnRequest}
              onChange={e => setAddressOnRequest(e.target.checked)}
              style={{ margin: 0, accentColor: '#7C3AED' }}
            />
            AOR
          </label>
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 500,
            color: !visitable ? '#7C3AED' : 'var(--color-muted)',
            cursor: 'pointer', userSelect: 'none',
          }}>
            <input
              type="checkbox"
              checked={!visitable}
              onChange={e => {
                setVisitable(!e.target.checked)
                if (!e.target.checked) setPresenceType('permanent')
              }}
              style={{ margin: 0, accentColor: '#7C3AED' }}
            />
            Non-visitable
          </label>
          {vertical === 'craft' && (
            <label style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 500,
              color: offersClasses ? '#C1603A' : 'var(--color-muted)',
              cursor: 'pointer', userSelect: 'none',
            }}>
              <input
                type="checkbox"
                checked={offersClasses}
                onChange={e => setOffersClasses(e.target.checked)}
                style={{ margin: 0, accentColor: '#C1603A' }}
              />
              Classes
            </label>
          )}
          {!visitable && (
            <select
              value={presenceType}
              onChange={e => setPresenceType(e.target.value)}
              style={{
                fontFamily: 'var(--font-body)', fontSize: 10,
                padding: '2px 4px', borderRadius: 4,
                border: '1px solid var(--color-border)',
                background: 'white',
              }}
            >
              <option value="by_appointment">By appointment</option>
              <option value="markets">Markets</option>
              <option value="online">Online only</option>
              <option value="seasonal">Seasonal</option>
              <option value="mobile">Mobile</option>
            </select>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button data-action="approve" onClick={() => handleAction('approve')} disabled={buttonsDisabled || noSubcategory || !isWayPanelValid}
            title={noSubcategory ? 'Select a subcategory before publishing' : !isWayPanelValid ? 'Complete required Way Atlas editorial classification before approving.' : 'Approve (Y or Right Arrow)'}
            style={{
              height: 36, padding: '0 16px', borderRadius: 8,
              background: (noSubcategory || !isWayPanelValid) ? '#a0b8ae' : status === 'approving' ? '#3a6a49' : '#4A7C59',
              border: 'none', cursor: (buttonsDisabled || noSubcategory || !isWayPanelValid) ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'all 0.15s',
              boxShadow: (noSubcategory || !isWayPanelValid) ? 'none' : '0 1px 3px rgba(74,124,89,0.3)',
              opacity: (buttonsDisabled && status !== 'approving') ? 0.5 : 1,
              fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
              color: '#fff', letterSpacing: '0.02em',
            }}
            onMouseEnter={e => {
              if (vertical === 'way' && !isWayPanelValid) setWayFormTouched(true)
              if (!buttonsDisabled) e.currentTarget.style.transform = 'translateY(-1px)'
            }}
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
              {/* Editable address / suburb / region — writes to
                  listings.address, listings.suburb, listings.region_override_id
                  on publish. Address blur triggers geocode + spatial region
                  lookup; region dropdown auto-fills from the result. */}
              <div style={{
                marginTop: 8, padding: 12, borderRadius: 4,
                background: 'var(--color-cream, #f8f5ef)', border: '1px solid var(--color-border)',
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 8 }}>
                  <label style={{ display: 'block' }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                      textTransform: 'uppercase', color: 'var(--color-muted)',
                      fontFamily: 'var(--font-body)', display: 'block', marginBottom: 4,
                    }}>Address</span>
                    <input
                      type="text"
                      value={editAddress}
                      onChange={e => setEditAddress(e.target.value)}
                      onBlur={scheduleGeocode}
                      placeholder="123 Main St"
                      style={{
                        width: '100%', padding: '8px 10px', fontSize: 13,
                        fontFamily: 'var(--font-body)', color: 'var(--color-ink)',
                        background: '#fff', border: '1px solid var(--color-border)', borderRadius: 3,
                      }}
                    />
                  </label>
                  <label style={{ display: 'block' }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                      textTransform: 'uppercase', color: 'var(--color-muted)',
                      fontFamily: 'var(--font-body)', display: 'block', marginBottom: 4,
                    }}>Suburb</span>
                    <input
                      type="text"
                      value={editSuburb}
                      onChange={e => setEditSuburb(e.target.value)}
                      onBlur={scheduleGeocode}
                      placeholder="Suburb"
                      style={{
                        width: '100%', padding: '8px 10px', fontSize: 13,
                        fontFamily: 'var(--font-body)', color: 'var(--color-ink)',
                        background: '#fff', border: '1px solid var(--color-border)', borderRadius: 3,
                      }}
                    />
                  </label>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <label style={{ display: 'block', flex: 1 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                      textTransform: 'uppercase', color: 'var(--color-muted)',
                      fontFamily: 'var(--font-body)', display: 'block', marginBottom: 4,
                    }}>Region</span>
                    <select
                      value={editRegionId || ''}
                      disabled={geocodeStatus === 'pending'}
                      onChange={e => {
                        setEditRegionId(e.target.value || null)
                        setGeocodeStatus(prev => prev === 'auto_filled' ? 'manual' : prev)
                      }}
                      style={{
                        width: '100%', padding: '8px 10px', fontSize: 13,
                        fontFamily: 'var(--font-body)',
                        color: geocodeStatus === 'pending' ? 'var(--color-muted)' : 'var(--color-ink)',
                        background: '#fff', border: '1px solid var(--color-border)', borderRadius: 3,
                      }}
                    >
                      <option value="">
                        {geocodeStatus === 'pending' ? 'Detecting region…' : 'Select region…'}
                      </option>
                      {regions.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.name}{r.state ? ` (${r.state})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  {displayState && (
                    <span style={{
                      display: 'inline-block', padding: '6px 8px', alignSelf: 'flex-end',
                      background: '#fff', border: '1px solid var(--color-border)',
                      borderRadius: 3, fontSize: 10, fontWeight: 700,
                      letterSpacing: '0.1em', color: 'var(--color-ink)',
                      fontFamily: 'var(--font-body)', flexShrink: 0,
                      marginBottom: 0,
                    }}>
                      {displayState}
                    </span>
                  )}
                </div>
                {/* Status flags — surface non-success geocode states inline */}
                {geocodeStatus === 'pending' && (
                  <div style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>
                    Detecting region…
                  </div>
                )}
                {geocodeStatus === 'failed' && (
                  <div style={{ fontSize: 11, color: '#a73838', fontFamily: 'var(--font-body)' }}>
                    Geocoding failed — Mapbox returned no result. Address and region kept as entered.
                  </div>
                )}
                {geocodeStatus === 'no_region' && (
                  <div style={{ fontSize: 11, color: '#7A5520', fontFamily: 'var(--font-body)' }}>
                    Region not auto-detected — please select manually.
                  </div>
                )}
                {geocodeStatus === 'auto_filled' && (
                  <div style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>
                    Region auto-detected from address. Override above if incorrect.
                  </div>
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

        {/* ── Way Atlas Editorial Classification ────────────── */}
        {vertical === 'way' && (
          <div style={{
            marginBottom: 28, padding: '24px 24px 20px', borderRadius: 6,
            background: '#faf8f4', border: '1px solid var(--color-border)',
          }}>
            {/* Section header */}
            <div style={{ marginBottom: 22 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: '#6B7A4A',
                fontFamily: 'var(--font-body)', marginBottom: 4,
              }}>
                Way Atlas — Editorial Classification
              </div>
              <div style={{
                fontSize: 12, color: 'var(--color-muted)',
                fontFamily: 'var(--font-body)', lineHeight: 1.5,
              }}>
                Editorial classification required for Way listings. Fields marked <span style={{ color: '#a73838', fontWeight: 600 }}>*</span> block approval if empty.
              </div>
            </div>

            {/* ── 1. Operator Type ──────────────────────────────── */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block' }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                  textTransform: 'uppercase', color: 'var(--color-muted)',
                  fontFamily: 'var(--font-body)', display: 'block', marginBottom: 4,
                }}>
                  Operator type <span style={{ color: '#a73838' }}>*</span>
                </span>
                <select
                  value={wayOperatorType}
                  onChange={e => { setWayOperatorType(e.target.value); setWayFormTouched(true) }}
                  style={{
                    width: '100%', padding: '8px 10px', fontSize: 13,
                    fontFamily: 'var(--font-body)', color: wayOperatorType ? 'var(--color-ink)' : 'var(--color-muted)',
                    background: '#fff', border: '1px solid var(--color-border)', borderRadius: 3,
                  }}
                >
                  <option value="">Select operator type…</option>
                  {WAY_OPERATOR_TYPE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <div style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', marginTop: 4, lineHeight: 1.4 }}>
                Ownership and cultural governance model. Determines whether Aboriginal community attribution and Gate 4 cultural authority verification are required.
              </div>
              {wayFormTouched && !wayOperatorType && (
                <div style={{ fontSize: 11, color: '#a73838', fontFamily: 'var(--font-body)', marginTop: 4 }}>
                  Operator type is required.
                </div>
              )}
            </div>

            {/* ── 2. Aboriginal Community (conditional) ─────────── */}
            {isAboriginalOperatorType(wayOperatorType) && (
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block' }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                    textTransform: 'uppercase', color: 'var(--color-muted)',
                    fontFamily: 'var(--font-body)', display: 'block', marginBottom: 4,
                  }}>
                    Aboriginal community <span style={{ color: '#a73838' }}>*</span>
                  </span>
                  <input
                    type="text"
                    value={wayAboriginalCommunity}
                    onChange={e => { setWayAboriginalCommunity(e.target.value); setWayFormTouched(true) }}
                    placeholder="e.g. Anangu, Yolngu, Noongar"
                    style={{
                      width: '100%', padding: '8px 10px', fontSize: 13,
                      fontFamily: 'var(--font-body)', color: 'var(--color-ink)',
                      background: '#fff', border: '1px solid var(--color-border)', borderRadius: 3,
                    }}
                  />
                </label>
                <div style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', marginTop: 4, lineHeight: 1.4 }}>
                  The specific Aboriginal community whose Country this experience operates on or who has authorised the experience.
                </div>
                {wayFormTouched && !wayAboriginalCommunity.trim() && (
                  <div style={{ fontSize: 11, color: '#a73838', fontFamily: 'var(--font-body)', marginTop: 4 }}>
                    Aboriginal community is required for Aboriginal-operated experiences.
                  </div>
                )}
              </div>
            )}

            {/* ── 3. Cultural Authority Block (conditional) ──────── */}
            {requiresCulturalAuthority(subcategory, wayOperatorType) && (
              <div style={{
                background: '#F5F0E8', border: '1px solid #8B7355',
                padding: '16px 20px', borderRadius: 6,
                marginBottom: 18, marginTop: 4,
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                  textTransform: 'uppercase', color: '#6B5535',
                  fontFamily: 'var(--font-body)', marginBottom: 10,
                }}>
                  Cultural Authority Verification
                </div>
                <div style={{ fontSize: 12, color: '#5A4A3A', fontFamily: 'var(--font-body)', lineHeight: 1.5, marginBottom: 14 }}>
                  Gate 4 requires documented cultural authority for all cultural tours and Aboriginal-operated experiences. This listing will not publish without verification.
                </div>

                {/* 3a. Verified checkbox */}
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  cursor: 'pointer', userSelect: 'none', marginBottom: 10,
                }}>
                  <input
                    type="checkbox"
                    checked={wayCulturalAuthorityVerified}
                    onChange={e => { setWayCulturalAuthorityVerified(e.target.checked); setWayFormTouched(true) }}
                    style={{ margin: 0, accentColor: '#8B7355', width: 16, height: 16 }}
                  />
                  <span style={{
                    fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
                    color: wayCulturalAuthorityVerified ? '#4A3A2A' : '#7A6A5A',
                  }}>
                    Cultural authority verified <span style={{ color: '#a73838' }}>*</span>
                  </span>
                </label>
                {wayFormTouched && !wayCulturalAuthorityVerified && (
                  <div style={{ fontSize: 11, color: '#a73838', fontFamily: 'var(--font-body)', marginBottom: 10 }}>
                    Cultural authority verification is required before this listing can be approved.
                  </div>
                )}

                {/* 3b. Notes textarea (conditional on 3a) */}
                {wayCulturalAuthorityVerified && (
                  <div style={{ marginTop: 6 }}>
                    <label style={{ display: 'block' }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                        textTransform: 'uppercase', color: '#6B5535',
                        fontFamily: 'var(--font-body)', display: 'block', marginBottom: 4,
                      }}>
                        Verification notes <span style={{ color: '#a73838' }}>*</span>
                      </span>
                      <textarea
                        value={wayCulturalAuthorityNotes}
                        onChange={e => { setWayCulturalAuthorityNotes(e.target.value); setWayFormTouched(true) }}
                        placeholder="e.g. Listed on NIAA registry, RAP sighted May 2026, community elder confirmed"
                        rows={3}
                        style={{
                          width: '100%', padding: '8px 10px', fontSize: 13,
                          fontFamily: 'var(--font-body)', color: '#4A3A2A',
                          background: '#FFFDF8', border: '1px solid #B8A888', borderRadius: 3,
                          resize: 'vertical', lineHeight: 1.5,
                        }}
                      />
                    </label>
                    <div style={{ fontSize: 11, color: '#6B5535', fontFamily: 'var(--font-body)', marginTop: 4, lineHeight: 1.4 }}>
                      Brief record of the verification source and date. This is an editorial audit trail, not a public field.
                    </div>
                    {wayFormTouched && !wayCulturalAuthorityNotes.trim() && (
                      <div style={{ fontSize: 11, color: '#a73838', fontFamily: 'var(--font-body)', marginTop: 4 }}>
                        Verification notes are required when cultural authority is confirmed.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Separator ──────────────────────────────────────── */}
            <div style={{ borderTop: '1px solid var(--color-border)', margin: '20px 0' }} />

            {/* ── 4. Accreditations ─────────────────────────────── */}
            <div style={{ marginBottom: 18 }}>
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: 'var(--color-muted)',
                fontFamily: 'var(--font-body)', display: 'block', marginBottom: 8,
              }}>
                Accreditations
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px 12px' }}>
                {WAY_ACCREDITATION_OPTIONS.map(o => (
                  <label key={o.value} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    cursor: 'pointer', userSelect: 'none',
                  }}>
                    <input
                      type="checkbox"
                      checked={wayAccreditations.includes(o.value)}
                      onChange={e => {
                        setWayFormTouched(true)
                        setWayAccreditations(prev =>
                          e.target.checked ? [...prev, o.value] : prev.filter(v => v !== o.value)
                        )
                      }}
                      style={{ margin: 0, accentColor: '#6B7A4A' }}
                    />
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-ink)' }}>
                      {o.label}
                    </span>
                  </label>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', marginTop: 6, lineHeight: 1.4 }}>
                Industry accreditations held by the operator. Multiple selections allowed.
              </div>
            </div>

            {/* ── Separator ──────────────────────────────────────── */}
            <div style={{ borderTop: '1px solid var(--color-border)', margin: '20px 0' }} />

            {/* ── 5. Operating Regions ──────────────────────────── */}
            <div style={{ marginBottom: 18 }}>
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: 'var(--color-muted)',
                fontFamily: 'var(--font-body)', display: 'block', marginBottom: 8,
              }}>
                Operating regions
              </span>

              {/* Primary region */}
              <div style={{ marginBottom: 12 }}>
                <span style={{
                  fontSize: 10, fontWeight: 600, color: 'var(--color-muted)',
                  fontFamily: 'var(--font-body)', display: 'block', marginBottom: 4,
                }}>
                  Primary region <span style={{ color: '#a73838' }}>*</span>
                </span>
                <select
                  value={wayPrimaryRegionId || ''}
                  onChange={e => { setWayPrimaryRegionId(e.target.value || null); setWayFormTouched(true) }}
                  style={{
                    width: '100%', padding: '8px 10px', fontSize: 13,
                    fontFamily: 'var(--font-body)',
                    color: wayPrimaryRegionId ? 'var(--color-ink)' : 'var(--color-muted)',
                    background: '#fff', border: '1px solid var(--color-border)', borderRadius: 3,
                  }}
                >
                  <option value="">Select primary region…</option>
                  {regions.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name}{r.state ? ` (${r.state})` : ''}
                    </option>
                  ))}
                </select>
                {wayFormTouched && !wayPrimaryRegionId && (
                  <div style={{ fontSize: 11, color: '#a73838', fontFamily: 'var(--font-body)', marginTop: 4 }}>
                    Primary operating region is required.
                  </div>
                )}
              </div>

              {/* Additional operating regions */}
              {wayPrimaryRegionId && (
                <div style={{ marginBottom: 8 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 600, color: 'var(--color-muted)',
                    fontFamily: 'var(--font-body)', display: 'block', marginBottom: 6,
                  }}>
                    Additional operating regions
                  </span>
                  <div style={{
                    maxHeight: 180, overflowY: 'auto', padding: '8px 10px',
                    background: '#fff', border: '1px solid var(--color-border)', borderRadius: 3,
                    display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px 12px',
                  }}>
                    {regions.filter(r => r.id !== wayPrimaryRegionId).map(r => (
                      <label key={r.id} style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        cursor: 'pointer', userSelect: 'none',
                      }}>
                        <input
                          type="checkbox"
                          checked={wayAdditionalRegionIds.includes(r.id)}
                          onChange={e => {
                            setWayFormTouched(true)
                            setWayAdditionalRegionIds(prev =>
                              e.target.checked ? [...prev, r.id] : prev.filter(id => id !== r.id)
                            )
                          }}
                          style={{ margin: 0, accentColor: '#6B7A4A', flexShrink: 0 }}
                        />
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-ink)' }}>
                          {r.name}{r.state ? ` (${r.state})` : ''}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', marginTop: 6, lineHeight: 1.4 }}>
                Mark one region as primary — where the operator is editorially most strongly associated. Add additional regions where experiences actually run. A scenic flight operator based in Adelaide Hills running flights over the Flinders Ranges has Adelaide Hills as primary and Flinders Ranges as additional.
              </div>
            </div>

            {/* ── 6. Departure Point ───────────────────────────── */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block' }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                  textTransform: 'uppercase', color: 'var(--color-muted)',
                  fontFamily: 'var(--font-body)', display: 'block', marginBottom: 4,
                }}>
                  Departure point name
                </span>
                <input
                  type="text"
                  value={wayDeparturePointName}
                  onChange={e => { setWayDeparturePointName(e.target.value); setWayFormTouched(true) }}
                  placeholder={editSuburb || 'Defaults to suburb if left empty'}
                  style={{
                    width: '100%', padding: '8px 10px', fontSize: 13,
                    fontFamily: 'var(--font-body)', color: 'var(--color-ink)',
                    background: '#fff', border: '1px solid var(--color-border)', borderRadius: 3,
                  }}
                />
              </label>
              <div style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', marginTop: 4, lineHeight: 1.4 }}>
                Where guests meet or depart from. Defaults to the listing suburb if left empty.
              </div>
            </div>

            {/* ── Separator ──────────────────────────────────────── */}
            <div style={{ borderTop: '1px solid var(--color-border)', margin: '20px 0' }} />

            {/* ── 7. Secondary Experience Types ─────────────────── */}
            <div style={{ marginBottom: 18 }}>
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: 'var(--color-muted)',
                fontFamily: 'var(--font-body)', display: 'block', marginBottom: 8,
              }}>
                Secondary experience types
              </span>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px 12px',
                maxHeight: 180, overflowY: 'auto', padding: '8px 10px',
                background: '#fff', border: '1px solid var(--color-border)', borderRadius: 3,
              }}>
                {WAY_PRIMARY_TYPE_OPTIONS.filter(o => o.value !== subcategory).map(o => (
                  <label key={o.value} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    cursor: 'pointer', userSelect: 'none',
                  }}>
                    <input
                      type="checkbox"
                      checked={waySecondaryTypes.includes(o.value)}
                      onChange={e => {
                        setWayFormTouched(true)
                        setWaySecondaryTypes(prev =>
                          e.target.checked ? [...prev, o.value] : prev.filter(v => v !== o.value)
                        )
                      }}
                      style={{ margin: 0, accentColor: '#6B7A4A', flexShrink: 0 }}
                    />
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-ink)' }}>
                      {o.label}
                    </span>
                  </label>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', marginTop: 6, lineHeight: 1.4 }}>
                Additional experience types this operator offers beyond the primary category. The primary type is set by the subcategory selector in the toolbar.
              </div>
            </div>

            {/* ── 8 + 12. Established Year + Operator Name ──────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 16, marginBottom: 18 }}>
              <div>
                <label style={{ display: 'block' }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                    textTransform: 'uppercase', color: 'var(--color-muted)',
                    fontFamily: 'var(--font-body)', display: 'block', marginBottom: 4,
                  }}>
                    Established year
                  </span>
                  <input
                    type="number"
                    value={wayEstablishedYear}
                    onChange={e => { setWayEstablishedYear(e.target.value); setWayFormTouched(true) }}
                    placeholder="e.g. 2003"
                    min="1800"
                    max={new Date().getFullYear()}
                    style={{
                      width: '100%', padding: '8px 10px', fontSize: 13,
                      fontFamily: 'var(--font-body)', color: 'var(--color-ink)',
                      background: '#fff', border: '1px solid var(--color-border)', borderRadius: 3,
                    }}
                  />
                </label>
                <div style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', marginTop: 4, lineHeight: 1.4 }}>
                  Year the operation was established, if known.
                </div>
              </div>
              <div>
                <label style={{ display: 'block' }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                    textTransform: 'uppercase', color: 'var(--color-muted)',
                    fontFamily: 'var(--font-body)', display: 'block', marginBottom: 4,
                  }}>
                    Operator name
                  </span>
                  <input
                    type="text"
                    value={wayOperatorName}
                    onChange={e => { setWayOperatorName(e.target.value); setWayFormTouched(true) }}
                    placeholder="Person or entity behind the operation"
                    style={{
                      width: '100%', padding: '8px 10px', fontSize: 13,
                      fontFamily: 'var(--font-body)', color: 'var(--color-ink)',
                      background: '#fff', border: '1px solid var(--color-border)', borderRadius: 3,
                    }}
                  />
                </label>
                <div style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', marginTop: 4, lineHeight: 1.4 }}>
                  The person or entity behind the operation, if distinct from the listing name.
                </div>
              </div>
            </div>

            {/* ── Separator ──────────────────────────────────────── */}
            <div style={{ borderTop: '1px solid var(--color-border)', margin: '20px 0' }} />

            {/* ── 9. Presence Type ──────────────────────────────── */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block' }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                  textTransform: 'uppercase', color: 'var(--color-muted)',
                  fontFamily: 'var(--font-body)', display: 'block', marginBottom: 4,
                }}>
                  Presence type <span style={{ color: '#a73838' }}>*</span>
                </span>
                <select
                  value={wayPresenceType}
                  onChange={e => { setWayPresenceType(e.target.value); setWayFormTouched(true) }}
                  style={{
                    width: '100%', padding: '8px 10px', fontSize: 13,
                    fontFamily: 'var(--font-body)', color: 'var(--color-ink)',
                    background: '#fff', border: '1px solid var(--color-border)', borderRadius: 3,
                  }}
                >
                  {WAY_PRESENCE_TYPE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <div style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', marginTop: 4, lineHeight: 1.4 }}>
                How and when this operator runs. Selecting &lsquo;Seasonal&rsquo; reveals a month selector.
              </div>
            </div>

            {/* ── 10. Operating Season Months (conditional) ──────── */}
            {wayPresenceType === 'seasonal' && (
              <div style={{ marginBottom: 18 }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                  textTransform: 'uppercase', color: 'var(--color-muted)',
                  fontFamily: 'var(--font-body)', display: 'block', marginBottom: 8,
                }}>
                  Operating months <span style={{ color: '#a73838' }}>*</span>
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px 12px' }}>
                  {MONTH_OPTIONS.map(o => (
                    <label key={o.value} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      cursor: 'pointer', userSelect: 'none',
                    }}>
                      <input
                        type="checkbox"
                        checked={wayOperatingSeasonMonths.includes(o.value)}
                        onChange={e => {
                          setWayFormTouched(true)
                          setWayOperatingSeasonMonths(prev =>
                            e.target.checked ? [...prev, o.value].sort((a, b) => a - b) : prev.filter(v => v !== o.value)
                          )
                        }}
                        style={{ margin: 0, accentColor: '#6B7A4A' }}
                      />
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-ink)' }}>
                        {o.label}
                      </span>
                    </label>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', marginTop: 6, lineHeight: 1.4 }}>
                  Months when this operator is active. Select all that apply.
                </div>
                {wayFormTouched && wayOperatingSeasonMonths.length === 0 && (
                  <div style={{ fontSize: 11, color: '#a73838', fontFamily: 'var(--font-body)', marginTop: 4 }}>
                    At least one operating month is required for seasonal operators.
                  </div>
                )}
              </div>
            )}

            {/* ── Separator ──────────────────────────────────────── */}
            <div style={{ borderTop: '1px solid var(--color-border)', margin: '20px 0' }} />

            {/* ── 11. Multiple Departure Points ─────────────────── */}
            <div style={{ marginBottom: 18 }}>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 8,
                cursor: 'pointer', userSelect: 'none',
              }}>
                <input
                  type="checkbox"
                  checked={wayMultipleDeparturePoints}
                  onChange={e => { setWayMultipleDeparturePoints(e.target.checked); setWayFormTouched(true) }}
                  style={{ margin: 0, accentColor: '#6B7A4A', width: 15, height: 15 }}
                />
                <span style={{
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
                  color: 'var(--color-ink)',
                }}>
                  Multiple departure points
                </span>
              </label>
              <div style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', marginTop: 4, lineHeight: 1.4, paddingLeft: 23 }}>
                Check if this operator departs from more than one location. The primary departure point is captured above.
              </div>
            </div>
          </div>
        )}

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

function CompletionScreen({ approved, rejected, regions, vertical }) {
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

      {/* Per-vertical refill — when reviewing a single Atlas, refill it now
          instead of waiting for the overnight floor top-up. */}
      {vertical && vertical !== 'way' && (
        <RefillVerticalButton vertical={vertical} />
      )}

      {/* Next run note */}
      <p style={{
        fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 300,
        color: 'var(--color-muted)', opacity: 0.6,
        marginTop: 28, marginBottom: 0,
      }}>
        {vertical === 'way'
          ? 'Way refills via its own supervised discovery.'
          : 'Every Atlas is topped back up to 10 overnight — check back tomorrow.'}
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

// ─── Per-vertical refill ──────────────────────────────────
// Shown when the reviewer has worked one vertical's queue down to zero. Tops
// that single Atlas back up to the floor on demand (the daily cron does this
// automatically each morning, but this lets the reviewer refill immediately).

function RefillVerticalButton({ vertical }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const isWay = vertical === 'way'

  const handleRefill = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/admin/candidates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vertical }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg(data.error || 'Refill failed'); setBusy(false); return }
      const r = data.results?.[0]
      if (r?.status === 'needs_manual') { setMsg('Way is seeded via supervised discovery.'); setBusy(false); return }
      if (data.total_queued > 0) { window.location.reload(); return }
      setMsg(`No new ${VERTICAL_NAMES[vertical] || vertical} found right now (${data.duration_seconds}s)`)
      setBusy(false)
    } catch (err) {
      setMsg(err.message || 'Network error')
      setBusy(false)
    }
  }

  if (isWay) return null

  return (
    <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <button
        onClick={handleRefill}
        disabled={busy}
        style={{
          fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em',
          color: '#fff', background: busy ? '#3a6a49' : '#4A7C59',
          border: 'none', borderRadius: 8, padding: '10px 20px',
          cursor: busy ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 1px 3px rgba(74,124,89,0.3)',
        }}
      >
        {busy ? (
          <>
            <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'candidateSpinner 0.6s linear infinite' }} />
            Finding more…
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1V13M1 7H13" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Find 10 more in {VERTICAL_NAMES[vertical] || vertical}
          </>
        )}
      </button>
      {msg && (
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)' }}>{msg}</span>
      )}
    </div>
  )
}

// ─── Queue Container ──────────────────────────────────────

export default function CandidateReviewQueue({ initialCandidates = [], initialRejected = [], queueDepth = {}, mapboxToken, regions = [] }) {
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
  const handleCreated = useCallback((newCandidate) => {
    if (!newCandidate?.id) return
    // Prepend so the manually-added listing becomes the focused review card,
    // and switch the filter to its vertical so it's immediately visible.
    setCandidates(prev => [newCandidate, ...prev])
    setVerticalFilter(newCandidate.vertical || null)
    setDepth(prev => ({
      ...prev,
      [newCandidate.vertical]: (prev[newCandidate.vertical] || 0) + 1,
    }))
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

          {/* Drop a URL → auto-sort into a vertical */}
          <SuggestUrlPill onCreated={handleCreated} />

          {/* Manually add a listing the admin came across */}
          <AddListingForm onCreated={handleCreated} />

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
                  regions={regions}
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
              vertical={verticalFilter}
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
                  ? (verticalFilter === 'way'
                      ? 'Way is seeded via its own supervised discovery — it refills separately.'
                      : 'Refilled to 10 automatically each morning. Want more now? Find them below.')
                  : 'Refilled to a floor of 10 per Atlas each morning. Click Generate Now to populate immediately.'
                }
              </p>
              {verticalFilter && <RefillVerticalButton vertical={verticalFilter} />}
            </div>
          )}
        </>
      )}
    </div>
  )
}
