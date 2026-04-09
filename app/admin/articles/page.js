'use client'

import { useState, useEffect, useCallback } from 'react'
import WYSIWYGEditor from '@/components/admin/WYSIWYGEditor'

const VERTICAL_OPTIONS = [
  { value: 'atlas', label: 'Atlas (Network)' },
  { value: 'sba', label: 'Small Batch' },
  { value: 'collection', label: 'Culture' },
  { value: 'craft', label: 'Craft' },
  { value: 'fine_grounds', label: 'Fine Grounds' },
  { value: 'rest', label: 'Rest' },
  { value: 'field', label: 'Field' },
  { value: 'corner', label: 'Corner' },
  { value: 'found', label: 'Found' },
  { value: 'table', label: 'Table' },
]

const VERTICAL_COLORS = {
  atlas: '#2D2A26', sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A',
  fine_grounds: '#8A7055', rest: '#5A8A9A', field: '#4A7C59', corner: '#5F8A7E',
  found: '#D4956A', table: '#C4634F',
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default function ArticlesPage() {
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // article object or 'new'
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all') // 'all' | 'draft' | 'published'

  // Draft state for editor
  const [draft, setDraft] = useState({
    title: '', slug: '', vertical: 'atlas', excerpt: '', body: null,
    hero_image_url: '', author: '', status: 'draft', category: '',
    region_tags: [],
  })

  const fetchArticles = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/articles')
      if (!res.ok) throw new Error('Failed to load articles')
      const data = await res.json()
      setArticles(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchArticles() }, [fetchArticles])

  function startNew() {
    setEditing('new')
    setDraft({
      title: '', slug: '', vertical: 'atlas', excerpt: '', body: null,
      hero_image_url: '', author: '', status: 'draft', category: '',
      region_tags: [],
    })
    setError(null)
  }

  function startEdit(article) {
    setEditing(article)
    setDraft({
      title: article.title || '',
      slug: article.slug || '',
      vertical: article.vertical || 'atlas',
      excerpt: article.excerpt || '',
      body: article.body || null,
      hero_image_url: article.hero_image_url || '',
      author: article.author || '',
      status: article.status || 'draft',
      category: article.category || '',
      region_tags: article.region_tags || [],
    })
    setError(null)
  }

  // If we don't have the full body, fetch single article
  useEffect(() => {
    if (editing && editing !== 'new' && editing.body === undefined) {
      fetch(`/api/admin/articles`)
        .then(r => r.json())
        .then(all => {
          const full = all.find(a => a.id === editing.id)
          if (full) {
            setEditing(full)
            setDraft(d => ({ ...d, body: full.body || null }))
          }
        })
    }
  }, [editing])

  function updateDraft(key, value) {
    setDraft(d => {
      const next = { ...d, [key]: value }
      if (key === 'title' && (editing === 'new' || d.slug === slugify(d.title))) {
        next.slug = slugify(value)
      }
      return next
    })
  }

  async function handleSave(publishOverride) {
    setSaving(true)
    setError(null)
    try {
      const payload = { ...draft }
      if (publishOverride) payload.status = 'published'

      if (editing === 'new') {
        const res = await fetch('/api/admin/articles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Failed to create')
        }
        const created = await res.json()
        setEditing(created)
      } else {
        const res = await fetch('/api/admin/articles', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editing.id, ...payload }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Failed to save')
        }
        const updated = await res.json()
        setEditing(updated)
      }
      await fetchArticles()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (editing === 'new' || !editing?.id) return
    if (!confirm('Delete this article? This cannot be undone.')) return
    setSaving(true)
    try {
      await fetch('/api/admin/articles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing.id }),
      })
      setEditing(null)
      await fetchArticles()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleImageUpload(file) {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/admin/articles/upload', { method: 'POST', body: form })
      if (!res.ok) throw new Error('Upload failed')
      const { url } = await res.json()
      return url
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setUploading(false)
    }
  }

  const filtered = filter === 'all' ? articles : articles.filter(a => a.status === filter)

  // ─── List view ─────────────────────────────────────────────
  if (!editing) {
    return (
      <div style={{ padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 28, color: 'var(--color-ink)', margin: 0 }}>
              Articles
            </h1>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)', margin: '4px 0 0' }}>
              Create and manage journal articles across the Atlas network.
            </p>
          </div>
          <button onClick={startNew} style={{
            padding: '10px 20px', background: 'var(--color-sage)', color: '#fff', border: 'none',
            borderRadius: 6, fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', letterSpacing: '0.03em',
          }}>
            New Article
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {['all', 'draft', 'published'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '5px 14px', borderRadius: 4, border: '1px solid var(--color-border)',
              background: filter === f ? 'var(--color-ink)' : '#fff',
              color: filter === f ? '#fff' : 'var(--color-muted)',
              fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer',
            }}>
              {f} {f !== 'all' && `(${articles.filter(a => f === 'all' || a.status === f).length})`}
              {f === 'all' && ` (${articles.length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)', fontSize: 14 }}>Loading...</p>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--color-muted)' }}>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 20, marginBottom: 8 }}>No articles yet</p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 14 }}>Create your first article to get started.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {filtered.map(article => (
              <div key={article.id} onClick={() => startEdit(article)} style={{
                display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 16, alignItems: 'center',
                padding: '14px 18px', background: '#fff', border: '1px solid var(--color-border)',
                borderRadius: 6, cursor: 'pointer', transition: 'box-shadow 0.1s',
              }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 3, fontSize: 10, fontWeight: 700,
                      fontFamily: 'var(--font-body)', letterSpacing: '0.06em', textTransform: 'uppercase',
                      color: '#fff', background: VERTICAL_COLORS[article.vertical] || '#888',
                    }}>
                      {VERTICAL_OPTIONS.find(v => v.value === article.vertical)?.label || article.vertical}
                    </span>
                    <span style={{
                      padding: '2px 8px', borderRadius: 3, fontSize: 10, fontWeight: 600,
                      fontFamily: 'var(--font-body)', letterSpacing: '0.06em', textTransform: 'uppercase',
                      color: article.status === 'published' ? '#4A7C59' : 'var(--color-muted)',
                      background: article.status === 'published' ? '#E8F0E4' : '#f0f0f0',
                    }}>
                      {article.status}
                    </span>
                  </div>
                  <h3 style={{
                    fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 400,
                    color: 'var(--color-ink)', margin: 0, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {article.title}
                  </h3>
                  {article.excerpt && (
                    <p style={{
                      fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)',
                      margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {article.excerpt}
                    </p>
                  )}
                </div>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                  {article.author || 'No author'}
                </span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                  {new Date(article.updated_at || article.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ─── Editor view ───────────────────────────────────────────
  return (
    <div style={{ padding: '2rem', maxWidth: 860, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <button onClick={() => setEditing(null)} style={{
          padding: '6px 14px', border: '1px solid var(--color-border)', borderRadius: 4,
          background: '#fff', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)',
          cursor: 'pointer',
        }}>
          &larr; Back to articles
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          {editing !== 'new' && (
            <button onClick={handleDelete} disabled={saving} style={{
              padding: '8px 16px', border: '1px solid #e5d5d5', borderRadius: 5,
              background: '#fff', color: '#c44', fontFamily: 'var(--font-body)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>
              Delete
            </button>
          )}
          <button onClick={() => handleSave()} disabled={saving} style={{
            padding: '8px 20px', border: '1px solid var(--color-border)', borderRadius: 5,
            background: '#fff', color: 'var(--color-ink)', fontFamily: 'var(--font-body)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button onClick={() => handleSave(true)} disabled={saving} style={{
            padding: '8px 20px', border: 'none', borderRadius: 5,
            background: 'var(--color-sage)', color: '#fff', fontFamily: 'var(--font-body)',
            fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.03em',
          }}>
            {saving ? 'Publishing...' : (draft.status === 'published' ? 'Update & Publish' : 'Publish')}
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '10px 16px', marginBottom: 16, borderRadius: 6,
          background: '#FEF2F2', border: '1px solid #FCA5A5',
          fontFamily: 'var(--font-body)', fontSize: 13, color: '#991B1B',
        }}>
          {error}
        </div>
      )}

      {/* Meta fields */}
      <div style={{
        padding: 20, marginBottom: 20, borderRadius: 8,
        border: '1px solid var(--color-border)', background: '#FAFAF6',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
          <Field label="Title" value={draft.title} onChange={v => updateDraft('title', v)} style={{ gridColumn: '1 / -1' }} />
          <Field label="Slug" value={draft.slug} onChange={v => updateDraft('slug', v)} mono />
          <div>
            <Label>Vertical</Label>
            <select value={draft.vertical} onChange={e => updateDraft('vertical', e.target.value)} style={{
              width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)',
              borderRadius: 4, fontFamily: 'var(--font-body)', fontSize: 14,
              background: '#fff', color: 'var(--color-ink)',
            }}>
              {VERTICAL_OPTIONS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </div>
          <Field label="Author" value={draft.author} onChange={v => updateDraft('author', v)} />
          <Field label="Category" value={draft.category} onChange={v => updateDraft('category', v)} />
          <Field label="Excerpt" value={draft.excerpt} onChange={v => updateDraft('excerpt', v)} type="textarea" style={{ gridColumn: '1 / -1' }} />
        </div>

        {/* Hero image */}
        <div style={{ marginTop: 12 }}>
          <Label>Hero Image</Label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              type="text"
              value={draft.hero_image_url}
              onChange={e => updateDraft('hero_image_url', e.target.value)}
              placeholder="Image URL or upload below"
              style={{
                flex: 1, padding: '8px 10px', border: '1px solid var(--color-border)',
                borderRadius: 4, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink)',
              }}
            />
            <label style={{
              padding: '8px 14px', background: '#fff', border: '1px solid var(--color-border)',
              borderRadius: 4, fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
              color: 'var(--color-muted)', cursor: uploading ? 'wait' : 'pointer',
            }}>
              {uploading ? 'Uploading...' : 'Upload'}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => {
                if (e.target.files[0]) {
                  const url = await handleImageUpload(e.target.files[0])
                  if (url) updateDraft('hero_image_url', url)
                }
                e.target.value = ''
              }} />
            </label>
          </div>
          {draft.hero_image_url && (
            <img src={draft.hero_image_url} alt="" style={{
              marginTop: 8, maxHeight: 200, borderRadius: 6, objectFit: 'cover', width: '100%',
            }} />
          )}
        </div>
      </div>

      {/* Body editor */}
      <div style={{ marginBottom: 24 }}>
        <Label>Body</Label>
        <WYSIWYGEditor
          value={draft.body}
          onChange={v => updateDraft('body', v)}
          onUploadImage={handleImageUpload}
          uploading={uploading}
          minHeight={480}
        />
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────

function Label({ children }) {
  return (
    <label style={{
      display: 'block', fontFamily: 'var(--font-body)', fontSize: 10,
      fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
      color: 'var(--color-muted)', marginBottom: 4,
    }}>
      {children}
    </label>
  )
}

function Field({ label, value, onChange, type = 'text', mono, style = {} }) {
  return (
    <div style={{ marginBottom: 0, ...style }}>
      <Label>{label}</Label>
      {type === 'textarea' ? (
        <textarea
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          rows={3}
          style={{
            width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)',
            borderRadius: 4, fontFamily: mono ? 'monospace' : 'var(--font-body)',
            fontSize: 14, color: 'var(--color-ink)', resize: 'vertical',
          }}
        />
      ) : (
        <input
          type="text"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          style={{
            width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)',
            borderRadius: 4, fontFamily: mono ? 'monospace' : 'var(--font-body)',
            fontSize: 14, color: 'var(--color-ink)',
          }}
        />
      )}
    </div>
  )
}
