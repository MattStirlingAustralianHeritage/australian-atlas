'use client'

import { useState } from 'react'

export default function TradeSettingsClient({ account }) {
  const [website, setWebsite] = useState(account?.org_website || '')
  const [logoUrl, setLogoUrl] = useState(account?.org_logo_url || '')
  const [focusRegions, setFocusRegions] = useState((account?.focus_regions || []).join(', '))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch('/api/trade/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_website: website.trim() || null,
          org_logo_url: logoUrl.trim() || null,
          focus_regions: focusRegions,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save')
      setMessage('Saved.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '2.5rem 1.5rem 6rem' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'var(--color-ink)', margin: 0 }}>
        Settings
      </h1>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 300, color: 'var(--color-muted)', margin: '8px 0 24px', lineHeight: 1.6 }}>
        How {account?.org_name} appears on shared itineraries — beside the “Curated via Atlas”
        attribution, which stays on every artefact (it’s in the terms you accepted).
      </p>

      <form onSubmit={save} style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Organisation website" hint="Shown under “Prepared by” on shared itineraries and PDFs.">
          <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" style={inputStyle} />
        </Field>
        <Field label="Logo URL (https)" hint="Optional. A hosted logo image, shown on your shared itinerary pages.">
          <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…/logo.png" style={inputStyle} />
        </Field>
        <Field label="Focus regions" hint="Comma-separated. Sharpens what the workspace surfaces for you first.">
          <input value={focusRegions} onChange={(e) => setFocusRegions(e.target.value)} placeholder="e.g. Yarra Valley, Tasmania, Margaret River" style={inputStyle} />
        </Field>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="submit" disabled={saving}
            style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--color-ink)', background: 'var(--color-gold)', border: 'none', padding: '10px 24px', borderRadius: 99, cursor: saving ? 'default' : 'pointer' }}
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          {message && <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: '#2e7d32', fontWeight: 600 }}>{message}</span>}
          {error && <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: '#b3261e' }}>{error}</span>}
        </div>
      </form>

      <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20, marginTop: 16 }}>
        <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-gold)', margin: '0 0 10px' }}>
          Your membership
        </h2>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink)', margin: 0, lineHeight: 1.7 }}>
          {account?.founding_member
            ? `Founding member #${account.founding_cohort_seq} — your founding rate is locked.`
            : 'Beta member — free during the founding beta.'}
          <br />
          <span style={{ color: 'var(--color-muted)' }}>
            First invoice date: {account?.first_invoice_on || '—'} (nothing is charged during the beta).
          </span>
        </p>
      </div>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--color-ink)', marginBottom: 4 }}>{label}</label>
      {hint && <p style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--color-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>{hint}</p>}
      {children}
    </div>
  )
}

const inputStyle = {
  width: '100%', fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--color-ink)',
  padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border)', boxSizing: 'border-box',
}
