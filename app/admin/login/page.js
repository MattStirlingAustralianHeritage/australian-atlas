'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/admin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Invalid password')
        return
      }

      router.push('/admin')
    } catch (err) {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Dark ink ground matching the console sidebar — the admin entrance reads
  // as the console, not as a public page.
  return (
    <div style={{ minHeight: 'calc(100vh - 52px)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#161412', padding: '2rem' }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 400, color: '#FAF8F4', margin: 0 }}>
            Australian Atlas
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--color-gold)', margin: '0.4rem 0 0' }}>
            Console
          </p>
        </div>

        <div style={{ background: 'var(--color-card-bg)', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(250,248,244,0.12)', padding: '2rem', boxShadow: 'var(--shadow-lg)' }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label htmlFor="admin-password" style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-muted)', marginBottom: '0.375rem' }}>
                Admin password
              </label>
              <input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                autoComplete="current-password"
                style={{
                  width: '100%',
                  padding: '0.7rem 0.875rem',
                  fontSize: '0.95rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {error && (
              <div role="alert" style={{ padding: '0.625rem 0.875rem', borderRadius: 'var(--radius-sm)', background: '#FBEFEC', border: '1px solid #F0D4CD', color: '#A33A2A', fontFamily: 'var(--font-body)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              {loading ? 'Verifying…' : 'Enter console'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: '1.25rem' }}>
          <a href="/" style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'rgba(250,248,244,0.45)', textDecoration: 'none' }}>
            ← Back to australianatlas.com.au
          </a>
        </p>
      </div>
    </div>
  )
}
