'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

export default function NewsletterSignup({ variant = 'inline' }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle')
  const t = useTranslations('actions')

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
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        // pending = double opt-in confirmation email sent; otherwise already confirmed.
        setStatus(data.pending ? 'pending' : 'success')
        setEmail('')
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  const isHomepage = variant === 'homepage'
  const isFooter = variant === 'footer'

  if (status === 'success' || status === 'pending') {
    return (
      <div style={{
        padding: isFooter ? '0' : isHomepage ? '0.875rem 0' : '2rem 0',
        fontFamily: 'var(--font-body)',
        fontSize: '15px',
        textAlign: isHomepage ? 'center' : undefined,
        color: isHomepage ? 'var(--color-gold)' : 'var(--color-sage)',
        fontWeight: 400,
      }}>
        {status === 'pending'
          ? t('newsletterPending')
          : t('newsletterSuccess')}
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
          {t('newsletterBlurb')}
        </p>
      )}
      <div style={{
        display: 'flex',
        gap: isHomepage ? '0.625rem' : '0.5rem',
        maxWidth: isHomepage ? '460px' : '420px',
        margin: isHomepage ? '0 auto' : undefined,
        justifyContent: isHomepage ? 'center' : undefined,
      }}>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          aria-label={t('emailAddressAria')}
          style={{
            flex: 1,
            padding: isHomepage ? '0.875rem 1.125rem' : '0.625rem 0.875rem',
            borderRadius: isHomepage ? '10px' : '8px',
            border: isHomepage ? '1px solid rgba(250,248,244,0.16)' : '1px solid var(--color-border)',
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
            color: isFooter ? '#FAF8F4' : 'var(--color-ink)',
            background: isFooter ? 'rgba(250,248,244,0.08)' : isHomepage ? '#FAF8F4' : 'var(--color-bg)',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          style={{
            padding: isHomepage ? '0.875rem 1.625rem' : '0.625rem 1.25rem',
            borderRadius: isHomepage ? '10px' : '8px',
            border: 'none',
            background: (isHomepage || isFooter) ? 'var(--color-gold)' : 'var(--color-ink)',
            color: '#fff',
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
            fontWeight: 500,
            letterSpacing: '0.01em',
            cursor: status === 'loading' ? 'wait' : 'pointer',
            opacity: status === 'loading' ? 0.6 : 1,
            transition: 'opacity 0.15s',
            whiteSpace: 'nowrap',
          }}
        >
          {status === 'loading' ? t('joining') : t('subscribe')}
        </button>
      </div>
      {status === 'error' && (
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '12px',
          color: '#c44',
          marginTop: '0.5rem',
        }}>
          {t('newsletterError')}
        </p>
      )}
    </form>
  )
}
