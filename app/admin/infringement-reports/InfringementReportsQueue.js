'use client'

import { useState } from 'react'

const STATUSES = ['received', 'under_review', 'actioned', 'rejected']
const STATUS_COLOR = {
  received: '#92400e', under_review: '#1d4ed8', actioned: '#166534', rejected: '#6b7280',
}

async function postAction(payload) {
  const res = await fetch('/api/admin/infringement-reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return res.json().catch(() => ({}))
}

function AssetRow({ asset, onChange }) {
  const [busy, setBusy] = useState(false)
  const removed = asset.takedown_status === 'removed'
  async function toggle() {
    setBusy(true)
    const action = removed ? 'restore_asset' : 'takedown_asset'
    const reason = removed ? undefined : (prompt('Takedown reason (logged):', 'Infringement report') || 'admin takedown')
    const r = await postAction({ action, assetId: asset.id, reason })
    setBusy(false)
    if (r?.success) onChange(asset.id, r.asset?.takedown_status || (removed ? 'active' : 'removed'))
    else alert(r?.error || 'Action failed')
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid #eee' }}>
      {asset.public_url
        ? <img src={asset.public_url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, flexShrink: 0, filter: removed ? 'grayscale(1) opacity(0.5)' : 'none' }} />
        : <div style={{ width: 44, height: 44, borderRadius: 6, background: '#eee', flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1614' }}>{asset.asset_kind}{removed && ' · removed'}</div>
        <div style={{ fontSize: 11, color: '#6b6560', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{asset.public_url}</div>
        {asset.source_declaration && <div style={{ fontSize: 11, color: '#6b6560' }}>Source: {asset.source_declaration}</div>}
      </div>
      <button onClick={toggle} disabled={busy} style={{
        fontFamily: 'var(--font-body, sans-serif)', fontSize: 12, fontWeight: 500, cursor: busy ? 'wait' : 'pointer',
        border: '1px solid', borderColor: removed ? '#166534' : '#b91c1c', color: removed ? '#166534' : '#b91c1c',
        background: 'white', borderRadius: 6, padding: '6px 12px', flexShrink: 0,
      }}>
        {removed ? 'Restore' : 'Take down'}
      </button>
    </div>
  )
}

function ReportCard({ report, listingAssets }) {
  const [status, setStatus] = useState(report.status)
  const [notes, setNotes] = useState(report.internal_notes || '')
  const [assets, setAssets] = useState(listingAssets?.assets || [])
  const [saving, setSaving] = useState(false)
  const [archived, setArchived] = useState(false)
  const [savedAt, setSavedAt] = useState(null)

  if (archived) return null

  async function save() {
    setSaving(true)
    const r = await postAction({ action: 'update_status', reportId: report.id, status, internal_notes: notes })
    setSaving(false)
    if (r?.success) setSavedAt(Date.now()); else alert(r?.error || 'Save failed')
  }
  async function archive() {
    if (!confirm('Archive this report? It stays retained but leaves the active queue.')) return
    const r = await postAction({ action: 'archive', reportId: report.id })
    if (r?.success) setArchived(true); else alert(r?.error || 'Archive failed')
  }
  function onAssetChange(id, newStatus) {
    setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, takedown_status: newStatus } : a)))
  }

  const cell = { fontFamily: 'var(--font-body, sans-serif)', fontSize: 13, color: '#1a1614' }
  const k = { ...cell, color: '#6b6560', width: 150, verticalAlign: 'top', padding: '4px 8px 4px 0' }
  const v = { ...cell, padding: '4px 0' }

  return (
    <div style={{ border: '1px solid var(--color-border, #e8e4df)', borderRadius: 12, padding: 18, marginBottom: 16, background: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontFamily: 'var(--font-body, sans-serif)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: STATUS_COLOR[status] || '#000' }}>
          {status.replace('_', ' ')}
        </span>
        <span style={{ fontFamily: 'var(--font-body, sans-serif)', fontSize: 12, color: '#6b6560' }}>
          {report.created_at ? new Date(report.created_at).toLocaleString() : ''}
        </span>
      </div>

      <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 12 }}>
        <tbody>
          <tr><td style={k}>Listing</td><td style={v}>{listingAssets?.name || report.listing_slug || '—'}{report.listing_slug && <a href={`/place/${report.listing_slug}`} target="_blank" rel="noreferrer" style={{ marginLeft: 8, color: '#5f8a7e' }}>view ↗</a>}</td></tr>
          <tr><td style={k}>Reporter</td><td style={v}>{report.reporter_name} · {report.reporter_email}</td></tr>
          <tr><td style={k}>Rights basis</td><td style={v}>{report.rights_basis || '—'}</td></tr>
          <tr><td style={k}>Infringing URL</td><td style={v}>{report.allegedly_infringing_url ? <a href={report.allegedly_infringing_url} target="_blank" rel="noreferrer" style={{ color: '#5f8a7e', wordBreak: 'break-all' }}>{report.allegedly_infringing_url}</a> : '—'}</td></tr>
          <tr><td style={k}>Good faith</td><td style={v}>{report.good_faith_statement ? 'Yes' : 'No'}</td></tr>
          <tr><td style={k}>Description</td><td style={v}>{report.description || '—'}</td></tr>
        </tbody>
      </table>

      {assets.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: 'var(--font-body, sans-serif)', fontSize: 12, fontWeight: 600, color: '#6b6560', marginBottom: 2 }}>
            Assets on this listing ({assets.length})
          </div>
          {assets.map((a) => <AssetRow key={a.id} asset={a} onChange={onAssetChange} />)}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <div>
          <label style={{ display: 'block', fontFamily: 'var(--font-body, sans-serif)', fontSize: 11, color: '#6b6560', marginBottom: 3 }}>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ fontFamily: 'var(--font-body, sans-serif)', fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid #ddd' }}>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ display: 'block', fontFamily: 'var(--font-body, sans-serif)', fontSize: 11, color: '#6b6560', marginBottom: 3 }}>Internal notes</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Handling notes…" style={{ width: '100%', fontFamily: 'var(--font-body, sans-serif)', fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid #ddd' }} />
        </div>
        <button onClick={save} disabled={saving} style={{ fontFamily: 'var(--font-body, sans-serif)', fontSize: 13, fontWeight: 500, color: 'white', background: '#5f8a7e', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: saving ? 'wait' : 'pointer' }}>
          {saving ? 'Saving…' : savedAt ? 'Saved ✓' : 'Save'}
        </button>
        <button onClick={archive} style={{ fontFamily: 'var(--font-body, sans-serif)', fontSize: 13, fontWeight: 400, color: '#6b6560', background: 'transparent', border: '1px solid #ddd', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>
          Archive
        </button>
      </div>
    </div>
  )
}

export default function InfringementReportsQueue({ initialReports = [], assetsBySlug = {} }) {
  if (!initialReports.length) {
    return <p style={{ fontFamily: 'var(--font-body, sans-serif)', fontSize: 14, color: '#6b6560' }}>No active reports. 🎉</p>
  }
  return (
    <div>
      {initialReports.map((r) => (
        <ReportCard key={r.id} report={r} listingAssets={assetsBySlug[r.listing_slug]} />
      ))}
    </div>
  )
}
