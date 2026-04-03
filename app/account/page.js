'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getAuthSupabase } from '@/lib/supabase/auth-clients'

export default function AccountPage() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = getAuthSupabase()

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUser(user)

      // Fetch profile to get role
      try {
        const res = await fetch('/api/auth/profile')
        if (res.ok) {
          const data = await res.json()
          setProfile(data.profile)
        }
      } catch (err) {
        console.error('Failed to fetch profile:', err)
      }

      setLoading(false)
    }
    loadUser()
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-cream)' }}>
        <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}>Loading...</p>
      </div>
    )
  }

  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'there'
  const role = profile?.role || 'user'
  const isVendor = role === 'vendor'
  const isAdmin = role === 'admin'
  const isCouncil = role === 'council'

  return (
    <div style={{
      minHeight: '80vh',
      background: 'var(--color-cream)',
      padding: '3rem 1.5rem',
    }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: '2.5rem' }}>
            <h1 style={{
              fontFamily: 'var(--font-display)',
              fontSize: '2rem',
              fontWeight: 600,
              color: 'var(--color-ink)',
              margin: '0 0 0.375rem',
            }}>
              {displayName}
            </h1>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.95rem',
              color: 'var(--color-muted)',
              margin: 0,
            }}>
              {user?.email}
            </p>
            {role !== 'user' && (
              <span style={{
                display: 'inline-block',
                marginTop: '0.5rem',
                padding: '0.2rem 0.6rem',
                borderRadius: '999px',
                fontSize: '0.7rem',
                fontFamily: 'var(--font-body)',
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                background: isAdmin ? '#fef3c7' : isVendor ? '#dcfce7' : '#dbeafe',
                color: isAdmin ? '#92400e' : isVendor ? '#166534' : '#1e40af',
              }}>
                {role}
              </span>
            )}
          </div>

          {/* Role-specific actions */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem',
          }}>
            {/* Everyone gets these */}
            <ActionCard
              label="Saved places"
              description="Your bookmarked venues across the network"
              href="/account/saved"
              icon="heart"
            />
            <ActionCard
              label="My trails"
              description="Itineraries you've built"
              href="/account/trails"
              icon="trail"
            />
            <ActionCard
              label="Explore"
              description="Discover venues across Australia"
              href="/explore"
              icon="compass"
            />

            {/* Vendor-specific */}
            {(isVendor || isAdmin) && (
              <ActionCard
                label="Vendor Dashboard"
                description="Manage your listings and analytics"
                href="/dashboard"
                icon="dashboard"
                accent
              />
            )}

            {/* Admin-specific */}
            {isAdmin && (
              <ActionCard
                label="Admin"
                description="Network administration"
                href="/admin"
                icon="admin"
                accent
              />
            )}

            {/* Council-specific */}
            {isCouncil && (
              <ActionCard
                label="Council Dashboard"
                description="Manage your region and content"
                href="/council"
                icon="dashboard"
                accent
              />
            )}
          </div>

          {/* Account actions */}
          <div style={{
            borderTop: '1px solid var(--color-border)',
            paddingTop: '1.5rem',
            display: 'flex',
            gap: '1rem',
            flexWrap: 'wrap',
          }}>
            <button
              onClick={handleSignOut}
              style={{
                padding: '0.6rem 1.25rem',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: '#fff',
                fontFamily: 'var(--font-body)',
                fontSize: '0.875rem',
                color: 'var(--color-muted)',
                cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
              onMouseOver={(e) => e.currentTarget.style.borderColor = '#ef4444'}
              onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--color-border)'}
            >
              Sign out
            </button>
          </div>
        </div>
    </div>
  )
}

function ActionCard({ label, description, href, icon, accent }) {
  return (
    <Link
      href={href}
      style={{
        display: 'block',
        background: '#fff',
        borderRadius: '12px',
        border: accent ? '1px solid var(--color-sage)' : '1px solid var(--color-border)',
        padding: '1.25rem',
        textDecoration: 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-sage)'
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.borderColor = accent ? 'var(--color-sage)' : 'var(--color-border)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.95rem',
        fontWeight: 500,
        color: 'var(--color-ink)',
        margin: '0 0 0.25rem',
      }}>
        {label}
      </p>
      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.8rem',
        color: 'var(--color-muted)',
        margin: 0,
        lineHeight: 1.4,
      }}>
        {description}
      </p>
    </Link>
  )
}
