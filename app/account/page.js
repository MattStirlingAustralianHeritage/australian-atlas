'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getAuthSupabase } from '@/lib/supabase/auth-clients'

// Interest options grouped by category
const VERTICAL_OPTIONS = [
  { key: 'sba', label: 'Breweries & Wineries' },
  { key: 'fine_grounds', label: 'Specialty Coffee' },
  { key: 'table', label: 'Food & Produce' },
  { key: 'field', label: 'Nature & Outdoors' },
  { key: 'collection', label: 'Art & Culture' },
  { key: 'craft', label: 'Makers & Studios' },
  { key: 'rest', label: 'Boutique Stays' },
  { key: 'corner', label: 'Independent Shops' },
  { key: 'found', label: 'Vintage & Secondhand' },
]

const ACTIVITY_OPTIONS = [
  { key: 'wine_tasting', label: 'Wine tasting', group: 'Drink' },
  { key: 'craft_beer', label: 'Craft beer', group: 'Drink' },
  { key: 'distillery_tours', label: 'Distillery tours', group: 'Drink' },
  { key: 'coffee', label: 'Specialty coffee', group: 'Drink' },
  { key: 'hiking', label: 'Hiking & walks', group: 'Outdoors' },
  { key: 'swimming', label: 'Swimming holes', group: 'Outdoors' },
  { key: 'lookouts', label: 'Lookouts & views', group: 'Outdoors' },
  { key: 'national_parks', label: 'National parks', group: 'Outdoors' },
  { key: 'galleries', label: 'Galleries', group: 'Culture' },
  { key: 'museums', label: 'Museums', group: 'Culture' },
  { key: 'heritage', label: 'Heritage sites', group: 'Culture' },
  { key: 'makers_studios', label: 'Maker studios', group: 'Craft' },
  { key: 'ceramics', label: 'Ceramics & pottery', group: 'Craft' },
  { key: 'farm_gate', label: 'Farm gates', group: 'Food' },
  { key: 'markets', label: 'Markets', group: 'Food' },
  { key: 'bakeries', label: 'Bakeries', group: 'Food' },
  { key: 'boutique_stays', label: 'Boutique hotels', group: 'Stay' },
  { key: 'glamping', label: 'Glamping', group: 'Stay' },
  { key: 'farm_stays', label: 'Farm stays', group: 'Stay' },
  { key: 'bookshops', label: 'Bookshops', group: 'Shop' },
  { key: 'vintage', label: 'Vintage & retro', group: 'Shop' },
  { key: 'op_shops', label: 'Op shops', group: 'Shop' },
]

const STATE_OPTIONS = [
  { key: 'VIC', label: 'Victoria' },
  { key: 'NSW', label: 'New South Wales' },
  { key: 'QLD', label: 'Queensland' },
  { key: 'SA', label: 'South Australia' },
  { key: 'WA', label: 'Western Australia' },
  { key: 'TAS', label: 'Tasmania' },
  { key: 'ACT', label: 'ACT' },
  { key: 'NT', label: 'Northern Territory' },
]

export default function AccountPage() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [interests, setInterests] = useState({ verticals: [], activities: [], regions: [], dietary: [] })
  const [claims, setClaims] = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
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

      // Claims this person has going. Never block the page on it — a claim
      // list that fails to load must not cost them their account page.
      try {
        const res = await fetch('/api/account/claims')
        if (res.ok) {
          const data = await res.json()
          setClaims(data.claims || [])
        }
      } catch (err) {
        console.error('Failed to fetch claims:', err)
      }

      // Fetch preferences
      try {
        const res = await fetch('/api/auth/preferences')
        if (res.ok) {
          const data = await res.json()
          if (data.interests && Object.keys(data.interests).length > 0) {
            setInterests({
              verticals: data.interests.verticals || [],
              activities: data.interests.activities || [],
              regions: data.interests.regions || [],
              dietary: data.interests.dietary || [],
            })
          }
        }
      } catch (err) {
        console.error('Failed to fetch preferences:', err)
      }

      setLoading(false)
    }
    loadUser()
  }, [])

  function toggleInterest(category, key) {
    setInterests(prev => {
      const list = prev[category] || []
      const updated = list.includes(key)
        ? list.filter(k => k !== key)
        : [...list, key]
      return { ...prev, [category]: updated }
    })
    setSaved(false)
  }

  async function savePreferences() {
    setSaving(true)
    try {
      const res = await fetch('/api/auth/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(interests),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } catch (err) {
      console.error('Failed to save preferences:', err)
    }
    setSaving(false)
  }

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

          {/* Claims in flight. Shown above everything else because someone who
              has claimed a venue came here to find out where it stands. */}
          {claims.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.75rem',
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--color-muted)',
                margin: '0 0 0.75rem',
              }}>
                Your listings
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {claims.map(claim => <ClaimStatusRow key={claim.id} claim={claim} />)}
              </div>
            </div>
          )}

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

          {/* My Preferences */}
          <div style={{
            borderTop: '1px solid var(--color-border)',
            paddingTop: '2rem',
            marginBottom: '2rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <h2 style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.25rem',
                fontWeight: 600,
                color: 'var(--color-ink)',
                margin: 0,
              }}>
                My preferences
              </h2>
              <button
                onClick={savePreferences}
                disabled={saving}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: saved ? '#dcfce7' : 'var(--color-sage, #5A7A6B)',
                  color: saved ? '#166534' : '#fff',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  cursor: saving ? 'wait' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                  transition: 'all 0.2s',
                }}
              >
                {saving ? 'Saving...' : saved ? 'Saved' : 'Save preferences'}
              </button>
            </div>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.85rem',
              color: 'var(--color-muted)',
              margin: '0 0 1.5rem',
              lineHeight: 1.5,
            }}>
              Select your interests to personalise trail recommendations and discover more of what you love.
            </p>

            {/* Verticals — what are you into? */}
            <PreferenceSection title="What are you into?">
              <ChipGrid
                options={VERTICAL_OPTIONS}
                selected={interests.verticals}
                onToggle={(key) => toggleInterest('verticals', key)}
              />
            </PreferenceSection>

            {/* Activities */}
            <PreferenceSection title="Favourite activities">
              <ChipGrid
                options={ACTIVITY_OPTIONS}
                selected={interests.activities}
                onToggle={(key) => toggleInterest('activities', key)}
              />
            </PreferenceSection>

            {/* Regions */}
            <PreferenceSection title="States you explore most">
              <ChipGrid
                options={STATE_OPTIONS}
                selected={interests.regions}
                onToggle={(key) => toggleInterest('regions', key)}
              />
            </PreferenceSection>
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

function PreferenceSection({ title, children }) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.8rem',
        fontWeight: 600,
        color: 'var(--color-ink)',
        margin: '0 0 0.625rem',
        letterSpacing: '0.02em',
      }}>
        {title}
      </p>
      {children}
    </div>
  )
}

function ChipGrid({ options, selected, onToggle }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
      {options.map(opt => {
        const isActive = selected.includes(opt.key)
        return (
          <button
            key={opt.key}
            onClick={() => onToggle(opt.key)}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: '100px',
              border: isActive ? '1.5px solid var(--color-sage, #5A7A6B)' : '1px solid var(--color-border)',
              background: isActive ? 'var(--color-sage, #5A7A6B)' : '#fff',
              color: isActive ? '#fff' : 'var(--color-ink)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.8rem',
              fontWeight: isActive ? 500 : 400,
              cursor: 'pointer',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// One line per claim, saying what is true right now and what to do next.
//
// The states are the ones an operator can actually be in, and each says who
// the ball is with. 'awaiting_email' is the one that most needed saying out
// loud: the claim is approved but the listing belongs to nobody until they
// open the link, and previously nothing anywhere told them that.
const CLAIM_STATES = {
  in_review: {
    label: 'In review',
    tone: { bg: '#fef3c7', fg: '#92400e' },
    detail: 'We check claims by hand, usually within 48 hours.',
  },
  awaiting_email: {
    label: 'Confirm your email',
    tone: { bg: '#fed7aa', fg: '#9a3412' },
    detail: 'Approved — but the listing is not yours until you open the link we emailed you. Use “Forgot password?” on the sign-in page if it has expired.',
  },
  approved_settling: {
    label: 'Approved',
    tone: { bg: '#dcfce7', fg: '#166534' },
    detail: 'Setting up your access now. Refresh in a moment.',
  },
  owned: {
    label: 'Yours',
    tone: { bg: '#dcfce7', fg: '#166534' },
    detail: null,
  },
  declined: {
    label: 'Not approved',
    tone: { bg: '#fee2e2', fg: '#991b1b' },
    detail: 'We could not verify this claim. Reply to our email, or write to listings@australianatlas.com.au.',
  },
}

function ClaimStatusRow({ claim }) {
  const state = CLAIM_STATES[claim.state] || {
    label: claim.state,
    tone: { bg: '#f3f4f6', fg: '#374151' },
    detail: null,
  }
  const detail = claim.state === 'owned' && claim.tier
    ? `${claim.tier === 'standard' ? 'Standard' : 'Free'} listing`
    : state.detail

  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--color-border)',
      borderRadius: '10px',
      padding: '0.875rem 1rem',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: '1rem',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.95rem',
          fontWeight: 500,
          color: 'var(--color-ink)',
          marginBottom: detail ? '0.25rem' : 0,
        }}>
          {claim.name || 'Your listing'}
        </div>
        {detail && (
          <div style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.8rem',
            fontWeight: 300,
            color: 'var(--color-muted)',
            lineHeight: 1.5,
          }}>
            {detail}
          </div>
        )}
        {claim.dashboardUrl && (
          <Link href={claim.dashboardUrl} style={{
            display: 'inline-block',
            marginTop: '0.4rem',
            fontFamily: 'var(--font-body)',
            fontSize: '0.8rem',
            fontWeight: 500,
            color: 'var(--color-sage)',
            textDecoration: 'none',
          }}>
            Manage listing →
          </Link>
        )}
      </div>
      <span style={{
        flexShrink: 0,
        padding: '0.2rem 0.6rem',
        borderRadius: '999px',
        fontSize: '0.68rem',
        fontFamily: 'var(--font-body)',
        fontWeight: 600,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        background: state.tone.bg,
        color: state.tone.fg,
        whiteSpace: 'nowrap',
      }}>
        {state.label}
      </span>
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
