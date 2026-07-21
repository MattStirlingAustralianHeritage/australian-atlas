'use client'

import { useState } from 'react'

const SEVERITY_BADGE = {
  critical: 'admin-badge admin-badge-error',
  warn: 'admin-badge admin-badge-warn',
  info: 'admin-badge admin-badge-muted',
  ok: 'admin-badge admin-badge-ok',
}

function fmtDate(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) } catch { return iso }
}

export default function AccessDoctorClient() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [linkState, setLinkState] = useState('') // '', 'sending', 'sent', error text

  async function diagnose(e) {
    e?.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError('')
    setResult(null)
    setLinkState('')
    try {
      const res = await fetch(`/api/admin/access-doctor?email=${encodeURIComponent(email.trim())}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function sendLink() {
    if (!result?.email) return
    if (!window.confirm(`Email a magic sign-in link to ${result.email}?`)) return
    setLinkState('sending')
    try {
      const res = await fetch('/api/admin/access-doctor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: result.email, action: 'send_magic_link', next: '/account' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setLinkState('sent')
    } catch (err) {
      setLinkState(`Failed: ${err.message}`)
    }
  }

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: '860px' }}>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.6rem', marginBottom: '0.25rem' }}>Access Doctor</h1>
      <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
        An operator says they can&apos;t get in? One search checks their login identity, profile role,
        claims and listing state, and names the fix. The magic link unblocks without a password.
      </p>

      <form onSubmit={diagnose} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="operator@example.com"
          required
          style={{ flex: 1, padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '0.95rem' }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: 'none', background: 'var(--color-ink, #1c1a17)', color: '#fff', cursor: loading ? 'wait' : 'pointer', fontSize: '0.95rem' }}
        >
          {loading ? 'Checking…' : 'Diagnose'}
        </button>
      </form>

      {error && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: '#FBEFEC', color: '#A33A2A', marginBottom: '1rem', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      {result && (
        <>
          {/* Findings — the diagnosis itself */}
          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>Findings</h2>
            {result.findings.map((f, i) => (
              <div key={i} style={{ border: '1px solid var(--color-border)', borderRadius: '10px', padding: '0.8rem 1rem', marginBottom: '0.6rem', background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                  <span className={SEVERITY_BADGE[f.severity] || SEVERITY_BADGE.info}>{f.severity}</span>
                  <code style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>{f.code}</code>
                </div>
                <div style={{ fontSize: '0.92rem', marginBottom: '0.3rem' }}>{f.message}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>Fix: {f.fix}</div>
              </div>
            ))}
            <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button
                onClick={sendLink}
                disabled={linkState === 'sending' || linkState === 'sent'}
                style={{ padding: '0.55rem 1.1rem', borderRadius: '8px', border: 'none', background: 'var(--color-sage, #5F8A7E)', color: '#fff', cursor: 'pointer', fontSize: '0.9rem' }}
              >
                {linkState === 'sending' ? 'Sending…' : linkState === 'sent' ? 'Magic link sent ✓' : 'Send magic sign-in link'}
              </button>
              {linkState && linkState !== 'sending' && linkState !== 'sent' && (
                <span style={{ color: '#A33A2A', fontSize: '0.85rem' }}>{linkState}</span>
              )}
            </div>
          </section>

          {/* Identity */}
          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>Identity</h2>
            <table className="admin-table">
              <tbody>
                <tr><td style={{ width: '200px' }}>Profile</td><td>{result.profile ? `${result.profile.email} — role '${result.profile.role}'` : 'none'}</td></tr>
                <tr><td>Auth user</td><td>{result.authUser ? result.authUser.id : 'none'}</td></tr>
                <tr><td>Email confirmed</td><td>{fmtDate(result.authUser?.email_confirmed_at)}</td></tr>
                <tr><td>Last sign-in</td><td>{fmtDate(result.authUser?.last_sign_in_at)}</td></tr>
                <tr><td>Sign-in methods</td><td>{result.authUser?.providers?.join(', ') || '—'}</td></tr>
              </tbody>
            </table>
          </section>

          {/* Claims */}
          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>Claims ({result.claims.length})</h2>
            {result.claims.length === 0 ? (
              <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem' }}>No claims for this email.</p>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr><th>Listing</th><th>Vertical</th><th>Claim status</th><th>Tier</th><th>Listing status</th><th>is_claimed</th></tr>
                </thead>
                <tbody>
                  {result.claims.map((c) => (
                    <tr key={c.id}>
                      <td>{c.listings?.name || c.listing_id}</td>
                      <td>{c.listings?.vertical || '—'}</td>
                      <td><span className={`admin-badge ${['active', 'past_due'].includes(c.status) ? 'admin-badge-ok' : 'admin-badge-muted'}`}>{c.status}</span></td>
                      <td>{c.tier}</td>
                      <td>{c.listings?.status || '—'}</td>
                      <td>{String(c.listings?.is_claimed ?? '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Applications */}
          {result.reviews.length > 0 && (
            <section>
              <h2 style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>Claim applications ({result.reviews.length})</h2>
              <table className="admin-table">
                <thead><tr><th>Submitted</th><th>Vertical</th><th>Tier</th><th>Status</th><th>Reviewed</th></tr></thead>
                <tbody>
                  {result.reviews.map((r) => (
                    <tr key={r.id}>
                      <td>{fmtDate(r.created_at)}</td>
                      <td>{r.vertical || '—'}</td>
                      <td>{r.tier}</td>
                      <td>{r.status}</td>
                      <td>{fmtDate(r.reviewed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  )
}
