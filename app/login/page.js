'use client'

import { useState, useEffect } from 'react'
import { getAuthSupabase } from '@/lib/supabase/auth-clients'
import Link from 'next/link'

export default function LoginPage() {
  const [mode, setMode] = useState('login') // login | signup | reset
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [returnUrl, setReturnUrl] = useState(null)
  const [vertical, setVertical] = useState('')

  const supabase = getAuthSupabase()

  // Read return_url and vertical from URL params (for cross-vertical auth)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ru = params.get('return_url')
    const v = params.get('vertical')
    if (ru) setReturnUrl(ru)
    if (v) setVertical(v)
  }, [])

  // After login, redirect through shared auth endpoint if return_url exists
  function getPostLoginRedirect() {
    if (returnUrl) {
      return `/api/auth/shared?return_url=${encodeURIComponent(returnUrl)}&vertical=${encodeURIComponent(vertical)}`
    }
    return '/account'
  }

  async function handleGoogleLogin() {
    setError('')
    const origin = window.location.origin
    // Build callback next param — if return_url exists, go through shared auth
    const next = returnUrl
      ? `/api/auth/shared?return_url=${encodeURIComponent(returnUrl)}&vertical=${encodeURIComponent(vertical)}`
      : '/account'
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: origin + '/auth/callback?next=' + encodeURIComponent(next),
      },
    })
    if (error) setError(error.message)
  }

  async function handleMagicLink() {
    setError('')
    setMessage('')
    setLoading(true)
    try {
      const origin = window.location.origin
      const next = returnUrl
        ? `/api/auth/shared?return_url=${encodeURIComponent(returnUrl)}&vertical=${encodeURIComponent(vertical)}`
        : '/account'
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: origin + '/auth/callback?next=' + encodeURIComponent(next),
        },
      })
      if (error) throw error
      setMessage('Check your email for a sign-in link.')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        window.location.href = getPostLoginRedirect()
      } else if (mode === 'signup') {
        const origin = window.location.origin
        const next = returnUrl
          ? `/api/auth/shared?return_url=${encodeURIComponent(returnUrl)}&vertical=${encodeURIComponent(vertical)}`
          : '/account'
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: origin + '/auth/callback?next=' + encodeURIComponent(next),
          },
        })
        if (error) throw error
        setMessage('Check your email for a confirmation link.')
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + '/auth/callback?next=/account',
        })
        if (error) throw error
        setMessage('Check your email for a password reset link.')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-cream)', padding: '2rem' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <Link href="/" style={{ textDecoration: 'none', color: 'var(--color-ink)' }}>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              Australian Atlas
            </h1>
          </Link>
          {vertical && (
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.75rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: '0.75rem' }}>
              Sign in via {vertical}
            </p>
          )}
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.95rem', color: 'var(--color-muted)', lineHeight: 1.5 }}>
            Sign in to explore, save favourites, and build trails across the Australian Atlas network
          </p>
        </div>

        {/* Card */}
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--color-border)', padding: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          {/* Google OAuth */}
          {mode !== 'reset' && (
            <>
              <button
                onClick={handleGoogleLogin}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  background: '#fff',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.95rem',
                  color: 'var(--color-ink)',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
                onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--color-sage)'}
                onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--color-border)'}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                  <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1.5rem 0' }}>
                <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', color: 'var(--color-muted)' }}>or sign in with email</span>
                <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
              </div>
            </>
          )}

          {/* Magic Link Option */}
          {mode === 'magic' && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '0.85rem', color: 'var(--color-muted)', marginBottom: '0.375rem' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                style={{
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
                  marginBottom: '0.75rem',
                }}
              />
              {error && (
                <div style={{ padding: '0.625rem 0.875rem', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontFamily: 'var(--font-sans)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                  {error}
                </div>
              )}
              {message && (
                <div style={{ padding: '0.625rem 0.875rem', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontFamily: 'var(--font-sans)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                  {message}
                </div>
              )}
              <button
                onClick={handleMagicLink}
                disabled={loading || !email}
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
                {loading ? 'Sending...' : 'Send magic link'}
              </button>
            </div>
          )}

          {/* Email/Password Form */}
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '0.85rem', color: 'var(--color-muted)', marginBottom: '0.375rem' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
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
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--color-sage)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
              />
            </div>

            {mode !== 'reset' && (
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '0.85rem', color: 'var(--color-muted)', marginBottom: '0.375rem' }}>
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  style={{
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
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--color-sage)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                />
              </div>
            )}

            {/* Error / Message */}
            {error && (
              <div style={{ padding: '0.625rem 0.875rem', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontFamily: 'var(--font-sans)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {error}
              </div>
            )}
            {message && (
              <div style={{ padding: '0.625rem 0.875rem', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontFamily: 'var(--font-sans)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {message}
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
                transition: 'background 0.15s',
              }}
              onMouseOver={(e) => { if (!loading) e.currentTarget.style.background = 'var(--color-sage-dark)' }}
              onMouseOut={(e) => e.currentTarget.style.background = 'var(--color-sage)'}
            >
              {loading
                ? 'Please wait...'
                : mode === 'login'
                  ? 'Sign in'
                  : mode === 'signup'
                    ? 'Create account'
                    : 'Send reset link'}
            </button>
          </form>

          {/* Mode switcher */}
          <div style={{ marginTop: '1.25rem', textAlign: 'center', fontFamily: 'var(--font-sans)', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
            {mode === 'login' && (
              <>
                <button onClick={() => { setMode('magic'); setError(''); setMessage('') }} style={{ background: 'none', border: 'none', color: 'var(--color-sage)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>
                  Use magic link instead
                </button>
                <span style={{ margin: '0 0.5rem' }}>|</span>
                <button onClick={() => { setMode('reset'); setError(''); setMessage('') }} style={{ background: 'none', border: 'none', color: 'var(--color-sage)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>
                  Forgot password?
                </button>
                <span style={{ margin: '0 0.5rem' }}>|</span>
                <button onClick={() => { setMode('signup'); setError(''); setMessage('') }} style={{ background: 'none', border: 'none', color: 'var(--color-sage)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>
                  Create account
                </button>
              </>
            )}
            {mode === 'signup' && (
              <button onClick={() => { setMode('login'); setError(''); setMessage('') }} style={{ background: 'none', border: 'none', color: 'var(--color-sage)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>
                Already have an account? Sign in
              </button>
            )}
            {(mode === 'reset' || mode === 'magic') && (
              <button onClick={() => { setMode('login'); setError(''); setMessage('') }} style={{ background: 'none', border: 'none', color: 'var(--color-sage)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>
                Back to sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
