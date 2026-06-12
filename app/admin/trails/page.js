'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { VERTICAL_ACCENTS } from '@/lib/verticalUrl'

const STATUS_COLORS = {
  pitch: { bg: '#E8E3DA', text: '#4A4338' },
  draft: { bg: '#F5EFE2', text: '#5A4A2C' },
  in_review: { bg: '#FCE4B8', text: '#7A5520' },
  published: { bg: '#C4D8B8', text: '#2C5020' },
  archived: { bg: '#E8E5E0', text: '#5A5550' },
}

const VERTICAL_BG = VERTICAL_ACCENTS

function fmtDate(iso) { if (!iso) return ''; const d = new Date(iso); return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) }
function fmtKm(n) { return n == null ? '—' : `${Math.round(n)} km` }
function fmtMin(n) { if (n == null) return '—'; const h = Math.floor(n / 60), m = Math.round(n % 60); return h ? `${h}h ${m}m` : `${m}m` }

export default function AdminTrailsPage() {
  const router = useRouter()
  const [tab, setTab] = useState('pitches')
  const [pitches, setPitches] = useState([])
  const [drafts, setDrafts] = useState([])
  const [published, setPublished] = useState([])
  const [archived, setArchived] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const [pRes, dRes, pubRes, archRes] = await Promise.all([
      fetch('/api/admin/trails/pitches?status=open&limit=100'),
      fetch('/api/admin/trails?status=draft&limit=100'),
      fetch('/api/admin/trails?status=published&limit=100'),
      fetch('/api/admin/trails?status=archived&limit=100'),
    ])
    if (pRes.ok) setPitches((await pRes.json()).pitches || [])
    if (dRes.ok) setDrafts((await dRes.json()).trails || [])
    if (pubRes.ok) setPublished((await pubRes.json()).trails || [])
    if (archRes.ok) setArchived((await archRes.json()).trails || [])

    // also fetch in_review trails into drafts list (they're effectively part of the draft pipeline)
    const irRes = await fetch('/api/admin/trails?status=in_review&limit=100')
    if (irRes.ok) {
      const more = (await irRes.json()).trails || []
      setDrafts(prev => [...more, ...prev])
    }
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return (
    <div style={{ padding: '2rem 1.5rem', maxWidth: 1200, margin: '0 auto' }}>
      <header style={{ marginBottom: 24, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'var(--color-ink)', marginBottom: 4 }}>
            Trails
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)' }}>
            Editorial trails — pitch, draft, publish.
          </p>
        </div>
        <Link href="/admin/trails/pitch/new" style={{
          background: 'var(--color-ink)', color: 'var(--color-cream)',
          padding: '10px 18px', borderRadius: 4,
          fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
          textDecoration: 'none', whiteSpace: 'nowrap',
        }}>
          + New pitch
        </Link>
      </header>

      <nav style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--color-border)', paddingBottom: 0 }}>
        {[
          { id: 'pitches', label: `Pitches (${pitches.length})` },
          { id: 'drafts', label: `Drafts (${drafts.length})` },
          { id: 'published', label: `Published (${published.length})` },
          { id: 'archived', label: `Archived (${archived.length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 14px', border: 'none', background: 'transparent',
            fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
            color: tab === t.id ? 'var(--color-ink)' : 'var(--color-muted)',
            borderBottom: tab === t.id ? '2px solid var(--color-ink)' : '2px solid transparent',
            cursor: 'pointer', marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </nav>

      {loading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-muted)' }}>Loading…</div>}

      {!loading && tab === 'pitches' && (
        <PitchList items={pitches} />
      )}
      {!loading && tab === 'drafts' && (
        <TrailList items={drafts} />
      )}
      {!loading && tab === 'published' && (
        <TrailList items={published} />
      )}
      {!loading && tab === 'archived' && (
        <TrailList items={archived} />
      )}
    </div>
  )
}

function PitchList({ items }) {
  if (!items.length) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>No open pitches. Start a new one above.</div>
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {items.map(p => (
        <Link key={p.id} href={`/admin/trails/pitch/${p.id}`} style={{
          display: 'block', padding: '16px 18px', borderRadius: 6,
          border: '1px solid var(--color-border)', background: '#fff',
          textDecoration: 'none', color: 'inherit',
        }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink)', fontWeight: 500, lineHeight: 1.45, marginBottom: 6 }}>
            "{p.thesis}"
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {p.day_count != null && <span>{p.day_count}-day</span>}
            <span>created {fmtDate(p.created_at)}</span>
          </div>
        </Link>
      ))}
    </div>
  )
}

function TrailList({ items }) {
  if (!items.length) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>None.</div>
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {items.map(t => (
        <Link key={t.id} href={`/admin/trails/${t.id}`} style={{
          display: 'block', padding: '16px 18px', borderRadius: 6,
          border: '1px solid var(--color-border)', background: '#fff',
          textDecoration: 'none', color: 'inherit',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6, gap: 12 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 400, color: 'var(--color-ink)' }}>
              {t.title || <em style={{ color: 'var(--color-muted)' }}>Untitled draft</em>}
            </div>
            <StatusBadge status={t.status} />
          </div>
          {t.subtitle && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', marginBottom: 8 }}>
              {t.subtitle}
            </div>
          )}
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {t.day_count != null && <span>{t.day_count}-day</span>}
            <span>{fmtKm(t.total_distance_km)}</span>
            <span>{fmtMin(t.total_duration_minutes)}</span>
            {(t.vertical_mix || []).map(v => (
              <span key={v} style={{ background: VERTICAL_BG[v] + '20', color: VERTICAL_BG[v], padding: '1px 7px', borderRadius: 3, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 9 }}>{v}</span>
            ))}
            <span style={{ color: 'var(--color-border)' }}>·</span>
            <span>edited {fmtDate(t.last_edited_at)}</span>
          </div>
        </Link>
      ))}
    </div>
  )
}

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || { bg: '#eee', text: '#666' }
  return (
    <span style={{
      background: c.bg, color: c.text,
      padding: '2px 8px', borderRadius: 100,
      fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
      letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>{status}</span>
  )
}
