'use client'

import { useCouncil } from '../layout'
import { useRef, useState } from 'react'

export default function CouncilSettings() {
  const { council } = useCouncil()
  const [logoUrl, setLogoUrl] = useState(council?.logo_url || null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const fileRef = useRef(null)

  if (!council) return null

  async function handleFile(file) {
    if (!file) return
    setError('')
    setSaved(false)
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/council/logo', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Upload failed. Please try again.')
      } else {
        setLogoUrl(data.logo_url)
        setSaved(true)
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleRemove() {
    setError('')
    setSaved(false)
    setBusy(true)
    try {
      const res = await fetch('/api/council/logo', { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) setError(data.error || 'Could not remove the logo.')
      else { setLogoUrl(null); setSaved(true) }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 400,
          color: 'var(--color-ink)', margin: '0 0 0.25rem',
        }}>
          Settings
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--color-muted)', margin: 0,
        }}>
          {council.name}
        </p>
      </div>

      {/* Logo card */}
      <section style={{
        background: '#fff', borderRadius: 12, border: '1px solid var(--color-border)', padding: '1.75rem',
      }}>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 400,
          color: 'var(--color-ink)', margin: '0 0 0.4rem',
        }}>
          Your logo
        </h2>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 300,
          color: 'var(--color-muted)', lineHeight: 1.6, margin: '0 0 1.25rem',
        }}>
          Your logo appears on your white-label regional reports, in place of the Australian Atlas
          masthead. PNG, JPG, WebP, AVIF or GIF, up to 2MB. A transparent PNG works best.
        </p>

        {/* Preview */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: 96, padding: '0 1rem', marginBottom: '1.25rem',
          background: 'var(--color-bg)', border: '1px dashed var(--color-border)', borderRadius: 8,
        }}>
          {logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={logoUrl} alt={`${council.name} logo`} style={{ maxHeight: 72, maxWidth: '100%', width: 'auto', objectFit: 'contain' }} />
          ) : (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
              No logo yet — your reports use the Australian Atlas masthead.
            </span>
          )}
        </div>

        {error && (
          <div style={{
            padding: '0.625rem 0.875rem', borderRadius: 8,
            background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c',
            fontFamily: 'var(--font-body)', fontSize: '0.85rem', marginBottom: '1rem',
          }}>
            {error}
          </div>
        )}
        {saved && !error && (
          <div style={{
            padding: '0.625rem 0.875rem', borderRadius: 8,
            background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534',
            fontFamily: 'var(--font-body)', fontSize: '0.85rem', marginBottom: '1rem',
          }}>
            Saved. Your reports now use this logo.
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
          onChange={(e) => handleFile(e.target.files?.[0])}
          style={{ display: 'none' }}
        />
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            style={{
              padding: '0.6rem 1.25rem', borderRadius: 8, border: 'none',
              background: 'var(--color-sage)', color: '#fff',
              fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 500,
              cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Working…' : logoUrl ? 'Replace logo' : 'Upload logo'}
          </button>
          {logoUrl && (
            <button
              type="button"
              disabled={busy}
              onClick={handleRemove}
              style={{
                padding: '0.6rem 1.25rem', borderRadius: 8,
                border: '1px solid var(--color-border)', background: '#fff', color: 'var(--color-ink)',
                fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 500,
                cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
              }}
            >
              Remove
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
