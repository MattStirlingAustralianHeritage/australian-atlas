'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ClusterActions({ cluster }) {
  const router = useRouter()
  const [label, setLabel] = useState(cluster.label || '')
  const [editing, setEditing] = useState(false)
  const [editorial, setEditorial] = useState(!!cluster.is_editorially_interesting)
  const [loading, setLoading] = useState(null) // 'rename' | 'editorial' | 'collection'
  const [error, setError] = useState(null)
  const [collectionSlug, setCollectionSlug] = useState(null)

  async function handleRename() {
    if (!label.trim() || label.trim() === cluster.label) {
      setLabel(cluster.label || '')
      setEditing(false)
      return
    }

    setLoading('rename')
    setError(null)

    try {
      const res = await fetch('/api/admin/clusters', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cluster.id, label: label.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Rename failed')
        return
      }

      setEditing(false)
      router.refresh()
    } catch {
      setError('Network error')
    } finally {
      setLoading(null)
    }
  }

  async function handleToggleEditorial() {
    setLoading('editorial')
    setError(null)

    const newValue = !editorial

    try {
      const res = await fetch('/api/admin/clusters', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cluster.id, is_editorially_interesting: newValue }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Toggle failed')
        return
      }

      setEditorial(newValue)
      router.refresh()
    } catch {
      setError('Network error')
    } finally {
      setLoading(null)
    }
  }

  async function handleCreateCollection() {
    setLoading('collection')
    setError(null)

    try {
      const res = await fetch('/api/admin/clusters/create-collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterId: cluster.id }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Collection creation failed')
        return
      }

      setCollectionSlug(data.slug)
      router.refresh()
    } catch {
      setError('Network error')
    } finally {
      setLoading(null)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleRename()
    } else if (e.key === 'Escape') {
      setLabel(cluster.label || '')
      setEditing(false)
    }
  }

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {/* Editable label */}
      {editing ? (
        <input
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleRename}
          autoFocus
          disabled={loading === 'rename'}
          style={{
            fontFamily: 'var(--font-display, Georgia)',
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--color-ink, #2D2A26)',
            border: '1px solid #b8862b',
            borderRadius: 4,
            padding: '2px 6px',
            width: '100%',
            outline: 'none',
            background: loading === 'rename' ? '#f9f9f9' : '#fff',
          }}
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          title="Click to rename"
          style={{
            fontFamily: 'var(--font-display, Georgia)',
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--color-ink, #2D2A26)',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            textAlign: 'left',
            lineHeight: 1.3,
            borderBottom: '1px dashed transparent',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderBottomColor = 'var(--color-border, #e5e5e5)' }}
          onMouseLeave={e => { e.currentTarget.style.borderBottomColor = 'transparent' }}
        >
          {label}
        </button>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
        {/* Editorial toggle */}
        <button
          onClick={handleToggleEditorial}
          disabled={loading !== null}
          title={editorial ? 'Remove editorial flag' : 'Flag as editorially interesting'}
          style={{
            padding: '3px 10px',
            borderRadius: 100,
            border: editorial
              ? '1px solid #b8862b'
              : '1px solid var(--color-border, #e5e5e5)',
            background: editorial ? '#b8862b' : '#fff',
            color: editorial ? '#fff' : 'var(--color-muted, #888)',
            fontFamily: 'var(--font-body, system-ui)',
            fontSize: 10,
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading === 'editorial' ? 0.6 : 1,
            transition: 'all 0.15s ease',
          }}
        >
          {loading === 'editorial' ? '...' : editorial ? 'Editorial' : 'Flag editorial'}
        </button>

        {/* Create collection (only if editorial + no existing collection) */}
        {editorial && !cluster.collection_id && !collectionSlug && (
          <button
            onClick={handleCreateCollection}
            disabled={loading !== null}
            style={{
              padding: '3px 10px',
              borderRadius: 100,
              border: '1px solid #4a7c59',
              background: loading === 'collection' ? '#e8e8e8' : '#4a7c59',
              color: loading === 'collection' ? '#888' : '#fff',
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: 10,
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading === 'collection' ? 'Creating...' : 'Create collection'}
          </button>
        )}

        {/* Collection created confirmation */}
        {collectionSlug && (
          <a
            href={`/collections/${collectionSlug}`}
            style={{
              fontFamily: 'var(--font-body, system-ui)',
              fontSize: 10,
              fontWeight: 500,
              color: '#b8862b',
              textDecoration: 'none',
            }}
          >
            View collection &rarr;
          </a>
        )}
      </div>

      {/* Error */}
      {error && (
        <p style={{
          fontFamily: 'var(--font-body, system-ui)',
          fontSize: 11,
          color: '#c44',
          margin: '6px 0 0',
        }}>
          {error}
        </p>
      )}
    </div>
  )
}
