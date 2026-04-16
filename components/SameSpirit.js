'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import VerticalBadge from '@/components/VerticalBadge'
import { isApprovedImageSource } from '@/lib/image-utils'

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

function SkeletonCard() {
  return (
    <div style={{
      minWidth: 260,
      maxWidth: 320,
      flex: '0 0 auto',
      borderRadius: 12,
      overflow: 'hidden',
      border: '1px solid var(--color-border)',
      background: 'var(--color-card-bg, #fff)',
    }}>
      <div style={{
        height: 200,
        background: 'linear-gradient(90deg, var(--color-cream, #f5f2ec) 25%, #e8e4de 50%, var(--color-cream, #f5f2ec) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s ease-in-out infinite',
      }} />
      <div style={{ padding: '14px 16px' }}>
        <div style={{
          height: 12,
          width: '60%',
          borderRadius: 4,
          background: 'var(--color-border)',
          marginBottom: 10,
        }} />
        <div style={{
          height: 16,
          width: '80%',
          borderRadius: 4,
          background: 'var(--color-border)',
          marginBottom: 8,
        }} />
        <div style={{
          height: 11,
          width: '50%',
          borderRadius: 4,
          background: 'var(--color-border)',
        }} />
      </div>
    </div>
  )
}

export default function SameSpirit({ listingId, vertical, suburb }) {
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!listingId) return

    let cancelled = false
    setLoading(true)

    fetch(`/api/similar?listing_id=${encodeURIComponent(listingId)}`)
      .then(res => res.json())
      .then(data => {
        if (!cancelled) {
          setResults(data.results || [])
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResults([])
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [listingId])

  // Nothing to show
  if (!loading && (!results || results.length === 0)) return null

  return (
    <section style={{ marginBottom: 40 }}>
      {/* Shimmer keyframes */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          fontSize: 22,
          color: 'var(--color-ink)',
          margin: 0,
          lineHeight: 1.3,
        }}>
          In the same spirit
        </h2>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          fontWeight: 300,
          color: 'var(--color-muted)',
          margin: '4px 0 0',
          lineHeight: 1.5,
        }}>
          Independent places with a similar character
        </p>
      </div>

      {/* Cards container: horizontal scroll on mobile, 3-col grid on desktop */}
      {loading ? (
        <div style={{
          display: 'flex',
          gap: 16,
          overflowX: 'auto',
          paddingBottom: 8,
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
        }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'repeat(3, 1fr)',
        }}>
          <style>{`
            @media (max-width: 768px) {
              .same-spirit-grid {
                display: flex !important;
                overflow-x: auto !important;
                scroll-snap-type: x mandatory !important;
                -webkit-overflow-scrolling: touch !important;
                padding-bottom: 8px !important;
                grid-template-columns: unset !important;
              }
              .same-spirit-grid > a {
                min-width: 260px !important;
                max-width: 300px !important;
                flex: 0 0 auto !important;
                scroll-snap-align: start !important;
              }
            }
          `}</style>
          <div className="same-spirit-grid" style={{
            display: 'grid',
            gap: 16,
            gridTemplateColumns: 'repeat(3, 1fr)',
          }}>
            {results.map(item => (
              <SpiritCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function SpiritCard({ item }) {
  const vertColor = VERTICAL_COLORS[item.vertical] || '#5F8A7E'
  const location = [item.region, item.state].filter(Boolean).join(', ')
  const hasImage = isApprovedImageSource(item.hero_image_url)

  return (
    <Link
      href={`/place/${item.slug}`}
      style={{
        display: 'block',
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid var(--color-border)',
        background: 'var(--color-card-bg, #fff)',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'none'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {/* Image */}
      <div style={{
        height: 200,
        overflow: 'hidden',
        position: 'relative',
        background: hasImage ? 'var(--color-cream)' : vertColor,
      }}>
        {hasImage ? (
          <img
            src={item.hero_image_url}
            alt={item.name}
            loading="lazy"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transition: 'transform 0.3s ease',
            }}
          />
        ) : (
          <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}>
            <span style={{
              fontFamily: 'var(--font-display)',
              fontSize: 18,
              fontWeight: 400,
              fontStyle: 'italic',
              color: 'rgba(255,255,255,0.7)',
              textAlign: 'center',
            }}>
              {item.name}
            </span>
          </div>
        )}

        {/* Vertical badge */}
        <div style={{ position: 'absolute', bottom: 10, left: 10 }}>
          <VerticalBadge vertical={item.vertical} />
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '14px 16px' }}>
        <h4 style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 500,
          fontSize: 15,
          color: 'var(--color-ink)',
          margin: 0,
          lineHeight: 1.3,
        }}>
          {item.name}
        </h4>
        {location && (
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            fontWeight: 300,
            color: 'var(--color-muted)',
            margin: '4px 0 0',
          }}>
            {location}
          </p>
        )}
      </div>
    </Link>
  )
}
