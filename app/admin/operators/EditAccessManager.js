'use client'

import { useState, useEffect, useCallback } from 'react'

export default function EditAccessManager() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState(null) // { type: 'success'|'error', text }

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/edit-access')
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users || [])
      }
    } catch {} finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  async function handleGrant(e) {
    e.preventDefault()
    if (!email.trim() || submitting) return
    setSubmitting(true)
    setMessage(null)

    try {
      const res = await fetch('/api/admin/edit-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), grant: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error })
        return
      }
      setMessage({ type: 'success', text: data.message })
      setEmail('')
      fetchUsers()
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRevoke(userEmail) {
    try {
      const res = await fetch('/api/admin/edit-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, grant: false }),
      })
      if (res.ok) fetchUsers()
    } catch {}
  }

  return (
    <div style={{
      marginTop: 48, paddingTop: 32,
      borderTop: '1px solid var(--border, #e5e5e5)',
    }}>
      <h2 style={{
        fontFamily: 'var(--font-serif, Georgia)', fontSize: 20, fontWeight: 400, marginBottom: 6,
      }}>
        Inline Edit Access
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-2, #888)', marginBottom: 20 }}>
        Grant users the ability to edit listings directly on the live site without admin panel access.
      </p>

      {/* Grant form */}
      <form onSubmit={handleGrant} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="User email..."
          required
          style={{
            flex: 1, padding: '8px 12px', borderRadius: 6,
            border: '1px solid var(--border, #e5e5e5)',
            fontSize: 13, fontFamily: 'var(--font-body, system-ui)',
          }}
        />
        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: '8px 16px', borderRadius: 6, border: 'none',
            background: 'var(--color-sage, #5F8A7E)', color: '#fff',
            fontSize: 12, fontWeight: 600, cursor: submitting ? 'wait' : 'pointer',
            fontFamily: 'var(--font-body, system-ui)',
          }}
        >
          {submitting ? 'Granting...' : 'Grant Access'}
        </button>
      </form>

      {message && (
        <div style={{
          padding: '8px 12px', borderRadius: 6, marginBottom: 12,
          fontSize: 12, fontFamily: 'var(--font-body, system-ui)',
          background: message.type === 'error' ? '#FEF2F2' : '#E8F5E9',
          color: message.type === 'error' ? '#C62828' : '#2E7D32',
          border: `1px solid ${message.type === 'error' ? '#FFCDD2' : '#C8E6C9'}`,
        }}>
          {message.text}
        </div>
      )}

      {/* Users with access */}
      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--text-2, #888)' }}>Loading...</p>
      ) : users.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-2, #888)', fontStyle: 'italic' }}>
          No users currently have inline edit access.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {users.map(u => (
            <div key={u.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', borderRadius: 6,
              border: '1px solid var(--border, #e5e5e5)', background: '#fff',
            }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{u.full_name || u.email}</span>
                {u.full_name && (
                  <span style={{ fontSize: 12, color: 'var(--text-2, #888)', marginLeft: 8 }}>
                    {u.email}
                  </span>
                )}
                <span style={{
                  fontSize: 10, fontWeight: 500, padding: '2px 6px', borderRadius: 3,
                  marginLeft: 8, textTransform: 'uppercase', letterSpacing: '0.04em',
                  background: '#E8F5E9', color: '#2E7D32',
                }}>
                  {u.role}
                </span>
              </div>
              <button
                onClick={() => handleRevoke(u.email)}
                style={{
                  padding: '4px 10px', borderRadius: 4, border: '1px solid #FFCDD2',
                  background: '#FEF2F2', color: '#C62828', fontSize: 11, fontWeight: 500,
                  cursor: 'pointer', fontFamily: 'var(--font-body, system-ui)',
                }}
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
