'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import './discover.css'

const VERTICAL_COLORS = {
  sba: '#6b3a2a',
  collection: '#5a6b7c',
  craft: '#7c6b5a',
  fine_grounds: '#5F8A7E',
  rest: '#8a5a6b',
  field: '#5a7c5a',
  corner: '#7c5a7c',
  found: '#5a7c6b',
  table: '#7c6b5a',
}

const VERTICAL_NAMES = {
  sba: 'Small Batch Atlas',
  collection: 'Culture Atlas',
  craft: 'Maker Studios',
  fine_grounds: 'Fine Grounds',
  rest: 'Boutique Stays',
  field: 'Field Atlas',
  corner: 'Corner Atlas',
  found: 'Found Atlas',
  table: 'Table Atlas',
}

function getFirstSentence(text) {
  if (!text) return ''
  const match = text.match(/^(.+?[.!?])\s/)
  if (match) return match[1]
  if (text.length > 120) return text.slice(0, 120).trim() + '\u2026'
  return text
}

function generateSessionId() {
  return 'srdp_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export default function DiscoverClient() {
  const [currentListing, setCurrentListing] = useState(null)
  const [savedListings, setSavedListings] = useState([])
  const [seenIds, setSeenIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [saveCount, setSaveCount] = useState(0)
  const [sessionId] = useState(() => generateSessionId())
  const [showTrailCta, setShowTrailCta] = useState(false)
  const [direction, setDirection] = useState(null)
  const [animating, setAnimating] = useState(false)

  // Touch/swipe state
  const touchStartX = useRef(null)
  const touchStartY = useRef(null)
  const touchDeltaX = useRef(0)
  const cardRef = useRef(null)
  const SWIPE_THRESHOLD = 80

  const fetchListing = useCallback(async (excludeIds = [], lastVertical = '') => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (excludeIds.length > 0) params.set('exclude', excludeIds.join(','))
      if (lastVertical) params.set('last_vertical', lastVertical)

      const res = await fetch(`/api/discover?${params}`)
      const data = await res.json()

      if (data.listing) {
        setCurrentListing(data.listing)
        setSeenIds(prev => [...prev, String(data.listing.id)])
      } else {
        setCurrentListing(null)
      }
    } catch (err) {
      console.error('Discover fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchListing()
  }, [fetchListing])

  useEffect(() => {
    if (saveCount >= 5 && !showTrailCta) {
      setShowTrailCta(true)
    }
  }, [saveCount, showTrailCta])

  const handleSave = useCallback(async () => {
    if (!currentListing || animating) return

    setDirection('right')
    setAnimating(true)

    try {
      const res = await fetch('/api/discover/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: currentListing.id,
          session_id: sessionId,
        }),
      })
      const data = await res.json()
      if (data.save_count) setSaveCount(data.save_count)
    } catch (err) {
      console.error('Save error:', err)
    }

    setSavedListings(prev => [...prev, currentListing])

    setTimeout(() => {
      const lastVertical = currentListing?.vertical || ''
      setAnimating(false)
      setDirection(null)
      fetchListing(seenIds, lastVertical)
    }, 300)
  }, [currentListing, animating, sessionId, seenIds, fetchListing])

  const handleNext = useCallback(() => {
    if (!currentListing || animating) return

    setDirection('left')
    setAnimating(true)

    setTimeout(() => {
      const lastVertical = currentListing?.vertical || ''
      setAnimating(false)
      setDirection(null)
      fetchListing(seenIds, lastVertical)
    }, 300)
  }, [currentListing, animating, seenIds, fetchListing])

  // Touch handlers for swipe
  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    touchDeltaX.current = 0
  }, [])

  const handleTouchMove = useCallback((e) => {
    if (touchStartX.current === null) return
    const deltaX = e.touches[0].clientX - touchStartX.current
    const deltaY = e.touches[0].clientY - touchStartY.current

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      e.preventDefault()
      touchDeltaX.current = deltaX
      if (cardRef.current) {
        cardRef.current.style.transform = `translateX(${deltaX * 0.4}px) rotate(${deltaX * 0.02}deg)`
        cardRef.current.style.transition = 'none'
      }
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (touchStartX.current === null) return

    const delta = touchDeltaX.current

    if (cardRef.current) {
      cardRef.current.style.transform = ''
      cardRef.current.style.transition = 'transform 0.3s ease'
    }

    if (delta > SWIPE_THRESHOLD) {
      handleSave()
    } else if (delta < -SWIPE_THRESHOLD) {
      handleNext()
    }

    touchStartX.current = null
    touchStartY.current = null
    touchDeltaX.current = 0
  }, [handleSave, handleNext])

  // ── Loading skeleton ────────────────────────────────────
  if (loading && !currentListing) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        backgroundColor: '#141210',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
      }}>
        <div style={{
          width: 48,
          height: 1,
          backgroundColor: 'rgba(184, 134, 43, 0.3)',
          borderRadius: 1,
          animation: 'discoverPulse 2s ease-in-out infinite',
        }} />
        <p style={{
          fontFamily: 'var(--font-display)',
          fontStyle: 'italic',
          fontSize: 15,
          fontWeight: 400,
          color: 'rgba(255,255,255,0.25)',
          margin: 0,
          letterSpacing: '0.02em',
        }}>
          Finding something good
        </p>
      </div>
    )
  }

  // ── Exhausted state ─────────────────────────────────────
  if (!currentListing && !loading) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        backgroundColor: '#141210',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
      }}>
        <div style={{
          width: 48,
          height: 1,
          backgroundColor: 'rgba(184, 134, 43, 0.2)',
          borderRadius: 1,
          marginBottom: 24,
        }} />
        <p style={{
          fontFamily: 'var(--font-display)',
          fontStyle: 'italic',
          fontSize: 'clamp(24px, 5vw, 32px)',
          fontWeight: 400,
          color: '#fff',
          marginBottom: 12,
        }}>
          {"You\u2019ve seen them all"}
        </p>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          fontWeight: 300,
          color: 'rgba(255,255,255,0.4)',
          marginBottom: 36,
          maxWidth: 340,
          lineHeight: 1.6,
        }}>
          {saveCount > 0
            ? `${saveCount} place${saveCount !== 1 ? 's' : ''} saved. Turn them into a trail.`
            : 'Come back tomorrow for more discoveries.'
          }
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          {saveCount > 0 && (
            <Link
              href="/trails/builder"
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 500,
                fontSize: 13,
                color: '#fff',
                backgroundColor: 'rgba(184, 134, 43, 0.2)',
                border: '1px solid rgba(184, 134, 43, 0.3)',
                padding: '12px 24px',
                borderRadius: 10,
                textDecoration: 'none',
                transition: 'background-color 0.2s',
              }}
            >
              Build a trail
            </Link>
          )}
          <Link
            href="/explore"
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 500,
              fontSize: 13,
              color: 'rgba(255,255,255,0.5)',
              border: '1px solid rgba(255,255,255,0.12)',
              padding: '12px 24px',
              borderRadius: 10,
              textDecoration: 'none',
            }}
          >
            Explore the network
          </Link>
        </div>
      </div>
    )
  }

  // ── Active card ─────────────────────────────────────────
  const verticalColor = VERTICAL_COLORS[currentListing.vertical] || '#5a6b7c'
  const verticalName = VERTICAL_NAMES[currentListing.vertical] || currentListing.vertical
  const snippet = getFirstSentence(currentListing.description)
  const locationParts = [currentListing.suburb, currentListing.region, currentListing.state].filter(Boolean)
  const hasHero = !!currentListing.hero_image_url
  const initial = (currentListing.name || '?')[0].toUpperCase()

  const cardAnimationStyle = animating
    ? {
        transform: direction === 'right'
          ? 'translateX(120%) rotate(8deg)'
          : 'translateX(-120%) rotate(-8deg)',
        opacity: 0,
        transition: 'transform 0.3s ease, opacity 0.3s ease',
      }
    : {
        transform: 'translateX(0) rotate(0deg)',
        opacity: 1,
        transition: 'transform 0.3s ease, opacity 0.3s ease',
      }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        backgroundColor: '#141210',
        overflow: 'hidden',
      }}
    >
      {/* Background — hero image OR typographic fallback */}
      {hasHero ? (
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${currentListing.hero_image_url})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'brightness(0.35) saturate(0.85)',
          transition: 'background-image 0.3s ease',
        }} />
      ) : (
        <div
          className="discover-typo-fallback"
          data-initial={initial}
          style={{ backgroundColor: '#1a1815' }}
        />
      )}

      {/* Gradient overlay — stronger at bottom for text legibility */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: hasHero
          ? 'linear-gradient(to top, rgba(20,18,16,0.92) 0%, rgba(20,18,16,0.5) 35%, rgba(20,18,16,0.1) 55%, rgba(20,18,16,0.45) 100%)'
          : 'linear-gradient(to top, rgba(20,18,16,0.7) 0%, transparent 40%)',
      }} />

      {/* Top bar */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 10,
      }}>
        <Link
          href="/"
          style={{
            color: 'rgba(255,255,255,0.5)',
            textDecoration: 'none',
            fontFamily: 'var(--font-body)',
            fontWeight: 400,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 4px',
            minHeight: 44,
            letterSpacing: '0.02em',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 19l-7-7 7-7" />
          </svg>
          Atlas
        </Link>

        {/* Save counter */}
        {saveCount > 0 && (
          <span style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 400,
            fontSize: 11,
            letterSpacing: '0.04em',
            color: 'rgba(255,255,255,0.6)',
            backgroundColor: 'rgba(255,255,255,0.08)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            padding: '6px 14px',
            borderRadius: 20,
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            {saveCount} saved
          </span>
        )}
      </div>

      {/* Main card content */}
      <div
        ref={cardRef}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: '0 24px 150px',
          zIndex: 5,
          ...cardAnimationStyle,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Vertical badge — uses vertical display name, not sub_type */}
        <span style={{
          alignSelf: 'flex-start',
          fontFamily: 'var(--font-body)',
          fontWeight: 500,
          fontSize: 10,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: '#fff',
          backgroundColor: verticalColor,
          padding: '4px 12px',
          borderRadius: 20,
          marginBottom: 16,
          opacity: 0.9,
        }}>
          {verticalName}
        </span>

        {/* Listing name */}
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          fontSize: 'clamp(26px, 7vw, 40px)',
          lineHeight: 1.12,
          color: '#fff',
          margin: '0 0 14px',
          maxWidth: 560,
          letterSpacing: '-0.01em',
        }}>
          {currentListing.name}
        </h1>

        {/* Description snippet */}
        {snippet && (
          <p style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 300,
            fontSize: 'clamp(14px, 3.5vw, 15px)',
            lineHeight: 1.65,
            color: 'rgba(255,255,255,0.6)',
            margin: '0 0 16px',
            maxWidth: 480,
          }}>
            {snippet}
          </p>
        )}

        {/* Location */}
        {locationParts.length > 0 && (
          <p style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 400,
            fontSize: 12,
            color: 'rgba(255,255,255,0.3)',
            margin: '0 0 14px',
            letterSpacing: '0.03em',
          }}>
            {locationParts.join(' \u00b7 ')}
          </p>
        )}

        {/* View listing link — arrow animates on hover */}
        <Link
          href={`/place/${currentListing.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="discover-view-link"
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 400,
            fontSize: 12,
            color: 'rgba(184, 134, 43, 0.7)',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 0',
            minHeight: 44,
            letterSpacing: '0.02em',
          }}
        >
          View listing
          <svg className="discover-view-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
            <path d="M12 5l7 7-7 7" />
          </svg>
        </Link>
      </div>

      {/* Bottom action bar */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '20px 24px',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        {/* Trail CTA banner */}
        {showTrailCta && (
          <Link
            href="/trails/builder"
            style={{
              display: 'block',
              fontFamily: 'var(--font-body)',
              fontWeight: 400,
              fontSize: 12,
              color: 'rgba(184, 134, 43, 0.8)',
              backgroundColor: 'rgba(184, 134, 43, 0.08)',
              border: '1px solid rgba(184, 134, 43, 0.15)',
              borderRadius: 10,
              padding: '11px 16px',
              textAlign: 'center',
              textDecoration: 'none',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              marginBottom: 4,
              letterSpacing: '0.02em',
            }}
          >
            Turn your saves into a trail
          </Link>
        )}

        {/* Action buttons — side by side */}
        <div className="discover-actions">
          {/* Skip */}
          <button
            onClick={handleNext}
            disabled={loading || animating}
            className="discover-skip-btn"
            style={{
              flex: 1,
              fontFamily: 'var(--font-body)',
              fontWeight: 500,
              fontSize: 13,
              color: 'rgba(255,255,255,0.55)',
              backgroundColor: 'transparent',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 12,
              padding: '14px 20px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              minHeight: 50,
              opacity: loading || animating ? 0.4 : 1,
              letterSpacing: '0.02em',
            }}
          >
            Next
          </button>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={loading || animating}
            className="discover-save-btn"
            style={{
              flex: 1.2,
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              fontSize: 13,
              color: '#fff',
              backgroundColor: 'rgba(184, 134, 43, 0.25)',
              border: '1px solid rgba(184, 134, 43, 0.35)',
              borderRadius: 12,
              padding: '14px 20px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              minHeight: 50,
              opacity: loading || animating ? 0.4 : 1,
              letterSpacing: '0.02em',
            }}
          >
            {"I\u2019d visit this"}
          </button>
        </div>

        {/* Swipe hint — mobile only (hidden on desktop via CSS) */}
        <p
          className="discover-swipe-hint"
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 300,
            fontSize: 10,
            color: 'rgba(255,255,255,0.18)',
            textAlign: 'center',
            margin: 0,
            padding: '4px 0 0',
            letterSpacing: '0.04em',
          }}
        >
          Swipe right to save, left to skip
        </p>
      </div>
    </div>
  )
}
