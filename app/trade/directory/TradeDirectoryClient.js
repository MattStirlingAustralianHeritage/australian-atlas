'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT']
const VERTICALS = [
  { value: '', label: 'All ten atlases' },
  { value: 'sba', label: 'Small Batch (drinks)' },
  { value: 'fine_grounds', label: 'Fine Grounds (coffee)' },
  { value: 'table', label: 'Table (food)' },
  { value: 'craft', label: 'Craft (makers)' },
  { value: 'collection', label: 'Collection (culture)' },
  { value: 'corner', label: 'Corner (shops)' },
  { value: 'field', label: 'Field (farm gates)' },
  { value: 'found', label: 'Found (vintage)' },
  { value: 'rest', label: 'Rest (stays)' },
  { value: 'way', label: 'Way (experiences)' },
]

export default function TradeDirectoryClient() {
  const router = useRouter()

  // Filters
  const [q, setQ] = useState('')
  const [state, setState] = useState('')
  const [vertical, setVertical] = useState('')
  const [region, setRegion] = useState('')
  const [tradeOnly, setTradeOnly] = useState(
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('trade') === '1'
  )
  const [rates, setRates] = useState(false)
  const [coach, setCoach] = useState(false)
  const [famil, setFamil] = useState(false)
  const [groupMin, setGroupMin] = useState('')

  // Results
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(24)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Shortlist tray (session-scoped picks; saved to a named shortlist on demand)
  const [picks, setPicks] = useState([]) // [{id, name, region, state}]
  const pickIds = new Set(picks.map((p) => p.id))
  const [savingList, setSavingList] = useState(false)
  const [listMessage, setListMessage] = useState(null)

  const debounceRef = useRef(null)

  const load = useCallback(async (toPage = 1) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (state) params.set('state', state)
      if (vertical) params.set('vertical', vertical)
      if (region.trim()) params.set('region', region.trim())
      if (tradeOnly) params.set('trade', '1')
      if (rates) params.set('rates', '1')
      if (coach) params.set('coach', '1')
      if (famil) params.set('famil', '1')
      if (groupMin) params.set('group_min', groupMin)
      params.set('page', String(toPage))
      const res = await fetch(`/api/trade/directory?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Directory failed')
      setItems(data.items || [])
      setTotal(data.total || 0)
      setPage(data.page || toPage)
      setPageSize(data.pageSize || 24)
    } catch (err) {
      setError(err.message)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [q, state, vertical, region, tradeOnly, rates, coach, famil, groupMin])

  // Load on mount + debounce filter changes.
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load(1), 350)
    return () => clearTimeout(debounceRef.current)
  }, [load])

  function togglePick(item) {
    setPicks((prev) =>
      prev.some((p) => p.id === item.id)
        ? prev.filter((p) => p.id !== item.id)
        : [
            ...prev,
            // Full card meta so the builder can render stops without a refetch.
            {
              id: item.id, name: item.name, vertical_label: item.vertical_label,
              sub_type: item.sub_type, region: item.region, state: item.state,
              suburb: item.suburb, lat: item.lat, lng: item.lng,
              trade_ready: item.trade_ready, trade: item.trade,
            },
          ]
    )
  }

  async function saveShortlist() {
    if (picks.length === 0) return
    const name = window.prompt('Name this shortlist', `${region.trim() || state || 'Atlas'} picks`)
    if (!name) return
    setSavingList(true)
    setListMessage(null)
    try {
      const res = await fetch('/api/trade/shortlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, listing_ids: picks.map((p) => p.id) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save')
      setListMessage(`Saved “${name}” · ${picks.length} venues`)
      setPicks([])
    } catch (err) {
      setListMessage(err.message)
    } finally {
      setSavingList(false)
    }
  }

  function openInBuilder() {
    if (picks.length === 0) return
    // Hand the picks to the builder via sessionStorage (no URL length limits).
    sessionStorage.setItem('atlas-trade-picks', JSON.stringify(picks))
    router.push('/trade/builder?from=directory')
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '2rem 1.5rem 6rem' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'var(--color-ink)', margin: 0 }}>
        Product directory
      </h1>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 300, color: 'var(--color-muted)', margin: '8px 0 20px', maxWidth: 620, lineHeight: 1.6 }}>
        The whole curated network, filterable the way a product manager works. Gold-tagged venues have
        stated trade terms — open a fact sheet for capacity, notice, insurance and a trade contact.
      </p>

      {/* Filter bar */}
      <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 12, padding: 16, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names, towns, types…"
          style={{ ...inputStyle, flex: '2 1 220px' }}
        />
        <input
          value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Region (e.g. Yarra Valley)"
          style={{ ...inputStyle, flex: '1 1 170px' }}
        />
        <select value={state} onChange={(e) => setState(e.target.value)} style={{ ...inputStyle, flex: '0 1 110px' }}>
          <option value="">State</option>
          {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={vertical} onChange={(e) => setVertical(e.target.value)} style={{ ...inputStyle, flex: '1 1 180px' }}>
          {VERTICALS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
        </select>
        <input
          value={groupMin} onChange={(e) => setGroupMin(e.target.value.replace(/[^\d]/g, ''))}
          placeholder="Group of…" inputMode="numeric"
          style={{ ...inputStyle, flex: '0 1 110px' }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Chip on={tradeOnly} onClick={() => setTradeOnly(!tradeOnly)} label="Trade-ready" />
          <Chip on={rates} onClick={() => setRates(!rates)} label="Trade rates" />
          <Chip on={coach} onClick={() => setCoach(!coach)} label="Coach access" />
          <Chip on={famil} onClick={() => setFamil(!famil)} label="Famil open" />
        </div>
      </div>

      {/* Result meta */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '18px 0 12px', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-muted)', margin: 0 }}>
          {loading ? 'Searching…' : `${total.toLocaleString()} venues`}
          {error && <span style={{ color: '#b3261e' }}> · {error}</span>}
        </p>
        {listMessage && (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-gold)', margin: 0, fontWeight: 600 }}>{listMessage}</p>
        )}
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14 }}>
        {items.map((item) => {
          const picked = pickIds.has(item.id)
          return (
            <div key={item.id} style={{ background: 'white', border: `1px solid ${item.trade_ready ? 'rgba(196,155,59,0.55)' : 'var(--color-border)'}`, borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {item.hero_image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.hero_image_url} alt="" loading="lazy" style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} />
              )}
              <div style={{ padding: 14, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: 15.5, color: 'var(--color-ink)', margin: 0, lineHeight: 1.3 }}>{item.name}</p>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--color-muted)', margin: '4px 0 0' }}>
                  {[item.vertical_label, item.sub_type, item.region || item.suburb, item.state].filter(Boolean).join(' · ')}
                </p>
                {item.trade_ready && (
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-gold)', margin: '7px 0 0' }}>
                    Trade-ready
                    {item.trade?.rates_available ? ' · rates' : ''}
                    {item.trade?.group ? ` · groups${item.trade.group_size_max ? ` ≤${item.trade.group_size_max}` : ''}` : ''}
                    {item.logistics?.coach_access ? ' · coach' : ''}
                    {item.logistics?.famil_open ? ' · famil' : ''}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 12, flexWrap: 'wrap' }}>
                  {item.trade_ready ? (
                    <Link href={`/trade/product/${item.slug}`} style={{ ...smallBtn, background: 'var(--color-gold)', border: 'none', color: 'var(--color-ink)', textDecoration: 'none' }}>
                      Fact sheet
                    </Link>
                  ) : (
                    <a href={item.url || '#'} target="_blank" rel="noopener noreferrer" style={{ ...smallBtn, textDecoration: 'none' }}>
                      View listing
                    </a>
                  )}
                  <button onClick={() => togglePick(item)} style={{ ...smallBtn, background: picked ? 'var(--color-ink)' : 'white', color: picked ? 'white' : 'var(--color-ink)' }}>
                    {picked ? '✓ Picked' : '+ Shortlist'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {!loading && items.length === 0 && !error && (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)', marginTop: 30 }}>
          Nothing matched those filters. Loosen one — trade-ready coverage is still growing.
        </p>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 26 }}>
          <button disabled={page <= 1 || loading} onClick={() => load(page - 1)} style={pageBtn(page <= 1)}>← Prev</button>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-muted)', alignSelf: 'center' }}>
            {page} / {totalPages}
          </span>
          <button disabled={page >= totalPages || loading} onClick={() => load(page + 1)} style={pageBtn(page >= totalPages)}>Next →</button>
        </div>
      )}

      {/* Shortlist tray */}
      {picks.length > 0 && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: 'var(--color-ink)', zIndex: 40 }}>
          <div style={{ maxWidth: 1080, margin: '0 auto', padding: '12px 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'white', margin: 0 }}>
              <strong>{picks.length}</strong> venue{picks.length === 1 ? '' : 's'} picked
              <span style={{ opacity: 0.65 }}> — {picks.slice(0, 3).map((p) => p.name).join(', ')}{picks.length > 3 ? '…' : ''}</span>
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={saveShortlist} disabled={savingList} style={{ ...trayBtn, background: 'transparent', border: '1px solid rgba(255,255,255,0.4)', color: 'white' }}>
                {savingList ? 'Saving…' : 'Save shortlist'}
              </button>
              <button onClick={openInBuilder} style={{ ...trayBtn, background: 'var(--color-gold)', border: 'none', color: 'var(--color-ink)' }}>
                Open in builder →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Chip({ on, onClick, label }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
      color: on ? 'var(--color-ink)' : 'var(--color-muted)',
      background: on ? 'rgba(196,155,59,0.2)' : 'white',
      border: on ? '1px solid var(--color-gold)' : '1px solid var(--color-border)',
      padding: '7px 13px', borderRadius: 99, cursor: 'pointer',
    }}>
      {label}
    </button>
  )
}

const inputStyle = {
  fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink)',
  padding: '9px 12px', borderRadius: 8, border: '1px solid var(--color-border)',
  background: 'white', boxSizing: 'border-box',
}
const smallBtn = {
  fontFamily: 'var(--font-body)', fontSize: 11.5, fontWeight: 600, color: 'var(--color-ink)',
  background: 'white', border: '1px solid var(--color-border)', padding: '6px 12px',
  borderRadius: 99, cursor: 'pointer', display: 'inline-block',
}
const trayBtn = {
  fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600,
  padding: '9px 18px', borderRadius: 99, cursor: 'pointer',
}
function pageBtn(disabled) {
  return {
    fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600,
    color: disabled ? 'var(--color-border)' : 'var(--color-ink)', background: 'white',
    border: '1px solid var(--color-border)', padding: '8px 16px', borderRadius: 99,
    cursor: disabled ? 'default' : 'pointer',
  }
}
