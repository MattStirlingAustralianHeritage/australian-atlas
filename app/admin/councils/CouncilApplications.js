'use client'

import { useState } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'

// The incoming-applications inbox: new leads from /council/enquire that need a
// human to approve & provision (or decline). This is the top-of-funnel surface —
// the thing that was entirely missing before.

function timeAgo(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString()
}

export default function CouncilApplications({ applications, regions }) {
  const [pending, setPending] = useState(null) // { app, action, regionId }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  // Per-application region override for free-text (unmatched) leads.
  const [regionPicks, setRegionPicks] = useState({})

  if (!applications || applications.length === 0) return null

  function setPick(appId, regionId) {
    setRegionPicks(p => ({ ...p, [appId]: regionId }))
  }

  async function confirmAction() {
    if (!pending) return
    const { app, action, regionId } = pending
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/council-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, enquiryId: app.id, regionId: regionId || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      window.location.reload()
    } catch (err) {
      setError(err.message)
      setBusy(false)
      setPending(null)
    }
  }

  const pendingCopy = pending
    ? {
        provision: {
          title: `Approve & provision ${pending.app.organisation}?`,
          confirmLabel: 'Approve & send login',
          danger: false,
        },
        decline: { title: `Decline ${pending.app.organisation}?`, confirmLabel: 'Decline', danger: true },
        delete: { title: `Delete this application?`, confirmLabel: 'Delete', danger: true },
      }[pending.action]
    : null

  return (
    <div style={{ marginBottom: 28 }}>
      <ConfirmDialog
        open={!!pending}
        title={pendingCopy?.title}
        confirmLabel={pendingCopy?.confirmLabel}
        danger={!!pendingCopy?.danger}
        busy={busy}
        onConfirm={confirmAction}
        onCancel={() => setPending(null)}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#B8860B', flexShrink: 0 }} />
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 400, margin: 0 }}>
          Applications
        </h2>
        <span style={{
          fontSize: 12, fontWeight: 600, padding: '2px 9px', borderRadius: 20,
          background: '#FDF6E3', color: '#B8860B',
        }}>
          {applications.length} awaiting review
        </span>
      </div>

      {error && (
        <div style={{ padding: 10, borderRadius: 4, marginBottom: 12, fontSize: 13, background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {applications.map(app => {
          const matched = !!app.region_id
          const chosenRegion = regionPicks[app.id] || ''
          // Region is optional at provision time — a lead can be approved now and
          // have its region assigned here or later on the account below.
          return (
            <div key={app.id} style={{
              border: '1px solid #EAD9A8', borderRadius: 8, padding: '16px 18px',
              background: 'linear-gradient(180deg,#FFFDF7,#fff)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 17, fontWeight: 400, margin: 0 }}>
                      {app.organisation}
                    </h3>
                    <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{timeAgo(app.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span>{app.name}{app.role ? ` · ${app.role}` : ''}</span>
                    <a href={`mailto:${app.email}`} style={{ color: '#5F8A7E' }}>{app.email}</a>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                  <button
                    onClick={() => setPending({ app, action: 'provision', regionId: matched ? null : chosenRegion })}
                    style={{
                      padding: '7px 14px', fontSize: 13, fontWeight: 500, border: 'none', borderRadius: 5,
                      background: '#5F8A7E', color: '#fff', cursor: 'pointer',
                    }}
                  >
                    Approve &amp; provision
                  </button>
                  <button
                    onClick={() => setPending({ app, action: 'decline' })}
                    style={{ padding: '7px 12px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 5, background: '#fff', color: 'var(--text-2)', cursor: 'pointer' }}
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => setPending({ app, action: 'delete' })}
                    title="Delete"
                    style={{ padding: '7px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 5, background: '#fff', color: '#C0392B', cursor: 'pointer' }}
                  >
                    &times;
                  </button>
                </div>
              </div>

              {/* Region row */}
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {matched ? (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12,
                    padding: '3px 10px', borderRadius: 4, background: 'rgba(95,138,126,0.12)', color: '#3f5f56',
                  }}>
                    <span>&#10003;</span> {app.region_name || app.region} <span style={{ opacity: 0.6 }}>· matched region</span>
                  </span>
                ) : (
                  <>
                    <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                      Wants: <strong>&ldquo;{app.region}&rdquo;</strong> (unmatched) —
                    </span>
                    <select
                      value={chosenRegion}
                      onChange={e => setPick(app.id, e.target.value)}
                      style={{ padding: '4px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, fontFamily: 'var(--font-sans)' }}
                    >
                      <option value="">Assign a region (optional)…</option>
                      {regions.map(r => (
                        <option key={r.id} value={r.id}>{r.name}{r.state ? ` (${r.state})` : ''}</option>
                      ))}
                    </select>
                  </>
                )}
              </div>

              {app.message && (
                <p style={{ marginTop: 10, marginBottom: 0, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45, fontStyle: 'italic' }}>
                  &ldquo;{app.message}&rdquo;
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
