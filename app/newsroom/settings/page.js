'use client'

import { useEffect, useState } from 'react'
import {
  Card, PageHeader, SectionTitle, Button, SkeletonPage, verticalName,
} from '@/components/press/ui'
import { getPublicVerticals } from '@/lib/verticalUrl'

// Settings — who you are, how fast news reaches you, your beats, the
// calendar feed, beta feedback, and the exit (unsubscribe is one click from
// any email; deleting the account really deletes it).

const VERTICALS = getPublicVerticals()

const INPUT_STYLE = {
  width: '100%', padding: '0.55rem 0.7rem', borderRadius: 10,
  border: '1px solid var(--color-border)', fontFamily: 'var(--font-body)',
  fontSize: '0.88rem', color: 'var(--color-ink)', background: 'var(--color-card-bg)',
  outline: 'none', boxSizing: 'border-box',
}

const LABEL_STYLE = {
  display: 'block', fontFamily: 'var(--font-body)', fontSize: '0.8rem',
  fontWeight: 550, color: 'var(--color-muted)', marginBottom: '0.3rem',
}

const CADENCES = [
  ['instant', 'Instant', 'An email within the hour of an event going live in your regions. Best for news desks.'],
  ['daily', 'Daily briefing', 'One email at 7am with everything from the last day.'],
  ['weekly', 'Weekly briefing', 'One email on Monday morning with the week ahead.'],
  ['off', 'Off', 'No emails — the newsdesk still collects everything.'],
]

function Toggle({ checked, onChange, label, sub }) {
  return (
    <label style={{ display: 'flex', gap: '0.7rem', alignItems: 'flex-start', cursor: 'pointer', padding: '0.45rem 0' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--color-sage)' }} />
      <span>
        <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: '0.88rem', fontWeight: 550, color: 'var(--color-ink)' }}>{label}</span>
        {sub && <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--color-muted)', lineHeight: 1.5 }}>{sub}</span>}
      </span>
    </label>
  )
}

export default function PressSettingsPage() {
  const [data, setData] = useState(null)
  const [form, setForm] = useState(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [feedbackState, setFeedbackState] = useState('idle')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/press/data?view=settings')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        setData(d)
        setForm({
          name: d.press.name || '',
          outlet: d.press.outlet || '',
          roleTitle: d.press.role_title || '',
          website: d.press.website || '',
          cadence: d.press.cadence,
          notifyEvents: d.press.notify_events,
          notifyListings: d.press.notify_listings,
          notifyLeads: d.press.notify_leads,
          beatVerticals: d.press.beat_verticals || [],
        })
      })
  }, [])

  if (!data || !form) return <SkeletonPage />

  function set(key, value) {
    setForm(f => ({ ...f, [key]: value }))
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/press/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      }
    } finally {
      setSaving(false)
    }
  }

  async function sendFeedback(e) {
    e.preventDefault()
    setFeedbackState('sending')
    try {
      const res = await fetch('/api/press/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'beta', message: feedback, page: '/newsroom/settings' }),
      })
      if (res.ok) {
        setFeedback('')
        setFeedbackState('done')
        setTimeout(() => setFeedbackState('idle'), 3000)
      } else {
        setFeedbackState('error')
      }
    } catch {
      setFeedbackState('error')
    }
  }

  async function deleteAccount() {
    const res = await fetch('/api/press/settings', { method: 'DELETE' })
    if (res.ok) window.location.href = '/for-press'
  }

  async function copyFeed() {
    try {
      await navigator.clipboard.writeText(data.icsUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle={`Signed in as ${data.press.contact_email}.`} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, marginBottom: '1.4rem' }}>
        {/* Profile */}
        <Card style={{ padding: '1.3rem 1.4rem' }}>
          <SectionTitle>You and your outlet</SectionTitle>
          <div style={{ display: 'grid', gap: '0.9rem' }}>
            <div>
              <label htmlFor="ps-name" style={LABEL_STYLE}>Your name</label>
              <input id="ps-name" value={form.name} onChange={e => set('name', e.target.value)} style={INPUT_STYLE} />
            </div>
            <div>
              <label htmlFor="ps-outlet" style={LABEL_STYLE}>Outlet</label>
              <input id="ps-outlet" value={form.outlet} onChange={e => set('outlet', e.target.value)} style={INPUT_STYLE} />
            </div>
            <div>
              <label htmlFor="ps-role" style={LABEL_STYLE}>Role / title</label>
              <input id="ps-role" value={form.roleTitle} onChange={e => set('roleTitle', e.target.value)} style={INPUT_STYLE} placeholder="e.g. Editor" />
            </div>
            <div>
              <label htmlFor="ps-web" style={LABEL_STYLE}>Website</label>
              <input id="ps-web" value={form.website} onChange={e => set('website', e.target.value)} style={INPUT_STYLE} placeholder="https://…" />
            </div>
          </div>
        </Card>

        {/* Notifications */}
        <Card style={{ padding: '1.3rem 1.4rem' }}>
          <SectionTitle note="one email at a time — never a stream of pings">Notifications</SectionTitle>
          <div role="radiogroup" aria-label="Notification pace" style={{ marginBottom: '1rem' }}>
            {CADENCES.map(([value, label, sub]) => (
              <label key={value} style={{ display: 'flex', gap: '0.7rem', alignItems: 'flex-start', cursor: 'pointer', padding: '0.45rem 0' }}>
                <input
                  type="radio" name="cadence" value={value}
                  checked={form.cadence === value}
                  onChange={() => set('cadence', value)}
                  style={{ marginTop: 3, accentColor: 'var(--color-sage)' }}
                />
                <span>
                  <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: '0.88rem', fontWeight: 550, color: 'var(--color-ink)' }}>{label}</span>
                  <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--color-muted)', lineHeight: 1.5 }}>{sub}</span>
                </span>
              </label>
            ))}
          </div>
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.6rem' }}>
            <Toggle checked={form.notifyEvents} onChange={v => set('notifyEvents', v)} label="New events" sub="When a listed place publishes an event in a followed region." />
            <Toggle checked={form.notifyLeads} onChange={v => set('notifyLeads', v)} label="Story leads" sub="When our desk posts a lead for your regions or the whole network." />
            <Toggle checked={form.notifyListings} onChange={v => set('notifyListings', v)} label="New places roundup" sub="In daily/weekly briefings only — never as instant pings." />
          </div>
        </Card>
      </div>

      {/* Beats */}
      <Card style={{ padding: '1.3rem 1.4rem', marginBottom: '1.4rem' }}>
        <SectionTitle note="tick nothing to hear about everything">Your beats</SectionTitle>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-muted)', lineHeight: 1.55, margin: '0 0 0.8rem' }}>
          A food writer doesn&apos;t need gallery openings. Pick beats and event notifications only cover those atlases
          (events without a category tag always come through).
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {VERTICALS.map(key => {
            const on = form.beatVerticals.includes(key)
            return (
              <button
                key={key}
                onClick={() => set('beatVerticals', on ? form.beatVerticals.filter(k => k !== key) : [...form.beatVerticals, key])}
                style={{
                  fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                  borderRadius: 999, padding: '0.35rem 0.9rem',
                  background: on ? 'var(--color-sage)' : 'transparent',
                  color: on ? '#fff' : 'var(--color-muted)',
                  border: on ? '1px solid transparent' : '1px solid var(--color-border)',
                }}
              >
                {verticalName(key)}
              </button>
            )
          })}
        </div>
      </Card>

      {/* Save bar */}
      <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', marginBottom: '1.9rem' }}>
        <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
        {saved && <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--color-sage-dark)' }}>Saved ✓</span>}
      </div>

      {/* Calendar feed */}
      <Card style={{ padding: '1.3rem 1.4rem', marginBottom: '1.4rem' }}>
        <SectionTitle>Your calendar feed</SectionTitle>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--color-muted)', lineHeight: 1.6, margin: '0 0 0.7rem' }}>
          A live iCal feed of every upcoming event in the regions you follow. Paste it into Google Calendar,
          Apple Calendar or Outlook as a calendar subscription and it stays current on its own. The link is
          personal to you — treat it like a password.
        </p>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <code style={{
            fontFamily: 'ui-monospace, monospace', fontSize: '0.72rem', color: 'var(--color-ink)',
            background: 'var(--color-cream)', border: '1px solid var(--color-border)', borderRadius: 8,
            padding: '0.45rem 0.7rem', overflowX: 'auto', maxWidth: '100%', whiteSpace: 'nowrap', flex: 1, minWidth: 220,
          }}>
            {data.icsUrl}
          </code>
          <Button variant="secondary" small onClick={copyFeed}>{copied ? 'Copied ✓' : 'Copy'}</Button>
        </div>
      </Card>

      {/* Beta feedback */}
      <Card style={{ padding: '1.3rem 1.4rem', marginBottom: '1.4rem' }}>
        <SectionTitle note="this is a beta — what you say shapes it">Tell us what&apos;s missing</SectionTitle>
        <form onSubmit={sendFeedback}>
          <textarea
            rows={3} required value={feedback} onChange={e => setFeedback(e.target.value)}
            style={{ ...INPUT_STYLE, resize: 'vertical', marginBottom: '0.8rem' }}
            placeholder="What would make the newsroom genuinely useful for your desk?"
          />
          <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
            <Button type="submit" variant="secondary" small disabled={feedbackState === 'sending'} onClick={() => {}}>
              {feedbackState === 'sending' ? 'Sending…' : 'Send feedback'}
            </Button>
            {feedbackState === 'done' && <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-sage-dark)' }}>Thank you — received.</span>}
            {feedbackState === 'error' && <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-accent)' }}>Didn&apos;t send — try again?</span>}
          </div>
        </form>
      </Card>

      {/* Danger zone */}
      <Card style={{ padding: '1.3rem 1.4rem', border: '1px solid rgba(196,96,58,0.3)' }}>
        <SectionTitle>Leave the newsroom</SectionTitle>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--color-muted)', lineHeight: 1.6, margin: '0 0 0.8rem' }}>
          Deleting your account removes your profile, region follows, activity and notification history —
          immediately and for good. Any requests already with the desk are kept as work items, minus your details.
        </p>
        {confirmDelete ? (
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-accent)' }}>
              This can&apos;t be undone — sure?
            </span>
            <button
              onClick={deleteAccount}
              style={{
                fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 650, cursor: 'pointer',
                background: 'var(--color-accent)', color: '#fff', border: 'none',
                borderRadius: 999, padding: '0.4rem 1rem',
              }}
            >
              Yes, delete my account
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              style={{
                fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                background: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border)',
                borderRadius: 999, padding: '0.4rem 1rem',
              }}
            >
              Keep it
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            style={{
              fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
              background: 'transparent', color: 'var(--color-accent)',
              border: '1px solid rgba(196,96,58,0.4)',
              borderRadius: 999, padding: '0.4rem 1rem',
            }}
          >
            Delete my account
          </button>
        )}
      </Card>
    </div>
  )
}
