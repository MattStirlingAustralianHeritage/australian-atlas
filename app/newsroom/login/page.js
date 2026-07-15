'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, Button } from '@/components/council/ui'

const INPUT_STYLE = {
  width: '100%',
  padding: '0.6rem 0.75rem',
  borderRadius: 10,
  border: '1px solid var(--color-border)',
  fontFamily: 'var(--font-body)',
  fontSize: '0.95rem',
  color: 'var(--color-ink)',
  background: 'var(--color-card-bg)',
  outline: 'none',
  boxSizing: 'border-box',
}

const LABEL_STYLE = {
  display: 'block',
  fontFamily: 'var(--font-body)',
  fontSize: '0.82rem',
  fontWeight: 550,
  color: 'var(--color-muted)',
  marginBottom: '0.375rem',
}

function BlockButton({ children, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Button {...props}>
        <span style={{ flex: 1, textAlign: 'center' }}>{children}</span>
      </Button>
    </div>
  )
}

function ErrorNote({ children }) {
  return (
    <div style={{
      padding: '0.625rem 0.875rem', borderRadius: 10,
      background: 'rgba(196,96,58,0.08)', border: '1px solid rgba(196,96,58,0.3)',
      color: 'var(--color-accent)',
      fontFamily: 'var(--font-body)', fontSize: '0.85rem', marginBottom: '1rem',
    }}>
      {children}
    </div>
  )
}

export default function NewsroomLoginPage() {
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
      const res = await fetch('/api/press/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send-magic-link', email }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong')
      } else if (data.pending) {
        setMessage(data.message)
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
      const res = await fetch('/api/press/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify-token', email, token: code }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Invalid code')
      } else {
        window.location.href = '/newsroom'
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
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
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Wordmark + headline */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <p style={{
              fontFamily: 'var(--font-display)',
              fontVariant: 'small-caps',
              fontSize: '1rem',
              fontWeight: 480,
              letterSpacing: '0.14em',
              color: 'var(--color-ink)',
              margin: '0 0 0.9rem',
            }}>
              Australian Atlas
            </p>
          </Link>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2rem',
            fontWeight: 420,
            letterSpacing: '-0.01em',
            lineHeight: 1.1,
            color: 'var(--color-ink)',
            margin: '0 0 0.6rem',
          }}>
            The Newsroom
          </h1>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.92rem',
            color: 'var(--color-muted)',
            lineHeight: 1.5,
            margin: 0,
          }}>
            Sign in to your press desk for independent Australia.
          </p>
        </div>

        {/* Card */}
        <Card style={{ padding: '1.75rem' }}>
          {step === 'email' ? (
            <form onSubmit={handleSendCode}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label htmlFor="press-login-email" style={LABEL_STYLE}>
                  Email address
                </label>
                <input
                  id="press-login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@yourpublication.com.au"
                  style={INPUT_STYLE}
                  onFocus={(e) => e.target.style.borderColor = 'var(--color-sage)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                />
              </div>

              {message && (
                <div style={{
                  padding: '0.625rem 0.875rem', borderRadius: 10,
                  background: 'rgba(95,138,126,0.12)', border: '1px solid rgba(95,138,126,0.3)',
                  color: 'var(--color-sage-dark)',
                  fontFamily: 'var(--font-body)', fontSize: '0.85rem', marginBottom: '1rem',
                }}>
                  {message}
                </div>
              )}

              {error && <ErrorNote>{error}</ErrorNote>}

              <BlockButton type="submit" variant="primary" disabled={loading}>
                {loading ? 'Sending…' : 'Send login code'}
              </BlockButton>

              <p style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.78rem',
                color: 'var(--color-muted)',
                textAlign: 'center',
                marginTop: '1.25rem',
                marginBottom: 0,
                lineHeight: 1.5,
              }}>
                We&apos;ll email you a 6-digit code to sign in. No password needed.
              </p>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode}>
              {message && (
                <div style={{
                  padding: '0.625rem 0.875rem', borderRadius: 10,
                  background: 'rgba(95,138,126,0.12)', border: '1px solid rgba(95,138,126,0.3)',
                  color: 'var(--color-sage-dark)',
                  fontFamily: 'var(--font-body)', fontSize: '0.85rem', marginBottom: '1.25rem',
                }}>
                  {message}
                </div>
              )}

              <div style={{ marginBottom: '1.25rem' }}>
                <label htmlFor="press-login-code" style={LABEL_STYLE}>
                  Enter your 6-digit code
                </label>
                <input
                  id="press-login-code"
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  maxLength={6}
                  placeholder="000000"
                  style={{
                    ...INPUT_STYLE,
                    textAlign: 'center',
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.45rem',
                    letterSpacing: '0.3em',
                    fontWeight: 500,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--color-sage)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                  autoFocus
                />
              </div>

              {error && <ErrorNote>{error}</ErrorNote>}

              <BlockButton type="submit" variant="primary" disabled={loading || code.length !== 6}>
                {loading ? 'Verifying…' : 'Verify and sign in'}
              </BlockButton>

              <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => { setStep('email'); setCode(''); setError(''); setMessage('') }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.85rem',
                    fontWeight: 550,
                    color: 'var(--color-sage-dark)',
                    cursor: 'pointer',
                  }}
                >
                  Use a different email
                </button>
              </div>
            </form>
          )}
        </Card>

        {/* Bottom link */}
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
            color: 'var(--color-muted)',
            margin: 0,
          }}>
            Not a member yet?{' '}
            <Link href="/newsroom/enquire" style={{ color: 'var(--color-sage-dark)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
              Request access
            </Link>
            {' '}— free for working press.
          </p>
        </div>
      </div>
    </div>
  )
}
