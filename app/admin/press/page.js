'use client'

// Admin — the For Press programme in one place: access requests to approve,
// the member roster, the story-lead composer, requests from journalists,
// and beta feedback. All actions go through /api/admin/press.

import { useEffect, useState } from 'react'

const TABS = ['Enquiries', 'Members', 'Story leads', 'Requests', 'Feedback']

const CARD = {
  background: 'var(--color-card-bg, #fff)',
  border: '1px solid var(--color-border, #ddd)',
  borderRadius: 10,
  padding: '14px 16px',
  marginBottom: 10,
}

const BTN = {
  fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  border: '1px solid var(--color-border, #ccc)', borderRadius: 999,
  padding: '4px 12px', background: 'transparent', color: 'var(--color-ink, #222)',
}

const BTN_PRIMARY = {
  ...BTN, background: 'var(--color-sage, #5f8a7e)', color: '#fff', border: '1px solid transparent',
}

const BTN_DANGER = {
  ...BTN, color: 'var(--color-accent, #C4603A)', borderColor: 'rgba(196,96,58,0.4)',
}

const INPUT = {
  width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 8,
  border: '1px solid var(--color-border, #ccc)', fontSize: 13.5,
  background: 'var(--color-cream, #fafafa)', color: 'var(--color-ink, #222)',
}

const MUTED = { fontSize: 12.5, color: 'var(--color-muted, #666)' }

function fmt(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

const EMPTY_LEAD = { title: '', summary: '', body: '', leadType: 'story_lead', regionId: '', embargoUntil: '' }

export default function AdminPressPage() {
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('Enquiries')
  const [busy, setBusy] = useState(null)
  const [leadForm, setLeadForm] = useState(EMPTY_LEAD)
  const [editingLead, setEditingLead] = useState(null)
  const [newMember, setNewMember] = useState({ name: '', outlet: '', email: '', outletType: 'regional' })
  const [error, setError] = useState('')

  async function load() {
    const res = await fetch('/api/admin/press')
    if (res.ok) setData(await res.json())
  }

  useEffect(() => { load() }, [])

  async function act(payload, busyKey) {
    setBusy(busyKey)
    setError('')
    try {
      const res = await fetch('/api/admin/press', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Action failed')
      }
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function createMember(e) {
    e.preventDefault()
    setBusy('create-member')
    setError('')
    try {
      const res = await fetch('/api/admin/press', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMember),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Could not create the account')
      } else {
        setNewMember({ name: '', outlet: '', email: '', outletType: 'regional' })
      }
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function saveLead(e) {
    e.preventDefault()
    const payload = editingLead
      ? { action: 'update_lead', leadId: editingLead, ...leadForm, regionId: leadForm.regionId || null, embargoUntil: leadForm.embargoUntil || null }
      : { action: 'create_lead', ...leadForm, regionId: leadForm.regionId || null, embargoUntil: leadForm.embargoUntil || null }
    await act(payload, 'save-lead')
    setLeadForm(EMPTY_LEAD)
    setEditingLead(null)
  }

  if (!data) {
    return <div style={{ padding: 40, ...MUTED }}>Loading the press desk…</div>
  }

  const newEnquiries = data.enquiries.filter(e => e.status === 'new')
  const counts = {
    Enquiries: newEnquiries.length,
    Members: data.members.length,
    'Story leads': data.leads.length,
    Requests: data.requests.filter(r => r.status !== 'closed').length,
    Feedback: data.feedback.length,
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontFamily: 'var(--font-display, Georgia)', fontSize: 28, fontWeight: 400, margin: 0 }}>
          Press desk
        </h1>
        <span style={MUTED}>
          {data.members.length} member{data.members.length === 1 ? '' : 's'} · {newEnquiries.length} waiting
        </span>
      </div>
      <p style={{ ...MUTED, margin: '0 0 24px' }}>
        Approving an enquiry creates the account and emails the journalist their sign-in link.
        Publishing a lead queues it for the next notification run.
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              ...BTN,
              background: tab === t ? 'var(--color-ink, #222)' : 'transparent',
              color: tab === t ? 'var(--color-cream, #fff)' : 'var(--color-ink, #222)',
              border: tab === t ? '1px solid transparent' : BTN.border,
            }}
          >
            {t}{counts[t] ? ` · ${counts[t]}` : ''}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ ...CARD, borderColor: 'var(--color-accent, #C4603A)', color: 'var(--color-accent, #C4603A)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* ── Enquiries ── */}
      {tab === 'Enquiries' && (
        <div>
          {data.enquiries.length === 0 && <p style={MUTED}>No access requests yet.</p>}
          {data.enquiries.map(e => (
            <div key={e.id} style={CARD}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <p style={{ margin: '0 0 2px', fontSize: 14.5, fontWeight: 600 }}>
                    {e.name} — {e.outlet || '(no outlet given)'}
                    <span style={{ ...MUTED, fontWeight: 400 }}> · {e.outlet_type || 'type unknown'} · {e.email}</span>
                  </p>
                  {e.regions && <p style={{ ...MUTED, margin: '0 0 2px' }}>Covers: {e.regions}</p>}
                  {e.message && <p style={{ ...MUTED, margin: '0 0 2px', whiteSpace: 'pre-wrap' }}>{e.message}</p>}
                  <p style={{ ...MUTED, margin: 0, fontSize: 11.5 }}>{fmt(e.created_at)} · status: {e.status}</p>
                </div>
                {e.status === 'new' && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexShrink: 0 }}>
                    <button
                      style={BTN_PRIMARY}
                      disabled={busy === `enq-${e.id}`}
                      onClick={() => act({ action: 'approve_enquiry', enquiryId: e.id }, `enq-${e.id}`)}
                    >
                      {busy === `enq-${e.id}` ? '…' : 'Approve + create account'}
                    </button>
                    <button
                      style={BTN_DANGER}
                      disabled={busy === `enqd-${e.id}`}
                      onClick={() => act({ action: 'decline_enquiry', enquiryId: e.id }, `enqd-${e.id}`)}
                    >
                      Decline
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Members ── */}
      {tab === 'Members' && (
        <div>
          <form onSubmit={createMember} style={{ ...CARD, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, alignItems: 'end' }}>
            <div>
              <label style={{ ...MUTED, display: 'block', marginBottom: 4 }}>Name</label>
              <input required style={INPUT} value={newMember.name} onChange={ev => setNewMember(m => ({ ...m, name: ev.target.value }))} />
            </div>
            <div>
              <label style={{ ...MUTED, display: 'block', marginBottom: 4 }}>Outlet</label>
              <input required style={INPUT} value={newMember.outlet} onChange={ev => setNewMember(m => ({ ...m, outlet: ev.target.value }))} />
            </div>
            <div>
              <label style={{ ...MUTED, display: 'block', marginBottom: 4 }}>Email</label>
              <input required type="email" style={INPUT} value={newMember.email} onChange={ev => setNewMember(m => ({ ...m, email: ev.target.value }))} />
            </div>
            <button type="submit" style={{ ...BTN_PRIMARY, height: 34 }} disabled={busy === 'create-member'}>
              {busy === 'create-member' ? '…' : 'Add member directly'}
            </button>
          </form>

          {data.members.map(m => (
            <div key={m.id} style={CARD}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <p style={{ margin: '0 0 2px', fontSize: 14.5, fontWeight: 600 }}>
                    {m.outlet}
                    <span style={{ ...MUTED, fontWeight: 400 }}> · {m.name}{m.role_title ? ` (${m.role_title})` : ''} · {m.contact_email}</span>
                  </p>
                  <p style={{ ...MUTED, margin: 0 }}>
                    {m.outlet_type} · cadence: {m.cadence}
                    {m.beat_verticals?.length ? ` · beats: ${m.beat_verticals.join(', ')}` : ''}
                    {m.follows?.length ? ` · follows: ${m.follows.join(', ')}` : ' · follows nothing yet'}
                  </p>
                  <p style={{ ...MUTED, margin: 0, fontSize: 11.5 }}>
                    joined {fmt(m.created_at)}{m.last_login_at ? ` · last seen ${fmt(m.last_login_at)}` : ' · never signed in'}
                    {' · '}{m.approved ? 'approved' : 'NOT approved'} · {m.status}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexShrink: 0 }}>
                  {m.status === 'active' ? (
                    <button style={BTN_DANGER} onClick={() => act({ action: 'set_status', pressId: m.id, status: 'suspended' }, `st-${m.id}`)}>
                      Suspend
                    </button>
                  ) : (
                    <button style={BTN} onClick={() => act({ action: 'set_status', pressId: m.id, status: 'active' }, `st-${m.id}`)}>
                      Reactivate
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Story leads ── */}
      {tab === 'Story leads' && (
        <div>
          <form onSubmit={saveLead} style={{ ...CARD, display: 'grid', gap: 10 }}>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>
              {editingLead ? 'Edit lead' : 'New story lead'}
            </p>
            <input required style={INPUT} placeholder="Title — the headline a journalist would riff on"
              value={leadForm.title} onChange={ev => setLeadForm(f => ({ ...f, title: ev.target.value }))} />
            <textarea required rows={2} style={{ ...INPUT, resize: 'vertical' }} placeholder="Summary — the one-paragraph pitch (goes in emails)"
              value={leadForm.summary} onChange={ev => setLeadForm(f => ({ ...f, summary: ev.target.value }))} />
            <textarea rows={4} style={{ ...INPUT, resize: 'vertical' }} placeholder="Full note (optional) — background, numbers, who to talk to"
              value={leadForm.body} onChange={ev => setLeadForm(f => ({ ...f, body: ev.target.value }))} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
              <select style={INPUT} value={leadForm.leadType} onChange={ev => setLeadForm(f => ({ ...f, leadType: ev.target.value }))}>
                <option value="story_lead">Story lead</option>
                <option value="release">Release</option>
                <option value="data_note">Data note</option>
                <option value="milestone">Milestone</option>
              </select>
              <select style={INPUT} value={leadForm.regionId} onChange={ev => setLeadForm(f => ({ ...f, regionId: ev.target.value }))}>
                <option value="">Network-wide (all members)</option>
                {data.regions.map(r => <option key={r.id} value={r.id}>{r.name} followers only</option>)}
              </select>
              <div>
                <input type="datetime-local" style={INPUT} title="Embargo until (optional)"
                  value={leadForm.embargoUntil} onChange={ev => setLeadForm(f => ({ ...f, embargoUntil: ev.target.value }))} />
                <span style={{ ...MUTED, fontSize: 11 }}>Embargo until (optional)</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" style={BTN_PRIMARY} disabled={busy === 'save-lead'}>
                {busy === 'save-lead' ? '…' : editingLead ? 'Save changes' : 'Save as draft'}
              </button>
              {editingLead && (
                <button type="button" style={BTN} onClick={() => { setEditingLead(null); setLeadForm(EMPTY_LEAD) }}>
                  Cancel edit
                </button>
              )}
            </div>
          </form>

          {data.leads.map(l => (
            <div key={l.id} style={CARD}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <p style={{ margin: '0 0 2px', fontSize: 14.5, fontWeight: 600 }}>
                    {l.title}
                    <span style={{ ...MUTED, fontWeight: 400 }}>
                      {' '}· {l.lead_type} · {l.region?.name || 'network-wide'} · {l.status}
                      {l.embargo_until ? ` · embargo ${fmt(l.embargo_until)}` : ''}
                    </span>
                  </p>
                  <p style={{ ...MUTED, margin: 0 }}>{l.summary}</p>
                  <p style={{ ...MUTED, margin: '2px 0 0', fontSize: 11.5 }}>
                    created {fmt(l.created_at)}{l.published_at ? ` · published ${fmt(l.published_at)}` : ''}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap', flexShrink: 0 }}>
                  {l.status === 'draft' && (
                    <button style={BTN_PRIMARY} disabled={busy === `pub-${l.id}`} onClick={() => act({ action: 'publish_lead', leadId: l.id }, `pub-${l.id}`)}>
                      {busy === `pub-${l.id}` ? '…' : 'Publish'}
                    </button>
                  )}
                  {l.status === 'published' && (
                    <button style={BTN} onClick={() => act({ action: 'archive_lead', leadId: l.id }, `arc-${l.id}`)}>
                      Archive
                    </button>
                  )}
                  <button
                    style={BTN}
                    onClick={() => {
                      setEditingLead(l.id)
                      setLeadForm({
                        title: l.title, summary: l.summary, body: l.body || '',
                        leadType: l.lead_type, regionId: l.region_id || '',
                        embargoUntil: l.embargo_until ? l.embargo_until.slice(0, 16) : '',
                      })
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                  >
                    Edit
                  </button>
                  {l.status === 'draft' && (
                    <button style={BTN_DANGER} onClick={() => act({ action: 'delete_lead', leadId: l.id }, `del-${l.id}`)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {data.leads.length === 0 && <p style={MUTED}>No leads yet — draft one above.</p>}
        </div>
      )}

      {/* ── Requests ── */}
      {tab === 'Requests' && (
        <div>
          {data.requests.length === 0 && <p style={MUTED}>No requests from journalists yet.</p>}
          {data.requests.map(r => (
            <div key={r.id} style={CARD}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <p style={{ margin: '0 0 2px', fontSize: 14.5, fontWeight: 600 }}>
                    [{r.request_type}] {r.subject}
                    <span style={{ ...MUTED, fontWeight: 400 }}> · {r.outlet || 'account deleted'}{r.press_name ? ` (${r.press_name})` : ''}</span>
                  </p>
                  <p style={{ ...MUTED, margin: 0, whiteSpace: 'pre-wrap' }}>{r.message}</p>
                  <p style={{ ...MUTED, margin: '2px 0 0', fontSize: 11.5 }}>
                    {fmt(r.created_at)}{r.deadline ? ` · deadline ${fmt(r.deadline)}` : ''}{r.contact_email ? ` · ${r.contact_email}` : ''} · {r.status}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexShrink: 0 }}>
                  {r.status === 'new' && (
                    <button style={BTN} onClick={() => act({ action: 'update_request', requestId: r.id, status: 'in_progress' }, `rq-${r.id}`)}>
                      Take it
                    </button>
                  )}
                  {r.status !== 'closed' && (
                    <button style={BTN} onClick={() => act({ action: 'update_request', requestId: r.id, status: 'closed' }, `rqc-${r.id}`)}>
                      Close
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Feedback ── */}
      {tab === 'Feedback' && (
        <div>
          {data.feedback.length === 0 && <p style={MUTED}>No beta feedback yet.</p>}
          {data.feedback.map(f => (
            <div key={f.id} style={CARD}>
              <p style={{ margin: '0 0 2px', fontSize: 13.5, fontWeight: 600 }}>
                {f.press_name || 'former member'}
                <span style={{ ...MUTED, fontWeight: 400 }}> · {fmt(f.created_at)}{f.page ? ` · from ${f.page}` : ''}</span>
              </p>
              <p style={{ ...MUTED, margin: 0, whiteSpace: 'pre-wrap' }}>{f.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
