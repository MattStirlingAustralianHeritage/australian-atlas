'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function CouncilLoginPage() {
  const [step, setStep] = useState('email') // email | code
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSendCode(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      const res = await fetch('/api/council/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send-magic-link', email }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong')
      } else {
        setMessage('If you have an account, you\'ll receive a login code shortly.')
        setStep('code')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyCode(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/council/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify-token', email, token: code }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Invalid code')
      } else {
        window.location.href = '/council'
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

  const buttonStyle = {
    width: '100%',
    padding: '0.8rem 1rem',
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

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg)',
      padding: '2rem',
    }}>
      <div style={{ width: '100%', maxWidth: '440px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
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
            Council & Tourism Portal
          </p>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.95rem',
            color: 'var(--color-muted)',
            lineHeight: 1.5,
          }}>
            Sign in to manage your region on the Australian Atlas network
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
          padding: '2rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          {step === 'email' ? (
            <form onSubmit={handleSendCode}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{
                  display: 'block',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.85rem',
                  color: 'var(--color-muted)',
                  marginBottom: '0.375rem',
                }}>
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@council.gov.au"
                  style={inputStyle}
                  onFocus={(e) => e.target.style.borderColor = 'var(--color-sage)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
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
                {loading ? 'Sending...' : 'Send login code'}
              </button>

              <p style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.8rem',
                color: 'var(--color-muted)',
                textAlign: 'center',
                marginTop: '1.25rem',
                lineHeight: 1.5,
              }}>
                We'll email you a 6-digit code to sign in. No password needed.
              </p>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode}>
              {message && (
                <div style={{
                  padding: '0.625rem 0.875rem',
                  borderRadius: '8px',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  color: '#166534',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.85rem',
                  marginBottom: '1.25rem',
                }}>
                  {message}
                </div>
              )}

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{
                  display: 'block',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.85rem',
                  color: 'var(--color-muted)',
                  marginBottom: '0.375rem',
                }}>
                  Enter your 6-digit code
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  maxLength={6}
                  placeholder="000000"
                  style={{
                    ...inputStyle,
                    textAlign: 'center',
                    fontSize: '1.5rem',
                    letterSpacing: '0.3em',
                    fontWeight: 600,
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--color-sage)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                  autoFocus
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

              <button type="submit" disabled={loading || code.length !== 6} style={{
                ...buttonStyle,
                opacity: (loading || code.length !== 6) ? 0.7 : 1,
              }}>
                {loading ? 'Verifying...' : 'Verify and sign in'}
              </button>

              <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => { setStep('email'); setCode(''); setError(''); setMessage('') }}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.85rem',
                    color: 'var(--color-sage)',
                    cursor: 'pointer',
                  }}
                >
                  Use a different email
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Bottom link */}
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
            color: 'var(--color-muted)',
          }}>
            Don't have an account?{' '}
            <Link href="/council/enquire" style={{ color: 'var(--color-sage)', textDecoration: 'underline', textUnderlineOffset: '3px' }}>
              Contact us
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
