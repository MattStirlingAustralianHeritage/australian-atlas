'use client'

import { useCouncil } from '../layout'
import { useRef, useState } from 'react'
import { Card, PageHeader, SectionTitle, Button } from '@/components/council/ui'

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
      <PageHeader title="Settings" subtitle={council.name} />

      {/* Logo card */}
      <Card style={{ marginBottom: '1.25rem' }}>
        <SectionTitle>Your logo</SectionTitle>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: '0.88rem',
          color: 'var(--color-muted)', lineHeight: 1.6, margin: '0 0 1.25rem',
        }}>
          Your logo appears on your white-label regional reports, in place of the Australian Atlas
          masthead. PNG, JPG, WebP, AVIF or GIF, up to 2MB. A transparent PNG works best.
        </p>

        {/* Preview */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: 96, padding: '0 1rem', marginBottom: '1.25rem',
          background: 'var(--color-bg)', border: '1px dashed var(--color-border)', borderRadius: 10,
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
            padding: '0.625rem 0.875rem', borderRadius: 10,
            background: 'rgba(196,96,58,0.08)', border: '1px solid rgba(196,96,58,0.3)', color: 'var(--color-accent)',
            fontFamily: 'var(--font-body)', fontSize: '0.85rem', marginBottom: '1rem',
          }}>
            {error}
          </div>
        )}
        {saved && !error && (
          <div style={{
            padding: '0.625rem 0.875rem', borderRadius: 10,
            background: 'rgba(95,138,126,0.12)', border: '1px solid rgba(95,138,126,0.3)', color: 'var(--color-sage-dark)',
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
          <Button variant="sage" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'Working…' : logoUrl ? 'Replace logo' : 'Upload logo'}
          </Button>
          {logoUrl && (
            <Button variant="secondary" disabled={busy} onClick={handleRemove}>
              Remove
            </Button>
          )}
        </div>
      </Card>

      {/* Monthly Region Pulse (informational — managed by the Atlas team) */}
      <Card style={{ background: 'var(--color-cream)' }}>
        <SectionTitle>Monthly Region Pulse</SectionTitle>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: '0.88rem',
          color: 'var(--color-muted)', lineHeight: 1.6, margin: 0,
        }}>
          Your council receives a monthly email digest of your region&apos;s performance on the Atlas
          network — page views, listing clicks and search interest — delivered on the 1st of each
          month to your account contact email. To change recipients or opt out, email{' '}
          <a
            href="mailto:councils@australianatlas.com.au"
            style={{ color: 'var(--color-sage-dark)', textDecoration: 'underline', textUnderlineOffset: 3 }}
          >
            councils@australianatlas.com.au
          </a>.
        </p>
      </Card>
    </div>
  )
}
