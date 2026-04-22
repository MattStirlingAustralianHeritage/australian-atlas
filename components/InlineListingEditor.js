'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

// ── Vertical-specific field definitions ─────────────────────
// Must match CHECK constraints in DB and the admin ListingEditor exactly.

const VERTICAL_NAMES = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

const VERTICAL_FIELDS = {
  sba: [
    { key: 'producer_type', label: 'Producer Type', type: 'select', options: [
      { value: 'brewery', label: 'Brewery' }, { value: 'winery', label: 'Winery' },
      { value: 'distillery', label: 'Distillery' }, { value: 'cidery', label: 'Cidery' },
      { value: 'meadery', label: 'Meadery' }, { value: 'cellar_door', label: 'Cellar Door' },
      { value: 'sour_brewery', label: 'Sour Brewery' }, { value: 'non_alcoholic', label: 'Non-Alcoholic' },
    ]},
    { key: 'has_tasting_room', label: 'Tasting Room', type: 'toggle' },
    { key: 'has_tours', label: 'Tours Available', type: 'toggle' },
  ],
  collection: [
    { key: 'institution_type', label: 'Institution Type', type: 'select', options: [
      { value: 'museum', label: 'Museum' }, { value: 'gallery', label: 'Gallery' },
      { value: 'heritage_site', label: 'Heritage Site' }, { value: 'cultural_centre', label: 'Cultural Centre' },
      { value: 'botanical_garden', label: 'Botanical Garden' }, { value: 'sculpture_park', label: 'Sculpture Park' },
    ]},
    { key: 'is_free_admission', label: 'Free Admission', type: 'toggle' },
  ],
  craft: [
    { key: 'discipline', label: 'Discipline', type: 'select', options: [
      { value: 'ceramics_clay', label: 'Ceramics & Clay' }, { value: 'visual_art', label: 'Visual Art' },
      { value: 'jewellery_metalwork', label: 'Jewellery & Metalwork' }, { value: 'textile_fibre', label: 'Textile & Fibre' },
      { value: 'wood_furniture', label: 'Wood & Furniture' }, { value: 'glass', label: 'Glass' },
      { value: 'printmaking', label: 'Printmaking' },
    ]},
    { key: 'commission_available', label: 'Commission Available', type: 'toggle' },
    { key: 'is_open_to_public', label: 'Studio Visits', type: 'toggle' },
  ],
  fine_grounds: [
    { key: 'entity_type', label: 'Venue Type', type: 'select', options: [
      { value: 'roaster', label: 'Roaster' }, { value: 'cafe', label: 'Cafe' },
    ]},
    { key: 'has_tasting_room', label: 'Espresso Bar', type: 'toggle' },
  ],
  rest: [
    { key: 'accommodation_type', label: 'Accommodation Type', type: 'select', options: [
      { value: 'boutique_hotel', label: 'Boutique Hotel' }, { value: 'farm_stay', label: 'Farm Stay' },
      { value: 'glamping', label: 'Glamping' }, { value: 'self_contained', label: 'Self-Contained' },
      { value: 'bnb', label: 'B&B' }, { value: 'guesthouse', label: 'Guesthouse' },
      { value: 'cottage', label: 'Cottage' }, { value: 'eco_resort', label: 'Eco Resort' },
    ]},
    { key: 'min_price_per_night', label: 'Min Price/Night ($)', type: 'number' },
    { key: 'pet_friendly', label: 'Pet Friendly', type: 'toggle' },
  ],
  field: [
    { key: 'feature_type', label: 'Place Type', type: 'select', options: [
      { value: 'swimming_hole', label: 'Swimming Hole' }, { value: 'waterfall', label: 'Waterfall' },
      { value: 'lookout', label: 'Lookout' }, { value: 'gorge', label: 'Gorge' },
      { value: 'coastal_walk', label: 'Coastal Walk' }, { value: 'hot_spring', label: 'Hot Spring' },
      { value: 'cave', label: 'Cave' }, { value: 'national_park', label: 'National Park' },
      { value: 'bush_walk', label: 'Bush Walk' }, { value: 'wildlife_zoo', label: 'Wildlife & Zoo' },
      { value: 'botanic_garden', label: 'Botanic Garden' }, { value: 'nature_reserve', label: 'Nature Reserve' },
    ]},
    { key: 'dogs_allowed', label: 'Dog Friendly', type: 'toggle' },
    { key: 'is_entry_free', label: 'Free Entry', type: 'toggle' },
    { key: 'swimming', label: 'Swimming', type: 'toggle' },
  ],
  found: [
    { key: 'shop_type', label: 'Shop Type', type: 'select', options: [
      { value: 'vintage_clothing', label: 'Vintage Clothing' }, { value: 'vintage_furniture', label: 'Vintage Furniture' },
      { value: 'vintage_store', label: 'Vintage Store' }, { value: 'antiques', label: 'Antiques' },
      { value: 'op_shop', label: 'Op Shop' }, { value: 'books_ephemera', label: 'Books & Ephemera' },
      { value: 'art_objects', label: 'Art & Objects' }, { value: 'market', label: 'Market' },
    ]},
  ],
  corner: [
    { key: 'shop_type', label: 'Shop Type', type: 'select', options: [
      { value: 'bookshop', label: 'Bookshop' }, { value: 'records', label: 'Records' },
      { value: 'homewares', label: 'Homewares' }, { value: 'stationery', label: 'Stationery' },
      { value: 'jewellery', label: 'Jewellery' }, { value: 'toys', label: 'Toys' },
      { value: 'general', label: 'General' }, { value: 'clothing', label: 'Clothing' },
      { value: 'food_drink', label: 'Food & Drink' }, { value: 'plants', label: 'Plants' },
      { value: 'other', label: 'Other' },
    ]},
    { key: 'has_online_store', label: 'Online Store', type: 'toggle' },
  ],
  table: [
    { key: 'food_type', label: 'Food Type', type: 'select', options: [
      { value: 'restaurant', label: 'Restaurant' }, { value: 'cafe', label: 'Cafe' },
      { value: 'bakery', label: 'Bakery' }, { value: 'market', label: 'Market' },
      { value: 'farm_gate', label: 'Farm Gate' }, { value: 'artisan_producer', label: 'Artisan Producer' },
      { value: 'specialty_retail', label: 'Specialty Retail' }, { value: 'destination', label: 'Destination' },
      { value: 'cooking_school', label: 'Cooking School' }, { value: 'providore', label: 'Providore' },
      { value: 'food_trail', label: 'Food Trail' },
    ]},
    { key: 'cafe_on_site', label: 'Cafe On Site', type: 'toggle' },
  ],
}

const STATES = ['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']

// ── Field components ────────────────────────────────────────

function PanelField({ label, value, onChange, type = 'text', options, multiline }) {
  const baseInput = {
    fontFamily: 'var(--font-body, system-ui)', fontSize: 13, color: 'var(--color-ink)',
    border: '1px solid var(--color-border, #e0dcd4)', borderRadius: 6,
    padding: '8px 10px', background: '#fff', outline: 'none',
    width: '100%', boxSizing: 'border-box',
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        display: 'block', fontFamily: 'var(--font-body, system-ui)', fontSize: 10,
        fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--color-muted, #6B6760)', marginBottom: 5,
      }}>{label}</label>
      {options ? (
        <select value={value || ''} onChange={e => onChange(e.target.value || null)}
          style={{ ...baseInput, cursor: 'pointer' }}>
          <option value="">—</option>
          {options.map(o => typeof o === 'string'
            ? <option key={o} value={o}>{o}</option>
            : <option key={o.value} value={o.value}>{o.label}</option>
          )}
        </select>
      ) : multiline ? (
        <textarea value={value || ''} onChange={e => onChange(e.target.value)}
          rows={6} style={{ ...baseInput, resize: 'vertical', minHeight: 120, lineHeight: 1.6 }} />
      ) : type === 'number' ? (
        <input type="number" value={value ?? ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
          style={baseInput} />
      ) : (
        <input type="text" value={value || ''} onChange={e => onChange(e.target.value)}
          style={baseInput} />
      )}
    </div>
  )
}

function PanelToggle({ label, value, onChange }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
      fontFamily: 'var(--font-body, system-ui)', fontSize: 12, color: 'var(--color-ink)',
      marginBottom: 8,
    }}>
      <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)}
        style={{ width: 16, height: 16, accentColor: 'var(--color-sage, #5F8A7E)' }} />
      {label}
    </label>
  )
}

// ── Identify which field key is the "category" field for each vertical ──
const VERTICAL_CATEGORY_KEY = {
  sba: 'producer_type',
  collection: 'institution_type',
  craft: 'discipline',
  fine_grounds: 'entity_type',
  rest: 'accommodation_type',
  field: 'feature_type',
  corner: 'shop_type',
  found: 'shop_type',
  table: 'food_type',
}

// ── Subcategory multi-select with primary/secondary ordering ──
function SubcategoryPicker({ label, options, selected, onChange }) {
  // selected = array of values, first = primary
  const selectedArr = Array.isArray(selected) ? selected : (selected ? [selected] : [])

  const addItem = (value) => {
    if (!value || selectedArr.includes(value)) return
    onChange([...selectedArr, value])
  }

  const removeItem = (index) => {
    const next = [...selectedArr]
    next.splice(index, 1)
    onChange(next)
  }

  const moveUp = (index) => {
    if (index <= 0) return
    const next = [...selectedArr]
    ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
    onChange(next)
  }

  const moveDown = (index) => {
    if (index >= selectedArr.length - 1) return
    const next = [...selectedArr]
    ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
    onChange(next)
  }

  const getLabel = (val) => {
    const opt = options.find(o => (typeof o === 'string' ? o : o.value) === val)
    if (!opt) return val.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    return typeof opt === 'string' ? opt : opt.label
  }

  // Options not yet selected
  const availableOptions = options.filter(o => {
    const val = typeof o === 'string' ? o : o.value
    return !selectedArr.includes(val)
  })

  const chipBase = {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontFamily: 'var(--font-body, system-ui)', fontSize: 11,
    padding: '4px 8px', borderRadius: 6, cursor: 'default',
    lineHeight: 1.3,
  }

  const arrowBtn = {
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '0 2px', fontSize: 12, lineHeight: 1,
    color: 'inherit', opacity: 0.6,
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        display: 'block', fontFamily: 'var(--font-body, system-ui)', fontSize: 10,
        fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--color-muted, #6B6760)', marginBottom: 5,
      }}>{label}</label>

      {/* Selected items with ordering controls */}
      {selectedArr.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {selectedArr.map((val, i) => (
            <span key={val} style={{
              ...chipBase,
              background: i === 0 ? 'var(--color-ink, #2D2A26)' : 'var(--color-cream, #FAF8F5)',
              color: i === 0 ? '#fff' : 'var(--color-ink, #2D2A26)',
              border: i === 0 ? 'none' : '1px solid var(--color-border, #e0dcd4)',
              fontWeight: i === 0 ? 600 : 400,
            }}>
              <span style={{
                fontSize: 8, fontWeight: 700, letterSpacing: '0.06em',
                textTransform: 'uppercase', opacity: 0.7, marginRight: 2,
              }}>
                {i === 0 ? 'PRIMARY' : `#${i + 1}`}
              </span>
              {getLabel(val)}
              {selectedArr.length > 1 && (
                <>
                  <button onClick={() => moveUp(i)} disabled={i === 0}
                    style={{ ...arrowBtn, opacity: i === 0 ? 0.2 : 0.6 }} title="Move up"
                  >&#9650;</button>
                  <button onClick={() => moveDown(i)} disabled={i === selectedArr.length - 1}
                    style={{ ...arrowBtn, opacity: i === selectedArr.length - 1 ? 0.2 : 0.6 }} title="Move down"
                  >&#9660;</button>
                </>
              )}
              <button onClick={() => removeItem(i)}
                style={{ ...arrowBtn, fontSize: 14, opacity: 0.5 }} title="Remove"
              >&#10005;</button>
            </span>
          ))}
        </div>
      )}

      {/* Dropdown to add more subcategories */}
      {availableOptions.length > 0 && (
        <select
          value=""
          onChange={e => { if (e.target.value) addItem(e.target.value) }}
          style={{
            fontFamily: 'var(--font-body, system-ui)', fontSize: 13,
            color: 'var(--color-ink)',
            border: '1px solid var(--color-border, #e0dcd4)', borderRadius: 6,
            padding: '8px 10px', background: '#fff', outline: 'none',
            width: '100%', boxSizing: 'border-box', cursor: 'pointer',
          }}
        >
          <option value="">{selectedArr.length === 0 ? 'Select primary subcategory...' : 'Add secondary subcategory...'}</option>
          {availableOptions.map(o => {
            const val = typeof o === 'string' ? o : o.value
            const lab = typeof o === 'string' ? o : o.label
            return <option key={val} value={val}>{lab}</option>
          })}
        </select>
      )}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────
// IMPORTANT: This component is ONLY rendered when the server-side
// admin check passes in the listing page. It never reaches the DOM
// for non-admin users — there is nothing to toggle or tamper with.

export default function InlineListingEditor({ listing }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(null)
  const [metaDraft, setMetaDraft] = useState({})
  const [subTypes, setSubTypes] = useState([])
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState(null) // 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState(null)
  const panelRef = useRef(null)

  const openPanel = useCallback(() => {
    setDraft({
      name: listing.name || '',
      description: listing.description || '',
      address: listing.address || '',
      website: listing.website || '',
      phone: listing.phone || '',
      region: listing.region || '',
      state: listing.state || '',
      status: listing.status || 'active',
      vertical: listing.vertical || '',
      lat: listing.lat ?? '',
      lng: listing.lng ?? '',
      is_featured: listing.is_featured || false,
      editors_pick: listing.editors_pick || false,
      address_on_request: listing.address_on_request || false,
    })
    setMetaDraft(listing.meta || {})
    // Initialize sub_types from listing data — prefer sub_types array, fall back to sub_type scalar
    const initialSubTypes = Array.isArray(listing.sub_types) && listing.sub_types.length > 0
      ? listing.sub_types
      : (listing.sub_type ? [listing.sub_type] : [])
    setSubTypes(initialSubTypes)
    setOpen(true)
    setSaveResult(null)
    setErrorMsg(null)
  }, [listing])

  const closePanel = useCallback(() => {
    setOpen(false)
    setDraft(null)
    setMetaDraft({})
    setSubTypes([])
    setSaveResult(null)
    setErrorMsg(null)
  }, [])

  const updateField = useCallback((field, value) => {
    setDraft(prev => ({ ...prev, [field]: value }))
  }, [])

  const updateMeta = useCallback((key, value) => {
    setMetaDraft(prev => ({ ...prev, [key]: value }))
  }, [])

  // Save — uses the same PATCH endpoint as the admin ListingEditor
  const handleSave = useCallback(async () => {
    if (!draft || saving) return
    setSaving(true)
    setErrorMsg(null)
    try {
      const payload = { ...draft }
      // Attach meta fields if any were changed
      const metaFields = VERTICAL_FIELDS[draft.vertical || listing.vertical]
      if (metaFields && Object.keys(metaDraft).length > 0) {
        payload._meta = { ...metaDraft }
      }

      // Sync sub_types array to payload — the primary (index 0) also gets
      // written to the vertical's category meta key so the API can sync it
      if (subTypes.length > 0) {
        payload._sub_types = subTypes
        const vertical = draft.vertical || listing.vertical
        const categoryKey = VERTICAL_CATEGORY_KEY[vertical]
        if (categoryKey) {
          // Ensure meta payload includes the primary subcategory
          if (!payload._meta) payload._meta = {}
          payload._meta[categoryKey] = subTypes[0]
        }
      } else {
        payload._sub_types = []
      }

      // Use AbortController with 15s timeout to prevent hanging requests
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)

      let res
      try {
        res = await fetch(`/api/admin/listings/${listing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeout)
      }

      let data
      try {
        data = await res.json()
      } catch {
        // Response wasn't valid JSON
        setErrorMsg(`Server returned ${res.status} ${res.statusText}`)
        setSaveResult('error')
        setSaving(false)
        return
      }

      if (!res.ok) {
        setErrorMsg(data.error || `Save failed (${res.status})`)
        setSaveResult('error')
        setSaving(false)
        return
      }

      setSaveResult('success')
      setSaving(false)

      // Refresh the page data (ISR revalidation) without a full reload
      router.refresh()

      // Show "Saved" for 2 seconds then reset
      setTimeout(() => {
        setSaveResult(null)
      }, 2000)
    } catch (err) {
      if (err.name === 'AbortError') {
        setErrorMsg('Request timed out — the server took too long to respond. Try again.')
      } else if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
        setErrorMsg('Network error — check your connection and try again.')
      } else {
        setErrorMsg(err.message || 'Unexpected error')
      }
      setSaveResult('error')
      setSaving(false)
    }
  }, [draft, metaDraft, subTypes, saving, listing.id, listing.vertical, router])

  // Escape key closes panel
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') closePanel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, closePanel])

  // Click outside panel closes it
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        closePanel()
      }
    }
    // Delay to avoid the open-button click triggering immediate close
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 100)
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler) }
  }, [open, closePanel])

  const verticalFields = VERTICAL_FIELDS[draft?.vertical || listing.vertical] || []

  return (
    <>
      {/* ── Floating edit button ── */}
      {!open && (
        <button
          onClick={openPanel}
          aria-label="Edit listing"
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 18px', borderRadius: 10,
            border: 'none', cursor: 'pointer',
            background: 'var(--color-ink, #2D2A26)', color: '#fff',
            fontFamily: 'var(--font-body, system-ui)',
            fontSize: 13, fontWeight: 600, letterSpacing: '0.02em',
            boxShadow: '0 2px 16px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.06)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(0,0,0,0.25)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 16px rgba(0,0,0,0.2)' }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M10.5 1.5L12.5 3.5L4.5 11.5L1.5 12.5L2.5 9.5L10.5 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Edit listing
        </button>
      )}

      {/* ── Saved confirmation (replaces button briefly) ── */}
      {!open && saveResult === 'success' && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 18px', borderRadius: 10,
          background: '#2e7d32', color: '#fff',
          fontFamily: 'var(--font-body, system-ui)',
          fontSize: 13, fontWeight: 600,
          boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
          pointerEvents: 'none',
        }}>
          Saved &#10003;
        </div>
      )}

      {/* ── Slide-in panel (from right) ── */}
      {open && draft && (
        <>
          {/* Scrim */}
          <div style={{
            position: 'fixed', inset: 0, zIndex: 9998,
            background: 'rgba(0,0,0,0.25)',
            transition: 'opacity 0.2s',
          }} />

          {/* Panel */}
          <div
            ref={panelRef}
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0, width: 420,
              maxWidth: '100vw', zIndex: 9999,
              background: '#fff',
              borderLeft: '1px solid var(--color-border, #e0dcd4)',
              boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
              display: 'flex', flexDirection: 'column',
              animation: 'inlineEditorSlideIn 0.2s ease-out',
            }}
          >
            {/* Panel header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px',
              borderBottom: '1px solid var(--color-border, #e0dcd4)',
              background: 'var(--color-cream, #FAF8F5)',
              flexShrink: 0,
            }}>
              <div>
                <div style={{
                  fontFamily: 'var(--font-body, system-ui)', fontSize: 14, fontWeight: 600,
                  color: 'var(--color-ink)', lineHeight: 1.3,
                }}>
                  Edit Listing
                </div>
                <div style={{
                  fontFamily: 'var(--font-body, system-ui)', fontSize: 11,
                  color: 'var(--color-muted, #6B6760)', marginTop: 2,
                }}>
                  {listing.name}
                </div>
              </div>
              <button onClick={closePanel} aria-label="Close" style={{
                width: 28, height: 28, borderRadius: 6, border: 'none',
                background: 'transparent', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--color-muted)', fontSize: 18,
              }}>
                &#10005;
              </button>
            </div>

            {/* Panel body — scrollable */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 100px' }}>
              {/* Core fields */}
              <div style={{
                fontFamily: 'var(--font-body, system-ui)', fontSize: 10, fontWeight: 600,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--color-muted)', marginBottom: 12,
              }}>
                Core Details
              </div>

              <PanelField label="Name" value={draft.name} onChange={v => updateField('name', v)} />
              <PanelField label="Description" value={draft.description} onChange={v => updateField('description', v)} multiline />
              <PanelField label="Address" value={draft.address} onChange={v => updateField('address', v)} />

              <div style={{ marginBottom: 16 }}>
                <PanelToggle label="Address on request" value={draft.address_on_request} onChange={v => updateField('address_on_request', v)} />
                <div style={{
                  fontFamily: 'var(--font-body, system-ui)', fontSize: 11,
                  color: 'var(--color-muted, #6B6760)', marginTop: -4, paddingLeft: 24,
                }}>
                  Hide street address publicly — show suburb/state only
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <PanelField label="Phone" value={draft.phone} onChange={v => updateField('phone', v)} />
                <PanelField label="Website" value={draft.website} onChange={v => updateField('website', v)} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <PanelField label="Region" value={draft.region} onChange={v => updateField('region', v)} />
                <PanelField label="State" value={draft.state}
                  onChange={v => updateField('state', v)}
                  options={STATES} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <PanelField label="Latitude" value={draft.lat} onChange={v => updateField('lat', v === '' ? null : Number(v))} type="number" />
                <PanelField label="Longitude" value={draft.lng} onChange={v => updateField('lng', v === '' ? null : Number(v))} type="number" />
              </div>

              {/* Status + vertical */}
              <div style={{
                fontFamily: 'var(--font-body, system-ui)', fontSize: 10, fontWeight: 600,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--color-muted)', marginTop: 20, marginBottom: 12,
                paddingTop: 16, borderTop: '1px solid var(--color-border, #e0dcd4)',
              }}>
                Classification
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <PanelField label="Status" value={draft.status}
                  onChange={v => updateField('status', v)}
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                    { value: 'pending', label: 'Pending' },
                    { value: 'hidden', label: 'Hidden' },
                  ]} />
                <PanelField label="Vertical" value={draft.vertical}
                  onChange={v => updateField('vertical', v)}
                  options={Object.entries(VERTICAL_NAMES).map(([k, label]) => ({ value: k, label }))} />
              </div>

              {/* Featured / Editor's Pick toggles */}
              <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
                <PanelToggle label="Featured" value={draft.is_featured} onChange={v => updateField('is_featured', v)} />
                <PanelToggle label="Editor's Pick" value={draft.editors_pick} onChange={v => updateField('editors_pick', v)} />
              </div>

              {/* Vertical-specific fields */}
              {verticalFields.length > 0 && (
                <>
                  <div style={{
                    fontFamily: 'var(--font-body, system-ui)', fontSize: 10, fontWeight: 600,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: 'var(--color-muted)', marginTop: 20, marginBottom: 12,
                    paddingTop: 16, borderTop: '1px solid var(--color-border, #e0dcd4)',
                  }}>
                    {VERTICAL_NAMES[draft.vertical || listing.vertical] || 'Vertical'} Fields
                  </div>

                  {verticalFields.map(field => {
                    const vertical = draft.vertical || listing.vertical
                    const categoryKey = VERTICAL_CATEGORY_KEY[vertical]

                    // Use SubcategoryPicker for the category field (multi-select with ordering)
                    if (field.type === 'select' && field.key === categoryKey) {
                      return (
                        <SubcategoryPicker
                          key={field.key}
                          label={field.label}
                          options={field.options}
                          selected={subTypes}
                          onChange={(newSubTypes) => {
                            setSubTypes(newSubTypes)
                            // Keep metaDraft in sync with the primary subcategory
                            if (newSubTypes.length > 0) {
                              updateMeta(field.key, newSubTypes[0])
                            } else {
                              updateMeta(field.key, null)
                            }
                          }}
                        />
                      )
                    }

                    if (field.type === 'toggle') {
                      return (
                        <PanelToggle
                          key={field.key}
                          label={field.label}
                          value={metaDraft[field.key]}
                          onChange={v => updateMeta(field.key, v)}
                        />
                      )
                    }
                    return (
                      <PanelField
                        key={field.key}
                        label={field.label}
                        value={metaDraft[field.key]}
                        onChange={v => updateMeta(field.key, v)}
                        type={field.type}
                        options={field.options}
                      />
                    )
                  })}
                </>
              )}
            </div>

            {/* Panel footer — sticky save */}
            <div style={{
              padding: '14px 20px',
              borderTop: '1px solid var(--color-border, #e0dcd4)',
              background: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <div style={{ fontSize: 12, fontFamily: 'var(--font-body, system-ui)' }}>
                {errorMsg && (
                  <span style={{ color: '#c62828' }}>{errorMsg}</span>
                )}
                {saveResult === 'success' && !errorMsg && (
                  <span style={{ color: '#2e7d32', fontWeight: 600 }}>Saved &#10003;</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={closePanel} style={{
                  padding: '8px 16px', borderRadius: 6,
                  border: '1px solid var(--color-border, #e0dcd4)', background: '#fff',
                  color: 'var(--color-ink)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  fontFamily: 'var(--font-body, system-ui)',
                }}>
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving} style={{
                  padding: '8px 20px', borderRadius: 6,
                  border: 'none', background: 'var(--color-ink, #2D2A26)',
                  color: '#fff', fontSize: 12, fontWeight: 600, cursor: saving ? 'wait' : 'pointer',
                  fontFamily: 'var(--font-body, system-ui)', letterSpacing: '0.02em',
                  opacity: saving ? 0.7 : 1,
                }}>
                  {saving ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </div>
          </div>

          {/* Slide-in animation */}
          <style>{`
            @keyframes inlineEditorSlideIn {
              from { transform: translateX(100%); }
              to { transform: translateX(0); }
            }
          `}</style>
        </>
      )}
    </>
  )
}
