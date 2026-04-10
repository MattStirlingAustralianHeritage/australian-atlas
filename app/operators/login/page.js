'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getAuthSupabase } from '@/lib/supabase/auth-clients'

export default function OperatorLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      const supabase = getAuthSupabase()
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

      if (authError) {
        setError(authError.message || 'Invalid email or password')
      } else {
        router.push('/operators/dashboard')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      setError('Enter your email address first')
      return
    }
    setError('')
    setMessage('')
    setLoading(true)

    try {
      const supabase = getAuthSupabase()
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/operators/login`,
      })

      if (resetError) {
        setError(resetError.message || 'Failed to send reset email')
      } else {
        setMessage('If an account exists with that email, you will receive a password reset link.')
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
            Operator Portal
          </p>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.95rem',
            color: 'var(--color-muted)',
            lineHeight: 1.5,
          }}>
            Sign in to manage your collections and itineraries
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
          <form onSubmit={handleLogin}>
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
                placeholder="you@company.com"
                style={inputStyle}
                onFocus={(e) => e.target.style.borderColor = 'var(--color-sage)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
              />
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{
                display: 'block',
                fontFamily: 'var(--font-body)',
                fontSize: '0.85rem',
                color: 'var(--color-muted)',
                marginBottom: '0.375rem',
              }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Your password"
                style={inputStyle}
                onFocus={(e) => e.target.style.borderColor = 'var(--color-sage)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
              />
            </div>

            <div style={{ textAlign: 'right', marginBottom: '1.25rem' }}>
              <button
                type="button"
                onClick={handleForgotPassword}
                style={{
                  background: 'none',
                  border: 'none',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.8rem',
                  color: 'var(--color-sage)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textUnderlineOffset: '3px',
                  padding: 0,
                }}
              >
                Forgot password?
              </button>
            </div>

            {message && (
              <div style={{
                padding: '0.625rem 0.875rem',
                borderRadius: '8px',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                color: '#166534',
                fontFamily: 'var(--font-body)',
                fontSize: '0.85rem',
                marginBottom: '1rem',
              }}>
                {message}
              </div>
            )}

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
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>

        {/* Bottom link */}
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
            color: 'var(--color-muted)',
          }}>
            Don&apos;t have an account?{' '}
            <Link href="/operators/register" style={{ color: 'var(--color-sage)', textDecoration: 'underline', textUnderlineOffset: '3px' }}>
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
