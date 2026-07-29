'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

// Claim remediation console.
//
// Every row is a listing we handed to someone without confirming the email was
// theirs. The UI is built around that being an admission rather than a mailing
// list: nothing sends without a deliberate act, the email is readable in full
// before it goes, and comped Standard holders are structurally excluded from
// the bulk path because they need a different conversation.

const fmtDate = (d) => (d ? String(d).slice(0, 10) : '—')
const daysSince = (d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null)

export default function ClaimRemediationClient() {
  const [rows, setRows] = useState([])
  const [counts, setCounts] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(() => new Set())
  const [busy, setBusy] = useState(null)
  const [results, setResults] = useState([])
  const [preview, setPreview] = useState(null)
  const [confirming, setConfirming] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/claim-remediation')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setRows(data.rows || [])
      setCounts(data.counts || null)
      setSelected(new Set())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const bulkEligible = useMemo(
    () => rows.filter(r => !r.manualOnly && !r.remediatedAt),
    [rows]
  )
  const selectedRows = useMemo(
    () => rows.filter(r => selected.has(r.claimId)),
    [rows, selected]
  )

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function post(payload, label) {
    setBusy(label)
    setError(null)
    try {
      const res = await fetch('/api/admin/claim-remediation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')
      return data
    } catch (e) {
      setError(e.message)
      return null
    } finally {
      setBusy(null)
    }
  }

  async function sendOne(row, force = false) {
    const data = await post({ action: 'send', claimId: row.claimId, force }, row.claimId)
    if (data?.results) { setResults(data.results); await load() }
  }

  async function sendBulk() {
    setConfirming(false)
    const ids = selectedRows.filter(r => !r.manualOnly).map(r => r.claimId)
    const data = await post({ action: 'send_bulk', claimIds: ids }, 'bulk')
    if (data?.results) { setResults(data.results); await load() }
  }

  async function showPreview(row) {
    const data = await post({ action: 'preview', claimId: row.claimId }, `preview-${row.claimId}`)
    if (data) setPreview({ ...data, listing: row.listing })
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1240, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-display, Georgia), serif', fontSize: 26, fontWeight: 400, margin: 0 }}>
        Claim Remediation
      </h1>
      <p style={{ fontSize: 14, lineHeight: 1.6, color: '#6B6760', maxWidth: 760, marginTop: 10 }}>
        Listings marked as owned before we confirmed the claimed email address belonged to the
        claimant. Ownership is real and still stands; what was never established is that the right
        person holds it. Sending gives them a working way in — and an easy way to hand it back if it
        isn&rsquo;t theirs.
      </p>

      {counts && (
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', margin: '18px 0 8px', fontSize: 13, color: '#6B6760' }}>
          <span><strong style={{ color: '#1C1A17' }}>{counts.total}</strong> in cohort</span>
          <span><strong style={{ color: '#1C1A17' }}>{counts.contacted}</strong> contacted</span>
          <span><strong style={{ color: '#1C1A17' }}>{counts.total - counts.contacted}</strong> outstanding</span>
          <span><strong style={{ color: '#1C1A17' }}>{counts.manualOnly}</strong> individual-handling only</span>
          {!counts.resendConfigured && (
            <span style={{ color: '#b45309' }}>⚠ RESEND_API_KEY not configured — sends will fail</span>
          )}
        </div>
      )}

      {error && (
        <div style={{ margin: '14px 0', padding: '12px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 14 }}>
          {error}
        </div>
      )}

      {results.length > 0 && (
        <div style={{ margin: '14px 0', padding: '12px 14px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 13 }}>
          {results.map((r, i) => (
            <div key={i} style={{ color: r.status === 'sent' ? '#166534' : '#991b1b' }}>
              {r.status === 'sent' ? '✓ sent to ' : `✕ ${r.status}${r.error ? ` (${r.error})` : ''} — `}{r.to}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '16px 0' }}>
        <button
          onClick={() => setSelected(new Set(bulkEligible.map(r => r.claimId)))}
          style={btn()}
        >
          Select all outstanding ({bulkEligible.length})
        </button>
        <button onClick={() => setSelected(new Set())} style={btn()}>Clear</button>
        <button
          onClick={() => setConfirming(true)}
          disabled={!selectedRows.some(r => !r.manualOnly) || busy === 'bulk'}
          style={btn(selectedRows.some(r => !r.manualOnly) && busy !== 'bulk')}
        >
          {busy === 'bulk' ? 'Sending…' : `Send to ${selectedRows.filter(r => !r.manualOnly).length} selected`}
        </button>
        <button onClick={load} style={btn()}>Refresh</button>
      </div>

      {confirming && (
        <div style={{ margin: '14px 0', padding: '16px 18px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a' }}>
          <div style={{ fontSize: 14, color: '#78350f', lineHeight: 1.6 }}>
            This sends a real email to{' '}
            <strong>{selectedRows.filter(r => !r.manualOnly).length} operators</strong>, one at a time.
            Each gets a fresh sign-in link and an invitation to hand the listing back if it isn&rsquo;t
            theirs. This cannot be undone.
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button onClick={sendBulk} style={btn(true)}>Yes, send them</button>
            <button onClick={() => setConfirming(false)} style={btn()}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: '#6B6760', fontSize: 14 }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: '#166534', fontSize: 14 }}>
          Nobody is in this cohort — every live claim is held by a verified address.
        </p>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e7e3db', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#faf8f5', textAlign: 'left' }}>
                {['', 'Listing', 'Claimant', 'Claimed', 'Nudged', 'Remediated', ''].map((h, i) => (
                  <th key={i} style={th()}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.claimId} style={{ borderTop: '1px solid #ece8e1', background: r.remediatedAt ? '#fcfcfa' : '#fff' }}>
                  <td style={td()}>
                    <input
                      type="checkbox"
                      checked={selected.has(r.claimId)}
                      onChange={() => toggle(r.claimId)}
                      disabled={r.manualOnly}
                      title={r.manualOnly ? 'Comped Standard — send individually' : ''}
                    />
                  </td>
                  <td style={td()}>
                    <div style={{ color: '#1C1A17', fontWeight: 500 }}>{r.listing}</div>
                    <div style={{ color: '#9a958c', fontSize: 12 }}>
                      {r.vertical}
                      {r.listingStatus !== 'active' && <span style={{ color: '#b45309' }}> · {r.listingStatus}</span>}
                      {r.manualOnly && <span style={{ color: '#b45309' }}> · comped Standard, handle individually</span>}
                    </div>
                  </td>
                  <td style={td()}>
                    <div>{r.email}</div>
                    {r.claimantName && <div style={{ color: '#9a958c', fontSize: 12 }}>{r.claimantName}</div>}
                  </td>
                  <td style={td()}>
                    {fmtDate(r.claimCreated)}
                    <div style={{ color: '#9a958c', fontSize: 12 }}>{daysSince(r.claimCreated)}d ago</div>
                  </td>
                  <td style={td()}>{fmtDate(r.nudgedAt)}</td>
                  <td style={td()}>
                    {r.remediatedAt
                      ? <span style={{ color: '#166534' }}>{fmtDate(r.remediatedAt)}</span>
                      : <span style={{ color: '#9a958c' }}>—</span>}
                  </td>
                  <td style={{ ...td(), whiteSpace: 'nowrap' }}>
                    <button onClick={() => showPreview(r)} style={btn()}>Preview</button>{' '}
                    <button
                      onClick={() => sendOne(r, !!r.remediatedAt)}
                      disabled={busy === r.claimId}
                      style={btn(busy !== r.claimId)}
                    >
                      {busy === r.claimId ? 'Sending…' : r.remediatedAt ? 'Re-send' : 'Send'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {preview && (
        <div
          onClick={() => setPreview(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,14,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 50 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, maxWidth: 700, width: '100%', maxHeight: '85vh', overflow: 'auto' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #ece8e1', fontSize: 13, color: '#6B6760' }}>
              <div>To: <strong style={{ color: '#1C1A17' }}>{preview.to}</strong></div>
              <div>Subject: <strong style={{ color: '#1C1A17' }}>{preview.subject}</strong></div>
              <div style={{ marginTop: 6, color: '#b45309' }}>
                Preview only — the sign-in link is a placeholder and is minted fresh at send time.
              </div>
            </div>
            <iframe
              title="Email preview"
              srcDoc={preview.html}
              style={{ width: '100%', height: '60vh', border: 0 }}
            />
            <div style={{ padding: '12px 18px', borderTop: '1px solid #ece8e1' }}>
              <button onClick={() => setPreview(null)} style={btn()}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const th = () => ({ padding: '10px 12px', fontWeight: 500, color: '#6B6760', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' })
const td = () => ({ padding: '10px 12px', verticalAlign: 'top', color: '#3d3a35' })
const btn = (active = false) => ({
  padding: '6px 12px',
  borderRadius: 6,
  border: '1px solid ' + (active ? '#1C1A17' : '#d8d4cd'),
  background: active ? '#1C1A17' : '#fff',
  color: active ? '#fff' : '#3d3a35',
  fontSize: 13,
  cursor: 'pointer',
})
