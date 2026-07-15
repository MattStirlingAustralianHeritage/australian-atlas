'use client'

import { useEffect, useState } from 'react'
import {
  Card, PageHeader, SectionTitle, EmptyState, Button, SkeletonPage, fmtDate,
} from '@/components/press/ui'

// Requests — the working line to the press desk: interviews with operators,
// custom data pulls, comment, images. Tracked with statuses so nothing
// vanishes into an inbox.

const TYPES = [
  ['interview', 'Interview / introduction', 'We connect you with the owner or maker directly — they’ve listed with us, we know how to reach them.'],
  ['data', 'Data pull', 'A custom cut of atlas data: time series, comparisons, a region we haven’t published yet.'],
  ['comment', 'Comment / background', 'A quote or background from Australian Atlas on the independent economy.'],
  ['images', 'Images', 'We broker image requests with venues — the fast route to print-quality photos with clean rights.'],
  ['other', 'Something else', 'If it helps you cover independents, ask.'],
]

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

const STATUS_STYLE = {
  new: { label: 'Received', color: 'var(--color-gold)' },
  in_progress: { label: 'In hand', color: 'var(--color-sage-dark)' },
  closed: { label: 'Done', color: 'var(--color-muted)' },
}

export default function PressRequestsPage() {
  const [data, setData] = useState(null)
  const [form, setForm] = useState({ requestType: 'interview', subject: '', message: '', deadline: '' })
  const [state, setState] = useState('idle')

  async function load() {
    const res = await fetch('/api/press/data?view=requests')
    if (res.ok) setData(await res.json())
  }

  useEffect(() => { load() }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setState('sending')
    try {
      const res = await fetch('/api/press/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, deadline: form.deadline || null }),
      })
      if (res.ok) {
        setForm({ requestType: 'interview', subject: '', message: '', deadline: '' })
        setState('done')
        await load()
        setTimeout(() => setState('idle'), 3000)
      } else {
        setState('error')
      }
    } catch {
      setState('error')
    }
  }

  if (!data) return <SkeletonPage />

  const requests = data.requests || []
  const activeType = TYPES.find(([v]) => v === form.requestType)

  return (
    <div>
      <PageHeader
        title="Requests"
        subtitle="On deadline? Ask here. Interviews, data pulls, comment, images — we reply the same business day."
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, marginBottom: '1.9rem' }}>
        {/* New request */}
        <Card style={{ padding: '1.3rem 1.4rem' }}>
          <SectionTitle>New request</SectionTitle>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '0.9rem' }}>
              <label htmlFor="pr-type" style={LABEL_STYLE}>What do you need?</label>
              <select
                id="pr-type"
                value={form.requestType}
                onChange={e => setForm(f => ({ ...f, requestType: e.target.value }))}
                style={{ ...INPUT_STYLE, appearance: 'auto' }}
              >
                {TYPES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
              {activeType && (
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.74rem', color: 'var(--color-muted)', lineHeight: 1.5, margin: '0.35rem 0 0' }}>
                  {activeType[2]}
                </p>
              )}
            </div>

            <div style={{ marginBottom: '0.9rem' }}>
              <label htmlFor="pr-subject" style={LABEL_STYLE}>Subject</label>
              <input
                id="pr-subject" required value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                style={INPUT_STYLE} placeholder="e.g. Interview with a third-generation oyster farmer on the south coast"
              />
            </div>

            <div style={{ marginBottom: '0.9rem' }}>
              <label htmlFor="pr-message" style={LABEL_STYLE}>The detail</label>
              <textarea
                id="pr-message" required rows={4} value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                style={{ ...INPUT_STYLE, resize: 'vertical' }}
                placeholder="What's the story, what do you need from us, and in what form?"
              />
            </div>

            <div style={{ marginBottom: '1.1rem' }}>
              <label htmlFor="pr-deadline" style={LABEL_STYLE}>Deadline <span style={{ fontWeight: 400 }}>(optional — helps us triage)</span></label>
              <input
                id="pr-deadline" type="date" value={form.deadline}
                onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                style={INPUT_STYLE}
              />
            </div>

            {state === 'error' && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-accent)', margin: '0 0 0.8rem' }}>
                Something went wrong — try again or email editor@australianatlas.com.au.
              </p>
            )}
            {state === 'done' && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-sage-dark)', margin: '0 0 0.8rem' }}>
                Request received — we&apos;ll come back to you by email.
              </p>
            )}

            <Button type="submit" variant="primary" disabled={state === 'sending'} onClick={() => {}}>
              {state === 'sending' ? 'Sending…' : 'Send to the press desk'}
            </Button>
          </form>
        </Card>

        {/* My requests */}
        <Card style={{ padding: '1.3rem 1.4rem' }}>
          <SectionTitle>Your requests</SectionTitle>
          {requests.length === 0 ? (
            <EmptyState title="Nothing yet">
              Requests you send appear here with their status, so nothing gets lost.
            </EmptyState>
          ) : (
            requests.map(r => {
              const st = STATUS_STYLE[r.status] || STATUS_STYLE.new
              return (
                <div key={r.id} style={{ padding: '0.7rem 0', borderBottom: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'baseline' }}>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', fontWeight: 550, color: 'var(--color-ink)', margin: 0 }}>
                      {r.subject}
                    </p>
                    <span style={{
                      fontFamily: 'var(--font-body)', fontSize: '0.66rem', fontWeight: 700,
                      letterSpacing: '0.07em', textTransform: 'uppercase', color: st.color,
                      border: `1px solid color-mix(in srgb, currentColor 40%, transparent)`,
                      borderRadius: 999, padding: '0.14rem 0.55rem', flexShrink: 0,
                    }}>
                      {st.label}
                    </span>
                  </div>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.74rem', color: 'var(--color-muted)', margin: '0.2rem 0 0' }}>
                    {(TYPES.find(([v]) => v === r.request_type) || TYPES[4])[1]} · sent {fmtDate(r.created_at)}
                    {r.deadline ? ` · deadline ${fmtDate(r.deadline)}` : ''}
                  </p>
                </div>
              )
            })
          )}
        </Card>
      </div>
    </div>
  )
}
