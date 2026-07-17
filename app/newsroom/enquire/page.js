'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, Button } from '@/components/council/ui'

// Newsroom signup — self-serve. Submitting creates the press account there and
// then (POST /api/press/enquire provisions it) and emails a sign-in link; the
// press desk is notified but is not in the critical path. If provisioning can't
// complete, the form falls back to "we'll be in touch" via the `activated` flag.

const INPUT_STYLE = {
  width: '100%',
  padding: '0.6rem 0.75rem',
  borderRadius: 10,
  border: '1px solid var(--color-border)',
  fontFamily: 'var(--font-body)',
  fontSize: '0.92rem',
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

const OUTLET_TYPES = [
  ['newsletter', 'Newsletter / Substack'],
  ['local', 'Local / community paper'],
  ['regional', 'Regional title'],
  ['metro', 'Metro daily'],
  ['national', 'National masthead'],
  ['magazine', 'Magazine'],
  ['broadcast', 'Broadcast (TV / radio)'],
  ['podcast', 'Podcast'],
  ['online', 'Online publication'],
  ['freelance', 'Freelance journalist'],
  ['other', 'Something else'],
]

function BlockButton({ children, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Button {...props}>
        <span style={{ flex: 1, textAlign: 'center' }}>{children}</span>
      </Button>
    </div>
  )
}

export default function NewsroomEnquirePage() {
  const [form, setForm] = useState({ name: '', outlet: '', outletType: 'newsletter', email: '', regions: '', message: '' })
  const [state, setState] = useState('idle') // idle | sending | done | error
  const [activated, setActivated] = useState(false) // account provisioned vs held

  function set(key) {
    return (e) => setForm(f => ({ ...f, [key]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setState('sending')
    try {
      const res = await fetch('/api/press/enquire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) { setState('error'); return }
      const json = await res.json().catch(() => ({}))
      setActivated(!!json.activated)
      setState('done')
    } catch {
      setState('error')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', padding: '3.5rem 1.5rem 5rem' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <p style={{
              fontFamily: 'var(--font-display)', fontVariant: 'small-caps', fontSize: '1rem',
              fontWeight: 480, letterSpacing: '0.14em', color: 'var(--color-ink)', margin: '0 0 0.9rem',
            }}>
              Australian Atlas
            </p>
          </Link>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 420,
            letterSpacing: '-0.01em', lineHeight: 1.15, color: 'var(--color-ink)', margin: '0 0 0.6rem',
          }}>
            Create your newsroom account
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.92rem', color: 'var(--color-muted)', lineHeight: 1.55, margin: 0 }}>
            Free for working press of every size — a one-person newsletter counts.
            Your account is set up the moment you sign up — we email you a sign-in link, no waiting on us.
          </p>
        </div>

        {state === 'done' ? (
          <Card style={{ padding: '2rem', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--color-ink)', margin: '0 0 0.6rem' }}>
              {activated ? "You're in" : 'Request received'}
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--color-muted)', lineHeight: 1.6, margin: '0 0 1.25rem' }}>
              {activated ? (
                <>
                  Your newsroom account is live. We&apos;ve emailed a sign-in link to{' '}
                  <strong>{form.email}</strong> — sign in with that address any time, no password needed.
                </>
              ) : (
                <>
                  Thanks — we&apos;ll be in touch at <strong>{form.email}</strong>, usually the same business day.
                  Once you&apos;re set up you sign in with that address, no password needed.
                </>
              )}
            </p>
            <Link href="/newsroom/login" style={{ textDecoration: 'none' }}>
              <Button variant="primary">
                <span style={{ flex: 1, textAlign: 'center' }}>
                  {activated ? 'Sign in to the Newsroom' : 'Go to sign in'}
                </span>
              </Button>
            </Link>
          </Card>
        ) : (
          <Card style={{ padding: '1.75rem' }}>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label htmlFor="pe-name" style={LABEL_STYLE}>Your name</label>
                  <input id="pe-name" required value={form.name} onChange={set('name')} style={INPUT_STYLE} placeholder="Sam Byline" />
                </div>
                <div>
                  <label htmlFor="pe-outlet" style={LABEL_STYLE}>Outlet</label>
                  <input id="pe-outlet" required value={form.outlet} onChange={set('outlet')} style={INPUT_STYLE} placeholder="The Coastal Chronicle" />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label htmlFor="pe-type" style={LABEL_STYLE}>Outlet type</label>
                  <select id="pe-type" value={form.outletType} onChange={set('outletType')} style={{ ...INPUT_STYLE, appearance: 'auto' }}>
                    {OUTLET_TYPES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="pe-email" style={LABEL_STYLE}>Work email</label>
                  <input id="pe-email" type="email" required value={form.email} onChange={set('email')} style={INPUT_STYLE} placeholder="you@outlet.com.au" />
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label htmlFor="pe-regions" style={LABEL_STYLE}>What do you cover?</label>
                <input id="pe-regions" value={form.regions} onChange={set('regions')} style={INPUT_STYLE} placeholder="e.g. the Sapphire Coast and Eurobodalla; Australian food and drink" />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label htmlFor="pe-message" style={LABEL_STYLE}>Anything else? <span style={{ fontWeight: 400 }}>(optional)</span></label>
                <textarea id="pe-message" rows={3} value={form.message} onChange={set('message')} style={{ ...INPUT_STYLE, resize: 'vertical' }} placeholder="A link to your work is always welcome — it helps us tailor your leads." />
              </div>

              {state === 'error' && (
                <div style={{
                  padding: '0.625rem 0.875rem', borderRadius: 10, marginBottom: '1rem',
                  background: 'rgba(196,96,58,0.08)',
                  border: '1px solid rgba(196,96,58,0.3)',
                  color: 'var(--color-accent)', fontFamily: 'var(--font-body)', fontSize: '0.85rem',
                }}>
                  Something went wrong — please try again, or email editor@australianatlas.com.au.
                </div>
              )}

              <BlockButton type="submit" variant="primary" disabled={state === 'sending'}>
                {state === 'sending' ? 'Creating your account…' : 'Create my account'}
              </BlockButton>

              <p style={{
                fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--color-muted)',
                textAlign: 'center', marginTop: '1.25rem', marginBottom: 0, lineHeight: 1.5,
              }}>
                We only use your details to run your newsroom account — no marketing lists,
                unsubscribe or delete any time.
              </p>
            </form>
          </Card>
        )}

        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-muted)', margin: 0 }}>
            Already a member?{' '}
            <Link href="/newsroom/login" style={{ color: 'var(--color-sage-dark)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
              Sign in
            </Link>
            {' '}· Curious what you get?{' '}
            <Link href="/for-press" style={{ color: 'var(--color-sage-dark)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
              About For Press
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
