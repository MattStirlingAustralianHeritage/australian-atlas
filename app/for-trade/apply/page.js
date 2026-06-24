'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getAuthSupabase } from '@/lib/supabase/auth-clients'
import AuthModal from '@/components/AuthModal'
import { TRADE_AUP_POINTS, TRADE_ACCOUNT_TYPES } from '@/lib/trade/config'

export default function ApplyForTradePage() {
  const router = useRouter()
  const supabase = getAuthSupabase()

  const [phase, setPhase] = useState('loading') // loading | signin | form | submitting
  const [user, setUser] = useState(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [error, setError] = useState(null)

  const [orgName, setOrgName] = useState('')
  const [contactName, setContactName] = useState('')
  const [accountType, setAccountType] = useState('tour_operator')
  const [acceptAup, setAcceptAup] = useState(false)

  // Resolve session → existing account → form/sign-in.
  useEffect(() => {
    let active = true
    async function resolve() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!active) return
      if (!user) { setPhase('signin'); return }
      setUser(user)
      setContactName(user.user_metadata?.full_name || '')
      try {
        const res = await fetch('/api/trade/account')
        const data = await res.json()
        if (!active) return
        if (data.account) { router.replace('/trade/builder'); return }
      } catch { /* fall through to form */ }
      if (active) setPhase('form')
    }
    resolve()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) resolve()
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!orgName.trim()) { setError('Please tell us your organisation name.'); return }
    if (!acceptAup) { setError('Please accept the terms to continue — it is the only gate.'); return }
    setPhase('submitting')
    try {
      const res = await fetch('/api/trade/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_name: orgName.trim(),
          contact_name: contactName.trim() || null,
          account_type: accountType,
          accept_aup: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not create your account')
      router.push('/trade/builder')
    } catch (err) {
      setError(err.message)
      setPhase('form')
    }
  }

  const wrap = { background: 'var(--color-bg)', minHeight: '100vh' }
  const inner = { maxWidth: 560, margin: '0 auto', padding: '4rem 1.5rem 6rem' }
  const label = { fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, color: 'var(--color-ink)', display: 'block', marginBottom: 6 }
  const input = {
    width: '100%', fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink)',
    padding: '11px 13px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'white', boxSizing: 'border-box',
  }

  return (
    <div style={wrap}>
      <div style={inner}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-gold)', marginBottom: 12 }}>
          Atlas Trade · Founding beta
        </p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(26px,4vw,36px)', fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.2, marginBottom: 12 }}>
          Join the founding cohort
        </h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.6, marginBottom: 32 }}>
          Free during beta. Accepting the terms is the only step — there is no payment.
        </p>

        {phase === 'loading' && (
          <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}>Checking your account…</p>
        )}

        {phase === 'signin' && (
          <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 12, padding: 28 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400, color: 'var(--color-ink)', marginBottom: 8 }}>
              First, sign in
            </h2>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 300, color: 'var(--color-muted)', lineHeight: 1.6, marginBottom: 18 }}>
              Atlas Trade is tied to your Australian Atlas account. Sign in or create one — it takes a moment — then you&apos;ll accept the trade terms.
            </p>
            <button
              onClick={() => setAuthOpen(true)}
              style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--color-ink)', background: 'var(--color-gold)', border: 'none', padding: '12px 26px', borderRadius: 99, cursor: 'pointer' }}
            >
              Sign in to continue
            </button>
          </div>
        )}

        {(phase === 'form' || phase === 'submitting') && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label style={label} htmlFor="org">Organisation name</label>
              <input id="org" style={input} value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="e.g. Southern Crossings" required />
            </div>
            <div>
              <label style={label} htmlFor="contact">Your name</label>
              <input id="contact" style={input} value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <label style={label} htmlFor="type">What kind of business?</label>
              <select id="type" style={input} value={accountType} onChange={(e) => setAccountType(e.target.value)}>
                {TRADE_ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* AUP acceptance — the gate */}
            <div style={{ background: 'var(--color-cream)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20 }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', margin: '0 0 12px' }}>
                Acceptable use & attribution
              </p>
              <ul style={{ margin: '0 0 16px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {TRADE_AUP_POINTS.map((p, i) => (
                  <li key={i} style={{ display: 'flex', gap: 8, fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 300, color: 'var(--color-ink)', lineHeight: 1.5 }}>
                    <span style={{ color: 'var(--color-gold)', flexShrink: 0 }}>&#10003;</span>
                    {p}
                  </li>
                ))}
              </ul>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={acceptAup} onChange={(e) => setAcceptAup(e.target.checked)} style={{ marginTop: 3 }} />
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.5 }}>
                  I accept these terms and the &ldquo;Curated via Atlas&rdquo; attribution requirement on behalf of my organisation.
                </span>
              </label>
            </div>

            {error && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: '#b3261e', margin: 0 }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={phase === 'submitting'}
              style={{
                fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600,
                color: 'var(--color-ink)', background: 'var(--color-gold)', border: 'none',
                padding: '14px 28px', borderRadius: 99, cursor: phase === 'submitting' ? 'default' : 'pointer',
                opacity: phase === 'submitting' ? 0.6 : 1, alignSelf: 'flex-start',
              }}
            >
              {phase === 'submitting' ? 'Setting up…' : 'Accept & open the builder'}
            </button>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)', margin: 0 }}>
              Prefer to talk first? <Link href="/for-trade" style={{ color: 'var(--color-gold)' }}>Back to the overview</Link>.
            </p>
          </form>
        )}
      </div>

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthSuccess={() => setAuthOpen(false)}
        returnTo={typeof window !== 'undefined' ? `${window.location.origin}/for-trade/apply` : undefined}
      />
    </div>
  )
}
