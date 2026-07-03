'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { getAuthSupabase } from '@/lib/supabase/auth-clients'

/**
 * AuthModal — minimal sign-in modal for in-page actions (e.g. saving
 * a listing without losing context).
 *
 * Two flows:
 *   - Email/password: resolves synchronously; fires onAuthSuccess and
 *     closes. Caller can immediately retry the action that triggered
 *     the modal.
 *   - Google OAuth: redirects away. Caller passes returnTo, and the
 *     redirected page is responsible for resuming the action after
 *     auth (typically by reading a query flag on mount).
 *
 * Props:
 *   open          – controls visibility
 *   onClose       – called when user dismisses
 *   onAuthSuccess – fired after synchronous email/password sign-in
 *   returnTo      – absolute URL to land on after Google OAuth
 *                   (should encode any "resume save" intent)
 */
export default function AuthModal({ open, onClose, onAuthSuccess, returnTo }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = getAuthSupabase()
  const t = useTranslations('actions')

  useEffect(() => {
    if (!open) return
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  function callbackNext() {
    return returnTo || (typeof window !== 'undefined' ? window.location.href : '/account')
  }

  async function handleGoogle() {
    setError('')
    const origin = window.location.origin
    const next = callbackNext()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: origin + '/auth/callback?next=' + encodeURIComponent(next) },
    })
    if (error) setError(error.message)
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
        if (onAuthSuccess) await onAuthSuccess()
        onClose()
      } else if (mode === 'signup') {
        // Confirmation lands later in a fresh context, so resume-intent is moot —
        // send to /account by default, preserving only same-origin relative paths.
        let next = '/account'
        try {
          const u = new URL(callbackNext(), window.location.origin)
          if (u.origin === window.location.origin) next = u.pathname + u.search
        } catch { /* keep default */ }
        // Atlas-branded confirmation email via Resend (see app/api/auth/signup).
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, next }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || t('accountCreateError'))
        if (data.requiresEmailConfirmation === false) {
          // Email couldn't be sent, so the account was auto-confirmed — sign in now.
          const { error: signErr } = await supabase.auth.signInWithPassword({ email, password })
          if (signErr) throw signErr
          if (onAuthSuccess) await onAuthSuccess()
          onClose()
        } else {
          setMessage(t('checkEmailConfirm'))
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(42, 34, 24, 0.4)',
        backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: '#fff', borderRadius: 12,
          width: '100%', maxWidth: 420, maxHeight: '90vh', overflow: 'auto',
          boxShadow: '0 24px 64px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
          border: '1px solid rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ padding: '28px 28px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <p style={{
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 10,
              color: 'var(--color-sage)', textTransform: 'uppercase',
              letterSpacing: '0.18em', marginBottom: 8, lineHeight: 1,
            }}>
              {mode === 'signup' ? t('createAccount') : t('signIn')}
            </p>
            <p style={{
              fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 20,
              color: 'var(--color-ink)', lineHeight: 1.3, margin: 0,
            }}>
              {mode === 'signup' ? t('joinAtlas') : t('welcomeBack')}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t('close')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-muted)', padding: 4, marginTop: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div style={{ padding: '24px 28px 28px' }}>
          <button
            onClick={handleGoogle}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '0.75rem', padding: '0.7rem 1rem', borderRadius: 8,
              border: '1px solid var(--color-border)', background: '#fff',
              fontFamily: 'var(--font-body)', fontSize: '0.9rem',
              color: 'var(--color-ink)', cursor: 'pointer',
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
            {t('continueWithGoogle')}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1.25rem 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-muted)' }}>
              {t('orWithEmail')}
            </span>
            <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
          </div>

          <form onSubmit={handleSubmit}>
            <label style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-muted)', marginBottom: 6 }}>
              {t('emailLabel')}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={{
                width: '100%', padding: '0.65rem 0.85rem', borderRadius: 8,
                border: '1px solid var(--color-border)', fontFamily: 'var(--font-body)',
                fontSize: '0.9rem', color: 'var(--color-ink)', background: '#fff',
                outline: 'none', boxSizing: 'border-box', marginBottom: '0.85rem',
              }}
            />

            <label style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-muted)', marginBottom: 6 }}>
              {t('passwordLabel')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              style={{
                width: '100%', padding: '0.65rem 0.85rem', borderRadius: 8,
                border: '1px solid var(--color-border)', fontFamily: 'var(--font-body)',
                fontSize: '0.9rem', color: 'var(--color-ink)', background: '#fff',
                outline: 'none', boxSizing: 'border-box', marginBottom: '1rem',
              }}
            />

            {error && (
              <div style={{ padding: '0.55rem 0.8rem', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontFamily: 'var(--font-body)', fontSize: '0.8rem', marginBottom: '0.85rem' }}>
                {error}
              </div>
            )}
            {message && (
              <div style={{ padding: '0.55rem 0.8rem', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontFamily: 'var(--font-body)', fontSize: '0.8rem', marginBottom: '0.85rem' }}>
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '0.7rem 1rem', borderRadius: 8, border: 'none',
                background: 'var(--color-sage)', color: '#fff',
                fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? t('pleaseWait') : mode === 'signup' ? t('createAccount') : t('signIn')}
            </button>
          </form>

          <div style={{ marginTop: '1rem', textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-muted)' }}>
            {mode === 'login' ? (
              <button
                onClick={() => { setMode('signup'); setError(''); setMessage('') }}
                style={{ background: 'none', border: 'none', color: 'var(--color-sage)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}
              >
                {t('needAccount')}
              </button>
            ) : (
              <button
                onClick={() => { setMode('login'); setError(''); setMessage('') }}
                style={{ background: 'none', border: 'none', color: 'var(--color-sage)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}
              >
                {t('haveAccount')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
