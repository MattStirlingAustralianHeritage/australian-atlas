'use client'
import { useState, useEffect, useCallback } from 'react'
import { getSupabase } from '@/lib/supabase/clients'

const supabase = getSupabase()

const VERTICALS = [
  { value: '', label: 'Mixed (no focus)' },
  { value: 'sba', label: 'Small Batch Atlas' },
  { value: 'collection', label: 'Culture Atlas' },
  { value: 'craft', label: 'Craft Atlas' },
  { value: 'fine_grounds', label: 'Fine Grounds Atlas' },
  { value: 'rest', label: 'Rest Atlas' },
  { value: 'field', label: 'Field Atlas' },
  { value: 'corner', label: 'Corner Atlas' },
  { value: 'found', label: 'Found Atlas' },
  { value: 'table', label: 'Table Atlas' },
]

// ── Shared inline styles matching Atlas admin pattern ──────────────
const styles = {
  page: {
    minHeight: '100vh',
    background: 'var(--color-cream, #FAF8F5)',
    padding: '3rem 1.5rem',
  },
  container: { maxWidth: '860px', margin: '0 auto' },
  heading: {
    fontFamily: 'var(--font-display, Georgia)',
    fontSize: '1.75rem',
    fontWeight: 600,
    color: 'var(--color-ink, #2D2A26)',
    margin: '0 0 0.25rem',
  },
  subtitle: {
    fontFamily: 'var(--font-body, system-ui)',
    fontSize: '0.9rem',
    color: 'var(--color-muted, #888)',
    margin: 0,
  },
  card: {
    background: '#fff',
    borderRadius: '12px',
    border: '1px solid var(--color-border, #e5e5e5)',
    padding: '1.25rem',
    marginBottom: '0.75rem',
  },
  btnPrimary: {
    padding: '0.6rem 1.25rem',
    borderRadius: '8px',
    border: 'none',
    background: 'var(--color-ink, #2D2A26)',
    color: '#fff',
    fontFamily: 'var(--font-body, system-ui)',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnSecondary: {
    padding: '0.45rem 0.9rem',
    borderRadius: '8px',
    border: '1px solid var(--color-border, #e5e5e5)',
    background: '#fff',
    fontFamily: 'var(--font-body, system-ui)',
    fontSize: '0.8rem',
    color: 'var(--color-muted, #888)',
    cursor: 'pointer',
  },
  btnDanger: {
    padding: '0.45rem 0.9rem',
    borderRadius: '8px',
    border: '1px solid #f5c6c6',
    background: '#fef2f2',
    fontFamily: 'var(--font-body, system-ui)',
    fontSize: '0.8rem',
    color: '#c53030',
    cursor: 'pointer',
  },
  btnGreen: {
    padding: '0.45rem 0.9rem',
    borderRadius: '8px',
    border: '1px solid #c6e9c6',
    background: '#f0fff4',
    fontFamily: 'var(--font-body, system-ui)',
    fontSize: '0.8rem',
    color: '#276749',
    cursor: 'pointer',
  },
  label: {
    display: 'block',
    fontFamily: 'var(--font-body, system-ui)',
    fontSize: '0.8rem',
    fontWeight: 500,
    color: 'var(--color-muted, #888)',
    marginBottom: '0.3rem',
  },
  input: {
    width: '100%',
    padding: '0.55rem 0.75rem',
    borderRadius: '8px',
    border: '1px solid var(--color-border, #e5e5e5)',
    fontFamily: 'var(--font-body, system-ui)',
    fontSize: '0.9rem',
    color: 'var(--color-ink, #2D2A26)',
    outline: 'none',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    padding: '0.55rem 0.75rem',
    borderRadius: '8px',
    border: '1px solid var(--color-border, #e5e5e5)',
    fontFamily: 'var(--font-body, system-ui)',
    fontSize: '0.9rem',
    color: 'var(--color-ink, #2D2A26)',
    outline: 'none',
    resize: 'vertical',
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    padding: '0.55rem 0.75rem',
    borderRadius: '8px',
    border: '1px solid var(--color-border, #e5e5e5)',
    fontFamily: 'var(--font-body, system-ui)',
    fontSize: '0.9rem',
    color: 'var(--color-ink, #2D2A26)',
    outline: 'none',
    background: '#fff',
    boxSizing: 'border-box',
  },
  badge: (published) => ({
    display: 'inline-block',
    padding: '0.15rem 0.5rem',
    borderRadius: '999px',
    fontSize: '0.7rem',
    fontWeight: 600,
    fontFamily: 'var(--font-body, system-ui)',
    background: published ? '#f0fff4' : '#f7f7f7',
    color: published ? '#276749' : '#888',
    marginLeft: '0.5rem',
  }),
  row: {
    display: 'flex',
    gap: '1rem',
    marginBottom: '1rem',
  },
  half: { flex: 1 },
  sectionTitle: {
    fontFamily: 'var(--font-display, Georgia)',
    fontSize: '1.1rem',
    fontWeight: 600,
    color: 'var(--color-ink, #2D2A26)',
    margin: '0 0 1rem',
  },
}

// ════════════════════════════════════════════════════════════════════
//  Main page
// ════════════════════════════════════════════════════════════════════
export default function AdminTrailsPage() {
  const [trails, setTrails] = useState([])
  const [view, setView] = useState('list')
  const [editingTrail, setEditingTrail] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchTrails = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('trails')
      .select('*, trail_stops(count)')
      .order('created_at', { ascending: false })
    setTrails(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchTrails() }, [fetchTrails])

  async function togglePublish(trail) {
    await supabase.from('trails').update({ published: !trail.published }).eq('id', trail.id)
    fetchTrails()
  }

  async function deleteTrail(id) {
    if (!confirm('Delete this trail and all its stops? This cannot be undone.')) return
    await supabase.from('trail_stops').delete().eq('trail_id', id)
    await supabase.from('trails').delete().eq('id', id)
    fetchTrails()
  }

  if (view === 'edit') {
    return (
      <TrailEditor
        trail={editingTrail}
        onBack={() => { setView('list'); setEditingTrail(null); fetchTrails() }}
      />
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <div>
            <h1 style={styles.heading}>Editorial Trails</h1>
            <p style={styles.subtitle}>{trails.length} trail{trails.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={() => { setEditingTrail(null); setView('edit') }} style={styles.btnPrimary}>
            + New Trail
          </button>
        </div>

        {loading ? (
          <p style={{ ...styles.subtitle, textAlign: 'center', padding: '4rem 0' }}>Loading...</p>
        ) : trails.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 0' }}>
            <p style={styles.subtitle}>No trails yet.</p>
            <button onClick={() => setView('edit')} style={{ ...styles.btnPrimary, marginTop: '1rem' }}>
              Create your first trail
            </button>
          </div>
        ) : (
          trails.map(trail => (
            <div key={trail.id} style={{ ...styles.card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{
                    fontFamily: 'var(--font-body, system-ui)',
                    fontSize: '0.95rem',
                    fontWeight: 500,
                    color: 'var(--color-ink, #2D2A26)',
                  }}>
                    {trail.title}
                  </span>
                  <span style={styles.badge(trail.published)}>
                    {trail.published ? 'Published' : 'Draft'}
                  </span>
                  {trail.type === 'editorial' && (
                    <span style={{ ...styles.badge(false), background: '#eef2ff', color: '#4338ca', marginLeft: '0.3rem' }}>
                      Editorial
                    </span>
                  )}
                </div>
                <p style={{ ...styles.subtitle, fontSize: '0.8rem', marginTop: '0.2rem' }}>
                  {trail.trail_stops?.[0]?.count ?? trail.stop_count ?? 0} stops
                  {trail.region ? ` \u00B7 ${trail.region}` : ''}
                  {` \u00B7 /trails/${trail.slug}`}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                <button onClick={() => togglePublish(trail)} style={trail.published ? styles.btnSecondary : styles.btnGreen}>
                  {trail.published ? 'Unpublish' : 'Publish'}
                </button>
                <button onClick={() => { setEditingTrail(trail); setView('edit') }} style={styles.btnSecondary}>
                  Edit
                </button>
                <button onClick={() => deleteTrail(trail.id)} style={styles.btnDanger}>
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
//  Trail editor
// ════════════════════════════════════════════════════════════════════
function TrailEditor({ trail, onBack }) {
  const isNew = !trail

  const [form, setForm] = useState({
    title: trail?.title || '',
    slug: trail?.slug || '',
    description: trail?.description || '',
    hero_intro: trail?.hero_intro || '',
    cover_image_url: trail?.cover_image_url || '',
    region: trail?.region || '',
    vertical_focus: trail?.vertical_focus || '',
    duration_hours: trail?.duration_hours || '',
    best_season: trail?.best_season || '',
    curator_name: trail?.curator_name || '',
    curator_note: trail?.curator_note || '',
    published: trail?.published || false,
    type: 'editorial',
    visibility: 'public',
  })

  const [stops, setStops] = useState([])
  const [venueSearch, setVenueSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // Load existing stops when editing
  useEffect(() => {
    if (!trail?.id) return
    supabase
      .from('trail_stops')
      .select('*')
      .eq('trail_id', trail.id)
      .order('order_index')
      .then(({ data }) => setStops(data || []))
  }, [trail?.id])

  function handleTitleChange(title) {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    setForm(f => ({ ...f, title, slug: isNew ? slug : f.slug }))
  }

  function set(key, value) {
    setForm(f => ({ ...f, [key]: value }))
  }

  // Venue search via API
  useEffect(() => {
    if (venueSearch.length < 2) { setSearchResults([]); return }
    setSearching(true)
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/trails/search?q=${encodeURIComponent(venueSearch)}&limit=10`)
        const json = await res.json()
        const addedIds = new Set(stops.map(s => s.listing_id))
        setSearchResults((json.results || []).filter(v => !addedIds.has(v.id)))
      } catch (e) {
        console.error('Search failed:', e)
        setSearchResults([])
      }
      setSearching(false)
    }, 350)
    return () => clearTimeout(timeout)
  }, [venueSearch, stops])

  function addStop(venue) {
    setStops(s => [...s, {
      _temp: Date.now(),
      listing_id: venue.id,
      vertical: venue.vertical,
      venue_name: venue.name,
      venue_lat: venue.latitude,
      venue_lng: venue.longitude,
      venue_image_url: venue.image_url,
      order_index: stops.length,
      notes: '',
    }])
    setVenueSearch('')
    setSearchResults([])
  }

  function removeStop(index) {
    setStops(s => s.filter((_, i) => i !== index).map((st, i) => ({ ...st, order_index: i })))
  }

  function moveStop(index, direction) {
    const swapIndex = index + direction
    if (swapIndex < 0 || swapIndex >= stops.length) return
    const newStops = [...stops]
    ;[newStops[index], newStops[swapIndex]] = [newStops[swapIndex], newStops[index]]
    setStops(newStops.map((s, i) => ({ ...s, order_index: i })))
  }

  function updateStopNote(index, notes) {
    setStops(s => s.map((st, i) => i === index ? { ...st, notes } : st))
  }

  async function handleSave() {
    if (!form.title.trim() || !form.slug.trim()) return
    setSaving(true)
    setSaveMsg('')

    try {
      const trailData = {
        title: form.title.trim(),
        slug: form.slug.trim(),
        description: form.description || null,
        hero_intro: form.hero_intro || null,
        cover_image_url: form.cover_image_url || null,
        region: form.region || null,
        vertical_focus: form.vertical_focus || null,
        duration_hours: form.duration_hours || null,
        best_season: form.best_season || null,
        curator_name: form.curator_name || null,
        curator_note: form.curator_note || null,
        published: form.published,
        type: 'editorial',
        visibility: 'public',
        stop_count: stops.length,
      }

      let trailId = trail?.id

      if (isNew) {
        // Generate short_code
        const shortCode = Array.from(crypto.getRandomValues(new Uint8Array(6)))
          .map(b => b.toString(36).padStart(2, '0'))
          .join('')
          .slice(0, 8)
        trailData.short_code = shortCode

        const { data, error } = await supabase.from('trails').insert(trailData).select().single()
        if (error) throw error
        trailId = data.id
      } else {
        const { error } = await supabase.from('trails').update(trailData).eq('id', trailId)
        if (error) throw error
      }

      // Replace stops
      await supabase.from('trail_stops').delete().eq('trail_id', trailId)
      if (stops.length > 0) {
        const stopRows = stops.map((s, i) => ({
          trail_id: trailId,
          listing_id: s.listing_id || null,
          vertical: s.vertical || 'sba',
          venue_name: s.venue_name,
          venue_lat: s.venue_lat,
          venue_lng: s.venue_lng,
          venue_image_url: s.venue_image_url || null,
          order_index: i,
          notes: s.notes || null,
        }))
        const { error } = await supabase.from('trail_stops').insert(stopRows)
        if (error) console.error('Stops save error:', error)
      }

      setSaveMsg('Saved')
      setTimeout(() => onBack(), 800)
    } catch (err) {
      console.error('Save failed:', err)
      setSaveMsg('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <button onClick={onBack} style={{ ...styles.btnSecondary, marginBottom: '1.5rem' }}>
          &larr; Back to trails
        </button>
        <h1 style={{ ...styles.heading, marginBottom: '2rem' }}>
          {isNew ? 'New Editorial Trail' : `Edit: ${trail.title}`}
        </h1>

        {/* ── Trail details ──────────────────────────── */}
        <div style={{ ...styles.card, padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h2 style={styles.sectionTitle}>Trail Details</h2>

          <div style={styles.row}>
            <div style={styles.half}>
              <label style={styles.label}>Title *</label>
              <input
                style={styles.input}
                value={form.title}
                onChange={e => handleTitleChange(e.target.value)}
                placeholder="Melbourne to the Yarra Valley"
              />
            </div>
            <div style={styles.half}>
              <label style={styles.label}>Slug *</label>
              <input
                style={{ ...styles.input, fontFamily: 'monospace' }}
                value={form.slug}
                onChange={e => set('slug', e.target.value)}
              />
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={styles.label}>Description (short summary)</label>
            <textarea
              style={styles.textarea}
              rows={2}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="A brief summary for cards and SEO..."
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={styles.label}>Hero Intro (editorial prose)</label>
            <textarea
              style={styles.textarea}
              rows={6}
              value={form.hero_intro}
              onChange={e => set('hero_intro', e.target.value)}
              placeholder="The longform editorial introduction shown at the top of the trail page..."
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={styles.label}>Cover Image URL</label>
            <input
              style={styles.input}
              value={form.cover_image_url}
              onChange={e => set('cover_image_url', e.target.value)}
              placeholder="https://example.com/image.jpg"
            />
            {form.cover_image_url && (
              <img
                src={form.cover_image_url}
                alt="Cover preview"
                style={{ marginTop: '0.5rem', borderRadius: '8px', maxHeight: '160px', objectFit: 'cover', width: '100%' }}
              />
            )}
          </div>

          <div style={styles.row}>
            <div style={styles.half}>
              <label style={styles.label}>Region</label>
              <input
                style={styles.input}
                value={form.region}
                onChange={e => set('region', e.target.value)}
                placeholder="Yarra Valley"
              />
            </div>
            <div style={styles.half}>
              <label style={styles.label}>Vertical Focus</label>
              <select
                style={styles.select}
                value={form.vertical_focus}
                onChange={e => set('vertical_focus', e.target.value)}
              >
                {VERTICALS.map(v => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={styles.row}>
            <div style={styles.half}>
              <label style={styles.label}>Duration</label>
              <input
                style={styles.input}
                value={form.duration_hours}
                onChange={e => set('duration_hours', e.target.value)}
                placeholder="Full day"
              />
            </div>
            <div style={styles.half}>
              <label style={styles.label}>Best Season</label>
              <input
                style={styles.input}
                value={form.best_season}
                onChange={e => set('best_season', e.target.value)}
                placeholder="Autumn (March-May)"
              />
            </div>
          </div>

          <div style={styles.row}>
            <div style={styles.half}>
              <label style={styles.label}>Curator Name</label>
              <input
                style={styles.input}
                value={form.curator_name}
                onChange={e => set('curator_name', e.target.value)}
                placeholder="Australian Atlas Editorial"
              />
            </div>
            <div style={styles.half}>
              <label style={styles.label}>Curator Note</label>
              <input
                style={styles.input}
                value={form.curator_note}
                onChange={e => set('curator_note', e.target.value)}
                placeholder="Optional personal note from the curator"
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
            <input
              type="checkbox"
              id="published"
              checked={form.published}
              onChange={e => set('published', e.target.checked)}
            />
            <label htmlFor="published" style={{ ...styles.label, margin: 0, fontWeight: 400 }}>
              Published (visible on site)
            </label>
          </div>
        </div>

        {/* ── Stops ──────────────────────────────────── */}
        <div style={{ ...styles.card, padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h2 style={styles.sectionTitle}>Stops ({stops.length})</h2>

          <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
            <input
              style={styles.input}
              value={venueSearch}
              onChange={e => setVenueSearch(e.target.value)}
              placeholder="Search listings to add as stops..."
            />
            {searching && (
              <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', color: '#888' }}>
                Searching...
              </span>
            )}
            {searchResults.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: '#fff',
                border: '1px solid var(--color-border, #e5e5e5)',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                zIndex: 20,
                maxHeight: '280px',
                overflowY: 'auto',
                marginTop: '4px',
              }}>
                {searchResults.map(venue => (
                  <button
                    key={venue.id}
                    onClick={() => addStop(venue)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.75rem 1rem',
                      border: 'none',
                      borderBottom: '1px solid #f0f0f0',
                      background: 'transparent',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-body, system-ui)',
                    }}
                  >
                    <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--color-ink, #2D2A26)' }}>
                      {venue.name}
                    </span>
                    <br />
                    <span style={{ fontSize: '0.75rem', color: '#888' }}>
                      {[venue.vertical, venue.sub_type, venue.region].filter(Boolean).join(' \u00B7 ')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {stops.length === 0 ? (
            <p style={{ ...styles.subtitle, textAlign: 'center', padding: '2rem 0' }}>
              Search for listings above to add stops to this trail.
            </p>
          ) : (
            stops.map((stop, index) => (
              <StopRow
                key={stop.id || stop._temp || index}
                stop={stop}
                index={index}
                total={stops.length}
                onMoveUp={() => moveStop(index, -1)}
                onMoveDown={() => moveStop(index, 1)}
                onRemove={() => removeStop(index)}
                onNoteChange={(note) => updateStopNote(index, note)}
              />
            ))
          )}
        </div>

        {/* ── Actions ────────────────────────────────── */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            onClick={handleSave}
            disabled={saving || !form.title || !form.slug}
            style={{
              ...styles.btnPrimary,
              flex: 1,
              padding: '0.85rem',
              opacity: (saving || !form.title || !form.slug) ? 0.5 : 1,
            }}
          >
            {saving ? 'Saving...' : isNew ? 'Create Trail' : 'Save Changes'}
          </button>
          <button onClick={onBack} style={{ ...styles.btnSecondary, padding: '0.85rem 1.5rem' }}>
            Cancel
          </button>
          {saveMsg && (
            <span style={{
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: '0.85rem',
              color: saveMsg.startsWith('Error') ? '#c53030' : '#276749',
            }}>
              {saveMsg}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
//  Stop row component
// ════════════════════════════════════════════════════════════════════
function StopRow({ stop, index, total, onMoveUp, onMoveDown, onRemove, onNoteChange }) {
  const [noteOpen, setNoteOpen] = useState(!!stop.notes)
  const [note, setNote] = useState(stop.notes || '')

  return (
    <div style={{
      border: '1px solid var(--color-border, #e5e5e5)',
      borderRadius: '10px',
      padding: '0.85rem 1rem',
      marginBottom: '0.5rem',
      background: '#FAFAFA',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          background: 'var(--color-ink, #2D2A26)',
          color: '#fff',
          fontSize: '0.75rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          {index + 1}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            fontFamily: 'var(--font-body, system-ui)',
            fontSize: '0.9rem',
            fontWeight: 500,
            color: 'var(--color-ink, #2D2A26)',
          }}>
            {stop.venue_name}
          </span>
          <br />
          <span style={{ fontSize: '0.75rem', color: '#888' }}>
            {stop.vertical || ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
          <button onClick={() => setNoteOpen(o => !o)} style={{ ...styles.btnSecondary, padding: '0.3rem 0.5rem', fontSize: '0.75rem' }} title="Edit note">
            Note
          </button>
          <button onClick={onMoveUp} disabled={index === 0} style={{ ...styles.btnSecondary, padding: '0.3rem 0.5rem', fontSize: '0.75rem', opacity: index === 0 ? 0.3 : 1 }}>
            Up
          </button>
          <button onClick={onMoveDown} disabled={index === total - 1} style={{ ...styles.btnSecondary, padding: '0.3rem 0.5rem', fontSize: '0.75rem', opacity: index === total - 1 ? 0.3 : 1 }}>
            Dn
          </button>
          <button onClick={onRemove} style={{ ...styles.btnDanger, padding: '0.3rem 0.5rem', fontSize: '0.75rem' }}>
            X
          </button>
        </div>
      </div>
      {noteOpen && (
        <div style={{ marginTop: '0.6rem', paddingTop: '0.6rem', borderTop: '1px solid #eee' }}>
          <textarea
            style={{ ...styles.textarea, fontSize: '0.85rem' }}
            rows={2}
            value={note}
            onChange={e => setNote(e.target.value)}
            onBlur={() => onNoteChange(note)}
            placeholder="Why this stop matters on this trail..."
          />
        </div>
      )}
    </div>
  )
}
