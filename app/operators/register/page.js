'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const OPERATOR_TYPES = [
  { value: '', label: 'Select your operator type' },
  { value: 'day_tour', label: 'Day tour operator' },
  { value: 'multi_day', label: 'Multi-day tour company' },
  { value: 'inbound_agency', label: 'Inbound travel agency' },
  { value: 'travel_designer', label: 'Travel designer' },
  { value: 'other', label: 'Other' },
]

export default function OperatorRegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    business_name: '',
    contact_name: '',
    email: '',
    password: '',
    operator_type: '',
    website: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function updateField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/operators/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Registration failed. Please try again.')
      } else {
        router.push('/operators/dashboard?registered=1')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    fontFamily: 'var(--font-body)',
    fontSize: '1rem',
    color: 'var(--color-ink)',
    background: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const labelStyle = {
    display: 'block',
    fontFamily: 'var(--font-body)',
    fontSize: '0.85rem',
    color: 'var(--color-muted)',
    marginBottom: '0.375rem',
  }

  const buttonStyle = {
    width: '100%',
    padding: '0.8rem 1rem',
    borderRadius: '8px',
    border: 'none',
    background: 'var(--color-sage)',
    color: '#fff',
    fontFamily: 'var(--font-body)',
    fontSize: '0.95rem',
    fontWeight: 500,
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.7 : 1,
    transition: 'background 0.15s',
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg)',
      padding: '2rem',
    }}>
      <div style={{ width: '100%', maxWidth: '480px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <Link href="/" style={{ textDecoration: 'none', color: 'var(--color-ink)' }}>
            <h1 style={{
              fontFamily: 'var(--font-display)',
              fontSize: '2rem',
              fontWeight: 400,
              marginBottom: '0.25rem',
            }}>
              Australian Atlas
            </h1>
          </Link>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.75rem',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'var(--color-muted)',
            marginBottom: '0.75rem',
          }}>
            Operator Registration
          </p>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.95rem',
            color: 'var(--color-muted)',
            lineHeight: 1.5,
          }}>
            Create your operator account to start building itineraries
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
          padding: '2rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={labelStyle}>Business name *</label>
              <input
                type="text"
                value={form.business_name}
                onChange={(e) => updateField('business_name', e.target.value)}
                required
                placeholder="Your company name"
                style={inputStyle}
                onFocus={(e) => e.target.style.borderColor = 'var(--color-sage)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
              />
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={labelStyle}>Contact name *</label>
              <input
                type="text"
                value={form.contact_name}
                onChange={(e) => updateField('contact_name', e.target.value)}
                required
                placeholder="Your full name"
                style={inputStyle}
                onFocus={(e) => e.target.style.borderColor = 'var(--color-sage)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
              />
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={labelStyle}>Email address *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                required
                placeholder="you@company.com"
                style={inputStyle}
                onFocus={(e) => e.target.style.borderColor = 'var(--color-sage)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
              />
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={labelStyle}>Password *</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => updateField('password', e.target.value)}
                required
                minLength={8}
                placeholder="Minimum 8 characters"
                style={inputStyle}
                onFocus={(e) => e.target.style.borderColor = 'var(--color-sage)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
              />
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={labelStyle}>Operator type *</label>
              <select
                value={form.operator_type}
                onChange={(e) => updateField('operator_type', e.target.value)}
                required
                style={{ ...inputStyle, appearance: 'auto' }}
                onFocus={(e) => e.target.style.borderColor = 'var(--color-sage)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
              >
                {OPERATOR_TYPES.map(opt => (
                  <option key={opt.value} value={opt.value} disabled={opt.value === ''}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={labelStyle}>Website (optional)</label>
              <input
                type="url"
                value={form.website}
                onChange={(e) => updateField('website', e.target.value)}
                placeholder="https://yourcompany.com"
                style={inputStyle}
                onFocus={(e) => e.target.style.borderColor = 'var(--color-sage)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
              />
            </div>

            {error && (
              <div style={{
                padding: '0.625rem 0.875rem',
                borderRadius: '8px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                fontFamily: 'var(--font-body)',
                fontSize: '0.85rem',
                marginBottom: '1rem',
              }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={buttonStyle}>
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
        </div>

        {/* Bottom link */}
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
            color: 'var(--color-muted)',
          }}>
            Already have an account?{' '}
            <Link href="/operators/login" style={{ color: 'var(--color-sage)', textDecoration: 'underline', textUnderlineOffset: '3px' }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
