'use client'

import { useCouncil } from '../layout'
import { useState, useEffect, useCallback } from 'react'
import { Card, PageHeader, SectionTitle, EmptyState, Button, Skeleton } from '@/components/council/ui'

// Content co-creation. Councils draft itineraries, editorial ideas, picks and
// events, then submit them to the Atlas editorial desk. The desk reviews,
// shapes and publishes — the network's voice stays curated.

const TYPES = [
  { key: 'itinerary', label: 'Itinerary', hint: 'A day or weekend route through your region — the stops, the order, the story.' },
  { key: 'editorial', label: 'Editorial idea', hint: 'A story worth telling: a maker, a street, a season, an anniversary.' },
  { key: 'pick', label: 'Regional pick', hint: 'A place you think deserves the spotlight, and why.' },
  { key: 'event', label: 'Event', hint: 'A festival, market or happening visitors should know about.' },
]
const TYPE_LABELS = Object.fromEntries(TYPES.map(t => [t.key, t.label]))

export default function CouncilContent() {
  const { council, regions } = useCouncil()
  const [content, setContent] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | {} (new) | row (edit)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    fetch('/api/council/data?view=content')
      .then(r => r.json())
      .then(d => { setContent(d.content || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  if (!council) return null

  async function save(form) {
    setBusy(true)
    setError(null)
    const isNew = !form.id
    const res = await fetch('/api/council/content', {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    }).catch(() => null)
    setBusy(false)
    if (!res?.ok) {
      const d = await res?.json().catch(() => null)
      setError(d?.error || 'Could not save — please try again.')
      return
    }
    setEditing(null)
    load()
  }

  async function act(id, action) {
    setBusy(true)
    await fetch('/api/council/content', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    }).catch(() => null)
    setBusy(false)
    load()
  }

  async function remove(id) {
    if (!window.confirm('Delete this draft? This can’t be undone.')) return
    setBusy(true)
    await fetch(`/api/council/content?id=${id}`, { method: 'DELETE' }).catch(() => null)
    setBusy(false)
    load()
  }

  return (
    <div>
      <PageHeader
        title="Content"
        subtitle="Propose itineraries, stories, picks and events for your region. Our editorial desk reviews every submission and works with you to publish it across the Atlas."
      >
        {!editing && <Button onClick={() => setEditing({})} small>+ New draft</Button>}
      </PageHeader>

      {editing ? (
        <Editor
          initial={editing}
          regions={regions}
          busy={busy}
          error={error}
          onCancel={() => { setEditing(null); setError(null) }}
          onSave={save}
        />
      ) : loading ? (
        <Skeleton height={260} />
      ) : content.length === 0 ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            {TYPES.map(t => (
              <Card
                key={t.key}
                hover
                style={{ cursor: 'pointer', padding: '1.25rem 1.4rem' }}
              >
                <div onClick={() => setEditing({ content_type: t.key })}>
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.02rem', color: 'var(--color-ink)', margin: '0 0 0.3rem' }}>
                    {t.label}
                  </p>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-muted)', lineHeight: 1.5, margin: 0 }}>
                    {t.hint}
                  </p>
                </div>
              </Card>
            ))}
          </div>
          <EmptyState title="Nothing drafted yet">
            Start with any of the formats above — a rough draft is plenty; our editorial team shapes it with you.
          </EmptyState>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {content.map(item => {
            const submitted = !!item.metadata?.submitted_at
            const isDraft = item.status === 'draft'
            const region = regions.find(r => r.id === item.region_id)
            return (
              <Card key={item.id} style={{ padding: '1.2rem 1.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-sage-dark)', margin: '0 0 0.25rem' }}>
                      {TYPE_LABELS[item.content_type] || item.content_type}
                      {region ? <span style={{ color: 'var(--color-muted)', fontWeight: 500 }}> · {region.name}</span> : null}
                    </p>
                    <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.08rem', color: 'var(--color-ink)', margin: '0 0 0.25rem' }}>
                      {item.title}
                    </p>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--color-muted)', margin: 0 }}>
                      Updated {new Date(item.updated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <StatusBadge status={item.status} submitted={submitted} />
                    {isDraft && !submitted && (
                      <>
                        <Button variant="secondary" small onClick={() => setEditing(item)}>Edit</Button>
                        <Button variant="sage" small disabled={busy} onClick={() => act(item.id, 'submit')}>Submit to editorial</Button>
                        <Button variant="ghost" small disabled={busy} onClick={() => remove(item.id)}>Delete</Button>
                      </>
                    )}
                    {isDraft && submitted && (
                      <Button variant="secondary" small disabled={busy} onClick={() => act(item.id, 'withdraw')}>Withdraw</Button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--color-muted)', margin: '0.5rem 0 0' }}>
            Submitted drafts go to the Atlas editorial desk — we&apos;ll come back to you before anything is published.
          </p>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status, submitted }) {
  const cfg = status === 'published'
    ? { label: 'Published', bg: 'rgba(95,138,126,0.16)', color: 'var(--color-sage-dark)' }
    : status === 'archived'
      ? { label: 'Archived', bg: 'rgba(28,26,23,0.08)', color: 'var(--color-muted)' }
      : submitted
        ? { label: 'With editorial desk', bg: 'rgba(196,151,59,0.18)', color: '#8a6a24' }
        : { label: 'Draft', bg: 'rgba(28,26,23,0.07)', color: 'var(--color-muted)' }
  return (
    <span style={{
      fontFamily: 'var(--font-body)', fontSize: '0.68rem', fontWeight: 700,
      letterSpacing: '0.05em', textTransform: 'uppercase',
      padding: '0.22rem 0.6rem', borderRadius: 999,
      background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap',
    }}>
      {cfg.label}
    </span>
  )
}

function Editor({ initial, regions, busy, error, onCancel, onSave }) {
  const [form, setForm] = useState({
    id: initial.id || null,
    title: initial.title || '',
    body: initial.body || '',
    content_type: initial.content_type || 'itinerary',
    region_slug: regions.find(r => r.id === initial.region_id)?.slug || regions[0]?.slug || '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const type = TYPES.find(t => t.key === form.content_type)

  return (
    <Card>
      <SectionTitle note={type?.hint}>
        {form.id ? 'Edit draft' : 'New draft'}
      </SectionTitle>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <label style={labelStyle}>
            Type
            <select value={form.content_type} onChange={e => set('content_type', e.target.value)} style={inputStyle}>
              {TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </label>
          {regions.length > 0 && (
            <label style={labelStyle}>
              Region
              <select value={form.region_slug} onChange={e => set('region_slug', e.target.value)} style={inputStyle}>
                {regions.map(r => <option key={r.slug} value={r.slug}>{r.name}</option>)}
              </select>
            </label>
          )}
        </div>

        <label style={labelStyle}>
          Title
          <input
            type="text"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder={form.content_type === 'itinerary' ? 'e.g. A slow Saturday in the Tamar Valley' : 'Give it a working title'}
            style={inputStyle}
            maxLength={200}
          />
        </label>

        <label style={labelStyle}>
          Draft
          <textarea
            value={form.body}
            onChange={e => set('body', e.target.value)}
            rows={10}
            placeholder="Rough is fine — the places, the order, the why. Our editorial team does the polishing with you."
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
            maxLength={20000}
          />
        </label>

        {error && (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--color-accent)', margin: 0 }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <Button disabled={busy || !form.title.trim()} onClick={() => onSave(form)}>
            {busy ? 'Saving…' : 'Save draft'}
          </Button>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
        </div>
      </div>
    </Card>
  )
}

const labelStyle = {
  display: 'flex', flexDirection: 'column', gap: '0.35rem',
  fontFamily: 'var(--font-body)', fontSize: '0.78rem', fontWeight: 600,
  color: 'var(--color-ink)', textTransform: 'uppercase', letterSpacing: '0.05em',
}
const inputStyle = {
  fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 400,
  textTransform: 'none', letterSpacing: 0,
  padding: '0.6rem 0.75rem', borderRadius: 10,
  border: '1px solid var(--color-border)', background: '#fff', color: 'var(--color-ink)',
}
