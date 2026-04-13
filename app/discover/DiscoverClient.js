'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'

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
  sba: 'Small Batch',
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
  // If no sentence boundary found, truncate at 120 chars
  if (text.length > 120) return text.slice(0, 120).trim() + '...'
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
  const [direction, setDirection] = useState(null) // 'left' or 'right' for animation
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

  // Fetch first listing on mount
  useEffect(() => {
    fetchListing()
  }, [fetchListing])

  // Check trail CTA threshold
  useEffect(() => {
    if (saveCount >= 5 && !showTrailCta) {
      setShowTrailCta(true)
    }
  }, [saveCount, showTrailCta])

  const handleSave = useCallback(async () => {
    if (!currentListing || animating) return

    setDirection('right')
    setAnimating(true)

    // Save to API
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

    // Animate out then fetch next
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

    // Only track horizontal swipes (ignore vertical scrolling)
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

    // Reset card position
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

  // Loading skeleton
  if (loading && !currentListing) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        backgroundColor: '#1a1a1a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          width: '80%',
          maxWidth: 400,
          height: 300,
          borderRadius: 16,
          backgroundColor: '#2a2a2a',
          animation: 'discoverPulse 2s ease-in-out infinite',
        }} />
        <style>{`
          @keyframes discoverPulse {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 0.7; }
          }
        `}</style>
      </div>
    )
  }

  // Exhausted state
  if (!currentListing && !loading) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        backgroundColor: '#1a1a1a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
      }}>
        <p style={{
          fontFamily: 'var(--font-display)',
          fontSize: 28,
          fontWeight: 400,
          color: '#fff',
          marginBottom: 12,
        }}>
          You've seen them all
        </p>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 15,
          fontWeight: 300,
          color: 'rgba(255,255,255,0.5)',
          marginBottom: 32,
          maxWidth: 360,
        }}>
          {saveCount > 0
            ? `You saved ${saveCount} place${saveCount !== 1 ? 's' : ''}. Build a trail from your discoveries.`
            : 'Come back tomorrow for more discoveries.'
          }
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          {saveCount > 0 && (
            <Link
              href="/trails/builder"
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 500,
                fontSize: 14,
                color: '#fff',
                backgroundColor: '#2d6a4f',
                padding: '12px 24px',
                borderRadius: 12,
                textDecoration: 'none',
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
              fontSize: 14,
              color: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(255,255,255,0.2)',
              padding: '12px 24px',
              borderRadius: 12,
              textDecoration: 'none',
            }}
          >
            Explore the network
          </Link>
        </div>
      </div>
    )
  }

  const verticalColor = VERTICAL_COLORS[currentListing.vertical] || '#5a6b7c'
  const verticalName = VERTICAL_NAMES[currentListing.vertical] || currentListing.vertical
  const snippet = getFirstSentence(currentListing.description)
  const locationParts = [currentListing.region, currentListing.state].filter(Boolean)

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
        backgroundColor: '#111',
        overflow: 'hidden',
      }}
    >
      {/* Background image */}
      {currentListing.hero_image_url && (
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${currentListing.hero_image_url})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'brightness(0.4)',
          transition: 'background-image 0.3s ease',
        }} />
      )}

      {/* Dark gradient overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0.4) 100%)',
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
        {/* Close / back */}
        <Link
          href="/explore"
          style={{
            color: 'rgba(255,255,255,0.7)',
            textDecoration: 'none',
            fontFamily: 'var(--font-body)',
            fontWeight: 400,
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 4px',
            minHeight: 44,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 19l-7-7 7-7" />
          </svg>
          Discover
        </Link>

        {/* Save counter badge */}
        {saveCount > 0 && (
          <span style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: 12,
            color: '#fff',
            backgroundColor: 'rgba(255,255,255,0.15)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            padding: '6px 14px',
            borderRadius: 20,
            border: '1px solid rgba(255,255,255,0.1)',
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
          padding: '0 24px 140px',
          zIndex: 5,
          ...cardAnimationStyle,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Vertical badge */}
        <span style={{
          alignSelf: 'flex-start',
          fontFamily: 'var(--font-body)',
          fontWeight: 500,
          fontSize: 11,
          letterSpacing: '0.03em',
          textTransform: 'uppercase',
          color: '#fff',
          backgroundColor: verticalColor,
          padding: '5px 12px',
          borderRadius: 20,
          marginBottom: 16,
        }}>
          {verticalName}
        </span>

        {/* Listing name */}
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          fontSize: 'clamp(28px, 7vw, 42px)',
          lineHeight: 1.15,
          color: '#fff',
          margin: '0 0 12px',
          maxWidth: 600,
        }}>
          {currentListing.name}
        </h1>

        {/* Description snippet */}
        {snippet && (
          <p style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 300,
            fontSize: 'clamp(14px, 3.5vw, 16px)',
            lineHeight: 1.6,
            color: 'rgba(255,255,255,0.7)',
            margin: '0 0 16px',
            maxWidth: 500,
          }}>
            {snippet}
          </p>
        )}

        {/* Location */}
        {locationParts.length > 0 && (
          <p style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 400,
            fontSize: 13,
            color: 'rgba(255,255,255,0.4)',
            margin: '0 0 12px',
            letterSpacing: '0.02em',
          }}>
            {locationParts.join(', ')}
          </p>
        )}

        {/* View listing link */}
        <Link
          href={`/place/${currentListing.slug}`}
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 400,
            fontSize: 13,
            color: 'rgba(255,255,255,0.5)',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '8px 0',
            minHeight: 44,
          }}
        >
          View listing
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
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
              fontSize: 13,
              color: 'rgba(255,255,255,0.8)',
              backgroundColor: 'rgba(45,106,79,0.3)',
              border: '1px solid rgba(45,106,79,0.4)',
              borderRadius: 12,
              padding: '12px 16px',
              textAlign: 'center',
              textDecoration: 'none',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              marginBottom: 4,
            }}
          >
            Build a trail from your discoveries?
          </Link>
        )}

        {/* Action buttons */}
        <div style={{
          display: 'flex',
          gap: 10,
        }}>
          {/* Skip button */}
          <button
            onClick={handleNext}
            disabled={loading || animating}
            style={{
              flex: 1,
              fontFamily: 'var(--font-body)',
              fontWeight: 500,
              fontSize: 14,
              color: 'rgba(255,255,255,0.7)',
              backgroundColor: 'transparent',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 14,
              padding: '14px 20px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              minHeight: 50,
              opacity: loading || animating ? 0.5 : 1,
            }}
          >
            Show me another
          </button>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={loading || animating}
            style={{
              flex: 1.2,
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              fontSize: 14,
              color: '#fff',
              backgroundColor: '#2d6a4f',
              border: '1px solid #3a8563',
              borderRadius: 14,
              padding: '14px 20px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              minHeight: 50,
              opacity: loading || animating ? 0.5 : 1,
            }}
          >
            I'd visit this
          </button>
        </div>

        {/* Swipe hint -- only show initially */}
        <p style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 300,
          fontSize: 11,
          color: 'rgba(255,255,255,0.25)',
          textAlign: 'center',
          margin: 0,
          padding: '4px 0 0',
        }}>
          Swipe right to save, left to skip
        </p>
      </div>
    </div>
  )
}
