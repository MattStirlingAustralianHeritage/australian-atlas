'use client'

import { useState } from 'react'

export default function CouncilsActions({ councils, regions }) {
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState(null)

  const [form, setForm] = useState({
    name: '', slug: '', contact_name: '', contact_email: '',
    tier: 'explorer', status: 'trial',
  })

  async function handleCreate(e) {
    e.preventDefault()
    setCreating(true)
    setMessage(null)

    try {
      const res = await fetch('/api/admin/councils', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setMessage({ type: 'success', text: `Council "${form.name}" created` })
      setForm({ name: '', slug: '', contact_name: '', contact_email: '', tier: 'explorer', status: 'trial' })
      setShowCreate(false)
      // Refresh the page to show the new council
      window.location.reload()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setCreating(false)
    }
  }

  async function handleAction(councilId, action, payload = {}) {
    if (!confirm(`Are you sure you want to ${action} this council?`)) return

    try {
      const res = await fetch('/api/admin/councils', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ councilId, action, ...payload }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      window.location.reload()
    } catch (err) {
      alert(err.message)
    }
  }

  const inputStyle = {
    padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 4,
    fontSize: 14, fontFamily: 'var(--font-sans)', width: '100%',
  }

  return (
    <div>
      {message && (
        <div style={{
          padding: 12, borderRadius: 4, marginBottom: 16, fontSize: 13,
          background: message.type === 'error' ? '#FEF2F2' : '#F0FDF4',
          color: message.type === 'error' ? '#991B1B' : '#166534',
          border: `1px solid ${message.type === 'error' ? '#FECACA' : '#BBF7D0'}`,
        }}>
          {message.text}
        </div>
      )}

      <button
        onClick={() => setShowCreate(!showCreate)}
        style={{
          padding: '8px 20px', background: showCreate ? 'var(--bg-2)' : 'var(--amber)',
          color: showCreate ? 'var(--text)' : '#fff', border: 'none', borderRadius: 4,
          fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)',
        }}
      >
        {showCreate ? 'Cancel' : '+ Create council'}
      </button>

      {/* Per-council approve/suspend toggles */}
      {councils?.length > 0 && (
        <div style={{ marginTop: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 500, marginBottom: 8, color: 'var(--text-2)' }}>
            Approval management
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {councils.map(c => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', background: '#fff', border: '1px solid var(--border)',
                borderRadius: 4, fontSize: 13,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: c.approved ? '#5F8A7E' : '#C0392B',
                  }} />
                  <span style={{ fontWeight: 500 }}>{c.name}</span>
                  <span style={{ color: 'var(--text-2)' }}>({c.contact_email})</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {c.approved ? (
                    <button
                      onClick={() => handleAction(c.id, 'set_approved', { approved: false })}
                      style={{
                        padding: '4px 12px', fontSize: 11, border: '1px solid #C0392B',
                        borderRadius: 3, background: '#FEF2F2', color: '#C0392B', cursor: 'pointer',
                      }}
                    >
                      Suspend login
                    </button>
                  ) : (
                    <button
                      onClick={() => handleAction(c.id, 'set_approved', { approved: true })}
                      style={{
                        padding: '4px 12px', fontSize: 11, border: '1px solid #5F8A7E',
                        borderRadius: 3, background: '#F0FDF4', color: '#166534', cursor: 'pointer',
                      }}
                    >
                      Approve login
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-council region assignment */}
      {councils?.length > 0 && regions?.length > 0 && (
        <div style={{ marginTop: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 500, marginBottom: 8, color: 'var(--text-2)' }}>
            Region assignment
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {councils.map(c => {
              const assignedIds = (c.council_regions || []).map(cr => cr.region_id)
              const available = regions.filter(r => !assignedIds.includes(r.id))
              return (
                <div key={c.id} style={{
                  padding: '10px 12px', background: '#fff', border: '1px solid var(--border)',
                  borderRadius: 4, fontSize: 13,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: assignedIds.length > 0 ? 8 : 0 }}>
                    <span style={{ fontWeight: 500 }}>{c.name}</span>
                    {available.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <select
                          id={`region-select-${c.id}`}
                          style={{
                            padding: '4px 8px', fontSize: 12, border: '1px solid var(--border)',
                            borderRadius: 3, fontFamily: 'var(--font-sans)',
                          }}
                        >
                          {available.map(r => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            const select = document.getElementById(`region-select-${c.id}`)
                            if (select?.value) {
                              handleAction(c.id, 'assign_region', { regionId: select.value })
                            }
                          }}
                          style={{
                            padding: '4px 10px', fontSize: 11, border: '1px solid #5F8A7E',
                            borderRadius: 3, background: '#F0FDF4', color: '#166534', cursor: 'pointer',
                          }}
                        >
                          Assign
                        </button>
                      </div>
                    )}
                  </div>
                  {assignedIds.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(c.council_regions || []).map((cr, i) => (
                        <span key={i} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          fontSize: 11, padding: '2px 8px', borderRadius: 2,
                          background: 'var(--bg-2)', color: 'var(--text-2)',
                        }}>
                          {cr.regions?.name || cr.region_id}
                          <button
                            onClick={() => handleAction(c.id, 'remove_region', { regionId: cr.region_id })}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: '#C0392B', fontSize: 13, padding: 0, lineHeight: 1,
                            }}
                            title={`Remove ${cr.regions?.name || 'region'}`}
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} style={{
          marginTop: 16, padding: 24, border: '1px solid var(--border)',
          borderRadius: 6, background: '#fff', display: 'grid',
          gridTemplateColumns: '1fr 1fr', gap: 12,
        }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Council name *</label>
            <input required style={inputStyle} value={form.name}
              onChange={e => {
                setForm(f => ({
                  ...f, name: e.target.value,
                  slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
                }))
              }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Slug</label>
            <input style={inputStyle} value={form.slug}
              onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Contact name</label>
            <input style={inputStyle} value={form.contact_name}
              onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Contact email *</label>
            <input required type="email" style={inputStyle} value={form.contact_email}
              onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Tier</label>
            <select style={inputStyle} value={form.tier} onChange={e => setForm(f => ({ ...f, tier: e.target.value }))}>
              <option value="explorer">Explorer</option>
              <option value="partner">Partner</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Status</label>
            <select style={inputStyle} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              <option value="trial">Trial</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <button
              type="submit"
              disabled={creating}
              style={{
                padding: '10px 28px', background: 'var(--amber)', color: '#fff',
                border: 'none', borderRadius: 4, fontSize: 14, cursor: 'pointer',
                opacity: creating ? 0.6 : 1,
              }}
            >
              {creating ? 'Creating...' : 'Create council'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
