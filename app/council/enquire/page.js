'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import RegionAutocomplete from './RegionAutocomplete'

export default function CouncilEnquirePage() {
  return (
    <Suspense fallback={null}>
      <CouncilEnquireForm />
    </Suspense>
  )
}

function CouncilEnquireForm() {
  const [form, setForm] = useState({
    name: '',
    role: '',
    organisation: '',
    email: '',
    region: '',
    message: '',
  })
  const [regionId, setRegionId] = useState(null)
  const [selectedRegion, setSelectedRegion] = useState(null) // { id, name, state, listing_count }
  const [result, setResult] = useState(null) // { instant: bool } once submitted
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function handleRegion({ id, name, state, listing_count }) {
    setRegionId(id)
    update('region', name)
    setSelectedRegion(id ? { id, name, state, listing_count } : null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/council/enquire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, regionId }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
      } else {
        setResult({ instant: !!data.instant })
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    fontFamily: 'var(--font-body)',
    fontSize: '1rem',
    color: 'var(--color-ink)',
    background: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const labelStyle = {
    display: 'block',
    fontFamily: 'var(--font-body)',
    fontSize: '0.85rem',
    color: 'var(--color-muted)',
    marginBottom: '0.375rem',
  }

  const buttonStyle = {
    width: '100%',
    padding: '0.85rem 1rem',
    borderRadius: '8px',
    border: 'none',
    background: 'var(--color-sage)',
    color: '#fff',
    fontFamily: 'var(--font-body)',
    fontSize: '0.95rem',
    fontWeight: 500,
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.7 : 1,
    transition: 'background 0.15s',
  }

  const isGov = /@[^\s@]+\.gov\.au$/i.test(form.email.trim())

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg)',
      padding: '2rem',
    }}>
      <div style={{ width: '100%', maxWidth: '520px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <Link href="/" style={{ textDecoration: 'none', color: 'var(--color-ink)' }}>
            <h1 style={{
              fontFamily: 'var(--font-display)',
              fontSize: '2rem',
              fontWeight: 400,
              marginBottom: '0.25rem',
            }}>
              Australian Atlas
            </h1>
          </Link>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.75rem',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'var(--color-muted)',
            marginBottom: '0.75rem',
          }}>
            Council &amp; Tourism Portal
          </p>
          {!result && (
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.95rem',
              color: 'var(--color-muted)',
              lineHeight: 1.5,
            }}>
              Claim your region on Australian Atlas. Pick your region below and you&rsquo;ll get founding-partner access to every listed operator, live demand signals, and analytics &mdash; free while we&rsquo;re in beta, no card required.
            </p>
          )}
        </div>

        {/* Card */}
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
          padding: '2rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          {result ? (
            <SuccessPanel instant={result.instant} region={selectedRegion} email={form.email} />
          ) : (
            <form onSubmit={handleSubmit}>
              {/* Region — the star of the form, first */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Your region</label>
                <RegionAutocomplete
                  value={form.region}
                  regionId={regionId}
                  onChange={handleRegion}
                  inputStyle={inputStyle}
                  placeholder="Start typing — e.g. Yarra Valley, Barossa…"
                />
                {selectedRegion ? (
                  <div style={{
                    marginTop: '0.6rem',
                    padding: '0.7rem 0.9rem',
                    borderRadius: '8px',
                    background: 'rgba(95,138,126,0.08)',
                    border: '1px solid rgba(95,138,126,0.25)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.85rem',
                    color: '#3f5f56',
                    lineHeight: 1.45,
                  }}>
                    <strong style={{ color: '#2f4a43' }}>{selectedRegion.name}{selectedRegion.state ? `, ${selectedRegion.state}` : ''}</strong>
                    {typeof selectedRegion.listing_count === 'number' && selectedRegion.listing_count > 0 ? (
                      <> &mdash; {selectedRegion.listing_count.toLocaleString()} independent places already mapped, ready for you.</>
                    ) : (
                      <> &mdash; ready for you inside the portal.</>
                    )}
                  </div>
                ) : (
                  <p style={{ marginTop: '0.4rem', fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--color-muted)' }}>
                    Can&rsquo;t find yours? Type it in &mdash; we&rsquo;ll match it for you.
                  </p>
                )}
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Council or organisation name</label>
                <input
                  type="text"
                  value={form.organisation}
                  onChange={(e) => update('organisation', e.target.value)}
                  required
                  placeholder="Yarra Ranges Council"
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px' }}>
                  <label style={labelStyle}>Full name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => update('name', e.target.value)}
                    required
                    placeholder="Jane Smith"
                    style={inputStyle}
                  />
                </div>
                <div style={{ flex: '1 1 200px' }}>
                  <label style={labelStyle}>Your role</label>
                  <input
                    type="text"
                    value={form.role}
                    onChange={(e) => update('role', e.target.value)}
                    required
                    placeholder="e.g. Tourism Manager"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Work email address</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                  required
                  placeholder="jane@council.gov.au"
                  style={inputStyle}
                />
                {isGov && (
                  <p style={{ marginTop: '0.4rem', fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: '#5F8A7E' }}>
                    &#10003; Government email &mdash; you&rsquo;ll get an instant sign-in link.
                  </p>
                )}
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={labelStyle}>Anything else? (optional)</label>
                <textarea
                  value={form.message}
                  onChange={(e) => update('message', e.target.value)}
                  rows={2}
                  placeholder="Other regions you cover, questions, timing…"
                  style={{
                    ...inputStyle,
                    resize: 'vertical',
                    minHeight: '64px',
                  }}
                />
              </div>

              {error && (
                <div style={{
                  padding: '0.625rem 0.875rem',
                  borderRadius: '8px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.85rem',
                  marginBottom: '1rem',
                }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} style={buttonStyle}>
                {loading ? 'Setting you up…' : (isGov ? 'Get instant access' : 'Claim your region')}
              </button>

              <p style={{ marginTop: '0.85rem', textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                Free founding-partner access · no card · no commitment
              </p>
            </form>
          )}
        </div>

        {/* Bottom link */}
        {!result && (
          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.85rem',
              color: 'var(--color-muted)',
            }}>
              Existing account?{' '}
              <Link href="/council/login" style={{ color: 'var(--color-sage)', textDecoration: 'underline', textUnderlineOffset: '3px' }}>
                Sign in
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function SuccessPanel({ instant, region, email }) {
  return (
    <div style={{ textAlign: 'center', padding: '1rem 0' }}>
      <div style={{
        width: '52px',
        height: '52px',
        borderRadius: '50%',
        background: '#f0fdf4',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 1rem',
        fontSize: '1.6rem',
      }}>
        <span style={{ color: '#166534' }}>&#10003;</span>
      </div>
      <h2 style={{
        fontFamily: 'var(--font-display)',
        fontSize: '1.35rem',
        fontWeight: 400,
        color: 'var(--color-ink)',
        marginBottom: '0.75rem',
      }}>
        {instant ? 'You’re in.' : 'Application received'}
      </h2>
      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.95rem',
        color: 'var(--color-muted)',
        lineHeight: 1.55,
        maxWidth: '380px',
        margin: '0 auto',
      }}>
        {instant ? (
          <>We&rsquo;ve sent a one-click sign-in link to <strong style={{ color: 'var(--color-ink)' }}>{email}</strong>. Open it to step straight into{region?.name ? <> your {region.name} dashboard</> : <> your region dashboard</>}.</>
        ) : (
          <>Thanks &mdash; we&rsquo;re confirming your access to{region?.name ? <> {region.name}</> : <> your region</>} and will email a sign-in link to <strong style={{ color: 'var(--color-ink)' }}>{email}</strong>, usually within one business day.</>
        )}
      </p>
      <div style={{ marginTop: '1.5rem' }}>
        <Link href="/council/login" style={{ color: 'var(--color-sage)', textDecoration: 'underline', textUnderlineOffset: '3px', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
          Go to sign in
        </Link>
      </div>
    </div>
  )
}
