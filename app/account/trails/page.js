'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getAuthSupabase } from '@/lib/supabase/auth-clients'
import TrailActions from './TrailActions'

export default function MyTrailsPage() {
  const [user, setUser] = useState(null)
  const [trails, setTrails] = useState([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = getAuthSupabase()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUser(user)

      try {
        const res = await fetch(`/api/trails?created_by=${user.id}&limit=100`)
        if (res.ok) {
          const data = await res.json()
          setTrails(data.trails || [])
        }
      } catch (err) {
        console.error('Failed to fetch trails:', err)
      }

      setLoading(false)
    }
    load()
  }, [])

  async function reload() {
    if (!user) return
    try {
      const res = await fetch(`/api/trails?created_by=${user.id}&limit=100`)
      if (res.ok) {
        const data = await res.json()
        setTrails(data.trails || [])
      }
    } catch (err) {
      console.error('Failed to reload trails:', err)
    }
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '80vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-cream)',
      }}>
        <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}>Loading...</p>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '80vh',
      background: 'var(--color-cream)',
      padding: '3rem 1.5rem',
    }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '2rem',
        }}>
          <div>
            <Link
              href="/account"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.8rem',
                color: 'var(--color-muted)',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                marginBottom: '0.5rem',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Account
            </Link>
            <h1 style={{
              fontFamily: 'var(--font-display)',
              fontSize: '2rem',
              fontWeight: 600,
              color: 'var(--color-ink)',
              margin: 0,
            }}>
              My Trails
            </h1>
          </div>
          <Link
            href="/trails/builder"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0.6rem 1.1rem',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--color-sage, #5A7A6B)',
              color: '#fff',
              fontFamily: 'var(--font-body)',
              fontSize: '0.85rem',
              fontWeight: 500,
              textDecoration: 'none',
              transition: 'opacity 0.15s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New trail
          </Link>
        </div>

        {/* Empty state */}
        {trails.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '4rem 2rem',
            background: '#fff',
            borderRadius: '12px',
            border: '1px solid var(--color-border)',
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '1rem', opacity: 0.5 }}>
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: '1rem',
              color: 'var(--color-ink)',
              fontWeight: 500,
              margin: '0 0 0.5rem',
            }}>
              No trails yet
            </p>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.875rem',
              color: 'var(--color-muted)',
              margin: '0 0 1.5rem',
            }}>
              Create your first trail to curate venues across Australia.
            </p>
            <Link
              href="/trails/builder"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0.6rem 1.25rem',
                borderRadius: '8px',
                background: 'var(--color-sage, #5A7A6B)',
                color: '#fff',
                fontFamily: 'var(--font-body)',
                fontSize: '0.875rem',
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              Build your first trail
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </div>
        )}

        {/* Trail cards */}
        {trails.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {trails.map(trail => (
              <TrailCard key={trail.id} trail={trail} onDelete={reload} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function VisibilityBadge({ visibility }) {
  const config = {
    public: { label: 'Public', bg: '#dcfce7', color: '#166534' },
    link: { label: 'Link only', bg: '#dbeafe', color: '#1e40af' },
    private: { label: 'Private', bg: '#f3f4f6', color: '#6b7280' },
  }
  const c = config[visibility] || config.private
  return (
    <span style={{
      display: 'inline-block',
      padding: '0.15rem 0.5rem',
      borderRadius: '999px',
      fontSize: '0.65rem',
      fontFamily: 'var(--font-body)',
      fontWeight: 600,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      background: c.bg,
      color: c.color,
    }}>
      {c.label}
    </span>
  )
}

function TrailCard({ trail, onDelete }) {
  const createdDate = new Date(trail.created_at).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  const viewHref = trail.slug ? `/trails/${trail.slug}` : `/t/${trail.short_code}`

  return (
    <div style={{
      background: '#fff',
      borderRadius: '12px',
      border: '1px solid var(--color-border)',
      padding: '1.25rem',
      transition: 'border-color 0.15s, box-shadow 0.15s',
    }}>
      {/* Top row: title + visibility */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '0.75rem',
        marginBottom: '0.5rem',
      }}>
        <Link
          href={viewHref}
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.1rem',
            fontWeight: 600,
            color: 'var(--color-ink)',
            textDecoration: 'none',
            lineHeight: 1.3,
          }}
        >
          {trail.title}
        </Link>
        <VisibilityBadge visibility={trail.visibility} />
      </div>

      {/* Meta row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        marginBottom: '1rem',
        flexWrap: 'wrap',
      }}>
        {trail.stop_count > 0 && (
          <span style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.8rem',
            color: 'var(--color-muted)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {trail.stop_count} {trail.stop_count === 1 ? 'stop' : 'stops'}
          </span>
        )}
        {trail.region && (
          <span style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.8rem',
            color: 'var(--color-muted)',
          }}>
            {trail.region}
          </span>
        )}
        <span style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.8rem',
          color: 'var(--color-muted)',
        }}>
          {createdDate}
        </span>
      </div>

      {/* Action buttons */}
      <TrailActions
        trailId={trail.id}
        shortCode={trail.short_code}
        slug={trail.slug}
        visibility={trail.visibility}
        onDelete={onDelete}
      />
    </div>
  )
}
