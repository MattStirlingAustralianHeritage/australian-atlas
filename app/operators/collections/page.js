'use client'

import { useEffect, useState, useCallback } from 'react'
import { useOperator } from '../layout'

export default function OperatorCollectionsPage() {
  const { refetch } = useOperator()
  const [collections, setCollections] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', description: '', region: '' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  const fetchCollections = useCallback(async () => {
    try {
      const res = await fetch('/api/operators/data?view=collections')
      if (res.ok) {
        const data = await res.json()
        setCollections(data.collections || [])
      }
    } catch {} finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCollections()
  }, [fetchCollections])

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/operators/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_collection', ...createForm }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create collection')
      setCreateForm({ name: '', description: '', region: '' })
      setShowCreate(false)
      setMessage({ type: 'success', text: `Collection "${createForm.name}" created` })
      fetchCollections()
      refetch()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete collection "${name}"? This cannot be undone.`)) return
    try {
      const res = await fetch('/api/operators/data', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_collection', collection_id: id }),
      })
      if (!res.ok) throw new Error('Failed to delete')
      setMessage({ type: 'success', text: `Collection "${name}" deleted` })
      fetchCollections()
      refetch()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  async function handleShare(id) {
    try {
      const res = await fetch('/api/operators/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'share_collection', collection_id: id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create share link')
      const shareUrl = `${window.location.origin}/operators/share/${data.token}`
      await navigator.clipboard.writeText(shareUrl)
      setMessage({ type: 'success', text: 'Share link copied to clipboard' })
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  async function handleExport(id) {
    try {
      const res = await fetch('/api/operators/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection_id: id }),
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      refetch()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  async function searchVenues(query) {
    if (!query || query.length < 2) {
      setSearchResults([])
      return
    }
    setSearching(true)
    try {
      const res = await fetch(`/api/map?search=${encodeURIComponent(query)}&limit=10`)
      if (res.ok) {
        const data = await res.json()
        setSearchResults(data.listings || data.results || [])
      }
    } catch {} finally {
      setSearching(false)
    }
  }

  async function addVenueToCollection(collectionId, listingId) {
    try {
      const res = await fetch('/api/operators/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_venue', collection_id: collectionId, listing_id: listingId }),
      })
      if (!res.ok) throw new Error('Failed to add venue')
      setMessage({ type: 'success', text: 'Venue added to collection' })
      fetchCollections()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  async function removeVenueFromCollection(collectionId, listingId) {
    try {
      const res = await fetch('/api/operators/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove_venue', collection_id: collectionId, listing_id: listingId }),
      })
      if (!res.ok) throw new Error('Failed to remove venue')
      fetchCollections()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '0.65rem 0.875rem',
    borderRadius: 8,
    border: '1px solid var(--color-border)',
    fontFamily: 'var(--font-body)',
    fontSize: '0.9rem',
    color: 'var(--color-ink)',
    background: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
  }

  if (loading) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}>Loading collections...</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
            color: 'var(--color-ink)', marginBottom: 4,
          }}>
            Collections
          </h1>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300,
            color: 'var(--color-muted)',
          }}>
            Curate venue collections for your clients
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          style={{
            padding: '10px 20px', borderRadius: 8,
            background: showCreate ? 'var(--color-bg)' : 'var(--color-sage)',
            color: showCreate ? 'var(--color-ink)' : '#fff',
            border: showCreate ? '1px solid var(--color-border)' : 'none',
            fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {showCreate ? 'Cancel' : '+ New Collection'}
        </button>
      </div>

      {/* Messages */}
      {message && (
        <div style={{
          padding: '0.65rem 0.875rem', borderRadius: 8, marginBottom: 20,
          fontFamily: 'var(--font-body)', fontSize: '0.85rem',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          ...(message.type === 'error'
            ? { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }
            : { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534' }
          ),
        }}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 16, color: 'inherit', opacity: 0.5,
          }}>&times;</button>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} style={{
          background: '#fff', borderRadius: 12, padding: 24,
          border: '1px solid var(--color-border)', marginBottom: 24,
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
        }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', marginBottom: 4 }}>
              Collection name *
            </label>
            <input
              required
              value={createForm.name}
              onChange={(e) => setCreateForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Adelaide Hills Wine Trail"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', marginBottom: 4 }}>
              Description
            </label>
            <input
              value={createForm.description}
              onChange={(e) => setCreateForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Brief description of this collection"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', marginBottom: 4 }}>
              Region
            </label>
            <input
              value={createForm.region}
              onChange={(e) => setCreateForm(f => ({ ...f, region: e.target.value }))}
              placeholder="e.g. Adelaide Hills"
              style={inputStyle}
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" disabled={saving} style={{
              padding: '10px 24px', borderRadius: 8,
              background: 'var(--color-sage)', color: '#fff', border: 'none',
              fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
            }}>
              {saving ? 'Creating...' : 'Create collection'}
            </button>
          </div>
        </form>
      )}

      {/* Collections grid */}
      {collections.length === 0 ? (
        <div style={{
          background: '#fff', borderRadius: 12, padding: '60px 24px',
          border: '1px solid var(--color-border)', textAlign: 'center',
        }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-muted)' }}>
            No collections yet. Create one to start curating venues.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {collections.map(col => (
            <div key={col.id} style={{
              background: '#fff', borderRadius: 12, padding: '20px 24px',
              border: '1px solid var(--color-border)',
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <h3 style={{
                    fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400,
                    color: 'var(--color-ink)', margin: '0 0 4px',
                  }}>
                    {col.name}
                  </h3>
                  {col.region && (
                    <span style={{
                      fontSize: 11, fontWeight: 500, padding: '2px 8px',
                      borderRadius: 99, background: 'var(--color-bg)',
                      color: 'var(--color-muted)', flexShrink: 0,
                      fontFamily: 'var(--font-body)',
                    }}>
                      {col.region}
                    </span>
                  )}
                </div>
                {col.description && (
                  <p style={{
                    fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300,
                    color: 'var(--color-muted)', lineHeight: 1.5, margin: '4px 0 0',
                  }}>
                    {col.description}
                  </p>
                )}
                <p style={{
                  fontFamily: 'var(--font-body)', fontSize: 12,
                  color: 'var(--color-muted)', margin: '10px 0 0',
                }}>
                  {col.venue_count || 0} venue{(col.venue_count || 0) !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Edit mode: venue search */}
              {editingId === col.id && (
                <div style={{
                  marginTop: 16, padding: '12px 0',
                  borderTop: '1px solid var(--color-border)',
                }}>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); searchVenues(e.target.value) }}
                    placeholder="Search venues to add..."
                    style={{ ...inputStyle, marginBottom: 8 }}
                  />
                  {searching && (
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)' }}>
                      Searching...
                    </p>
                  )}
                  {searchResults.length > 0 && (
                    <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                      {searchResults.map(venue => (
                        <div key={venue.id} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '6px 0', borderBottom: '1px solid var(--color-border)',
                        }}>
                          <div>
                            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 400, color: 'var(--color-ink)', margin: 0 }}>
                              {venue.name}
                            </p>
                            <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)', margin: 0 }}>
                              {venue.vertical || venue.category}
                            </p>
                          </div>
                          <button
                            onClick={() => addVenueToCollection(col.id, venue.id)}
                            style={{
                              padding: '3px 10px', borderRadius: 4,
                              background: 'var(--color-sage)', color: '#fff',
                              border: 'none', fontSize: 11, cursor: 'pointer',
                              fontFamily: 'var(--font-body)',
                            }}
                          >
                            Add
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Current venues in collection */}
                  {col.venues?.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500, color: 'var(--color-muted)', marginBottom: 6 }}>
                        Current venues:
                      </p>
                      {col.venues.map((v, i) => (
                        <div key={v.id || i} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '4px 0',
                        }}>
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink)' }}>
                            {v.name}
                          </span>
                          <button
                            onClick={() => removeVenueFromCollection(col.id, v.id)}
                            style={{
                              padding: '2px 8px', borderRadius: 4,
                              background: '#fef2f2', color: '#b91c1c',
                              border: '1px solid #fecaca', fontSize: 11,
                              cursor: 'pointer', fontFamily: 'var(--font-body)',
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div style={{
                display: 'flex', gap: 8, marginTop: 16, paddingTop: 12,
                borderTop: editingId === col.id ? 'none' : '1px solid var(--color-border)',
                flexWrap: 'wrap',
              }}>
                <button
                  onClick={() => handleShare(col.id)}
                  style={{
                    padding: '6px 14px', borderRadius: 6,
                    background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                    fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
                    color: 'var(--color-ink)', cursor: 'pointer',
                  }}
                >
                  Share
                </button>
                <button
                  onClick={() => handleExport(col.id)}
                  style={{
                    padding: '6px 14px', borderRadius: 6,
                    background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                    fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
                    color: 'var(--color-ink)', cursor: 'pointer',
                  }}
                >
                  Export PDF
                </button>
                <button
                  onClick={() => {
                    setEditingId(editingId === col.id ? null : col.id)
                    setSearchQuery('')
                    setSearchResults([])
                  }}
                  style={{
                    padding: '6px 14px', borderRadius: 6,
                    background: editingId === col.id ? 'var(--color-sage)' : 'var(--color-bg)',
                    border: editingId === col.id ? 'none' : '1px solid var(--color-border)',
                    fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
                    color: editingId === col.id ? '#fff' : 'var(--color-ink)',
                    cursor: 'pointer',
                  }}
                >
                  {editingId === col.id ? 'Done' : 'Edit'}
                </button>
                <button
                  onClick={() => handleDelete(col.id, col.name)}
                  style={{
                    padding: '6px 14px', borderRadius: 6,
                    background: '#fef2f2', border: '1px solid #fecaca',
                    fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
                    color: '#b91c1c', cursor: 'pointer', marginLeft: 'auto',
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
