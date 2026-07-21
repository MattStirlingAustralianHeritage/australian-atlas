'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getAuthSupabase } from '@/lib/supabase/auth-clients'
import { safeNextPath } from '@/lib/safe-redirect'

// Set-a-new-password screen. Recovery links land here (via /auth/callback,
// which verifies the token and sets a session first). Without this page a
// password reset only ever minted a session cookie on the machine the link
// was opened on — the password itself was never changed, so sign-in kept
// failing everywhere else. Also works as a plain change-password page for
// anyone already signed in.

const inputStyle = {
  width: '100%',
  padding: '0.7rem 0.875rem',
  borderRadius: '8px',
  border: '1px solid var(--color-border)',
  fontFamily: 'var(--font-sans)',
  fontSize: '0.95rem',
  color: 'var(--color-ink)',
  background: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
}

export default function UpdatePasswordPage() {
  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)
  const [next, setNext] = useState('/account')

  const supabase = getAuthSupabase()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setNext(safeNextPath(params.get('next')))
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data?.session)
      setChecking(false)
    })
  }, [supabase])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    const { error: updateErr } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (updateErr) {
      if (/different from the old/i.test(updateErr.message || '')) {
        setError('That is already your current password — you can sign in with it as it is, or choose a different one.')
      } else {
        setError(updateErr.message || 'Could not update your password. Please try again.')
      }
      return
    }
    setSaved(true)
    setTimeout(() => { window.location.href = next }, 2000)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-cream)', padding: '2rem' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <Link href="/" style={{ textDecoration: 'none', color: 'var(--color-ink)' }}>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              Australian Atlas
            </h1>
          </Link>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.95rem', color: 'var(--color-muted)', lineHeight: 1.5 }}>
            Choose a new password for your account
          </p>
        </div>

        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--color-border)', padding: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          {checking ? (
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem', color: 'var(--color-muted)', textAlign: 'center', margin: 0 }}>
              Checking your link...
            </p>
          ) : saved ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ padding: '0.625rem 0.875rem', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontFamily: 'var(--font-sans)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Password updated. You&apos;re signed in — this password now works on any device.
              </div>
              <Link href={next} style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem', color: 'var(--color-sage)' }}>
                Continue to your account →
              </Link>
            </div>
          ) : !hasSession ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ padding: '0.625rem 0.875rem', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontFamily: 'var(--font-sans)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                This password reset link is invalid or has expired. Reset links can only be used once.
              </div>
              <Link href="/login?mode=reset" style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem', color: 'var(--color-sage)' }}>
                Request a new reset link →
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '0.85rem', color: 'var(--color-muted)', marginBottom: '0.375rem' }}>
                  New password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  style={inputStyle}
                  onFocus={(e) => e.target.style.borderColor = 'var(--color-sage)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '0.85rem', color: 'var(--color-muted)', marginBottom: '0.375rem' }}>
                  Confirm new password
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  style={inputStyle}
                  onFocus={(e) => e.target.style.borderColor = 'var(--color-sage)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                />
              </div>

              {error && (
                <div style={{ padding: '0.625rem 0.875rem', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontFamily: 'var(--font-sans)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--color-sage)',
                  color: '#fff',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.95rem',
                  fontWeight: 500,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? 'Saving...' : 'Set new password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
