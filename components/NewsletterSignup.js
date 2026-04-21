'use client'

import { useState } from 'react'

export default function NewsletterSignup({ variant = 'inline' }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email || status === 'loading') return
    setStatus('loading')
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (res.ok) {
        setStatus('success')
        setEmail('')
      } else {
        const data = await res.json().catch(() => ({}))
        setStatus(data.error === 'already_subscribed' ? 'success' : 'error')
      }
    } catch {
      setStatus('error')
    }
  }

  const isHomepage = variant === 'homepage'
  const isFooter = variant === 'footer'

  if (status === 'success') {
    return (
      <div style={{
        padding: isFooter ? '0' : '2rem 0',
        fontFamily: 'var(--font-body)',
        fontSize: '14px',
        color: isHomepage ? '#C4973B' : 'var(--color-sage)',
        fontWeight: 400,
      }}>
        You&apos;re on the list. Welcome to the Atlas.
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{
      padding: isFooter ? '0' : isHomepage ? '0' : '2rem 0',
    }}>
      {!isFooter && !isHomepage && (
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '14px',
          fontWeight: 400,
          color: 'var(--color-muted)',
          marginBottom: '0.75rem',
        }}>
          New places, editorial, and quiet finds — delivered monthly.
        </p>
      )}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        maxWidth: isHomepage ? '480px' : '420px',
        margin: isHomepage ? '0 auto' : undefined,
        justifyContent: isHomepage ? 'center' : undefined,
      }}>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          style={{
            flex: 1,
            padding: '0.625rem 0.875rem',
            borderRadius: '8px',
            border: '1px solid var(--color-border)',
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            color: isFooter ? '#FAF8F4' : 'var(--color-ink)',
            background: isFooter ? 'rgba(250,248,244,0.08)' : isHomepage ? '#fff' : 'var(--color-bg)',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          style={{
            padding: '0.625rem 1.25rem',
            borderRadius: '8px',
            border: 'none',
            background: (isHomepage || isFooter) ? '#C4973B' : 'var(--color-ink)',
            color: '#fff',
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            fontWeight: 500,
            cursor: status === 'loading' ? 'wait' : 'pointer',
            opacity: status === 'loading' ? 0.6 : 1,
            transition: 'opacity 0.15s',
            whiteSpace: 'nowrap',
          }}
        >
          {status === 'loading' ? 'Joining...' : 'Subscribe'}
        </button>
      </div>
      {status === 'error' && (
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '12px',
          color: '#c44',
          marginTop: '0.5rem',
        }}>
          Something went wrong. Please try again.
        </p>
      )}
    </form>
  )
}
