'use client'

import { useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { ATLAS_DARK_STYLE } from '@/lib/atlas-map-style'

const STATE_LABELS = {
  VIC: 'Victoria',
  NSW: 'New South Wales',
  QLD: 'Queensland',
  SA: 'South Australia',
  WA: 'Western Australia',
  TAS: 'Tasmania',
  ACT: 'Australian Capital Territory',
  NT: 'Northern Territory',
}

/**
 * Region card with an inline Mapbox GL JS map instance.
 * Uses IntersectionObserver for lazy init/destroy to manage performance
 * across 30+ cards on the page.
 *
 * Props:
 *   region: { name, slug, state, center_lat, center_lng, map_zoom, listing_count }
 *   isOrphanLast: boolean — if true, card spans full grid width
 */
export default function RegionMapCard({ region, isOrphanLast }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const observerRef = useRef(null)

  const hasCoords = region.center_lat && region.center_lng
  const count = region.listing_count || 0

  const initMap = useCallback(() => {
    if (mapInstance.current || !mapRef.current || !hasCoords) return

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      // Guard against double-init race
      if (mapInstance.current || !mapRef.current) return

      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

      try {
        const map = new mapboxgl.Map({
          container: mapRef.current,
          style: ATLAS_DARK_STYLE,
          center: [region.center_lng, region.center_lat],
          zoom: (region.map_zoom || 9) - 1,
          interactive: false,
          attributionControl: false,
          fadeDuration: 0,
          preserveDrawingBuffer: true,
        })

        mapInstance.current = map

        map.on('error', () => {
          // On error, destroy and let fallback show
          destroyMap()
        })
      } catch {
        // GL context failure — fallback UI shows automatically
      }
    }).catch(() => {
      // Import failure — fallback UI shows automatically
    })
  }, [hasCoords, region.center_lat, region.center_lng, region.map_zoom])

  const destroyMap = useCallback(() => {
    if (mapInstance.current) {
      mapInstance.current.remove()
      mapInstance.current = null
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current || !hasCoords) return

    const el = containerRef.current

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            initMap()
          } else {
            destroyMap()
          }
        }
      },
      { rootMargin: '200px 0px' }
    )

    observerRef.current.observe(el)

    return () => {
      observerRef.current?.disconnect()
      destroyMap()
    }
  }, [hasCoords, initMap, destroyMap])

  return (
    <Link
      href={`/regions/${region.slug}`}
      ref={containerRef}
      className="region-map-card"
      style={{
        display: 'block',
        borderRadius: '10px',
        overflow: 'hidden',
        position: 'relative',
        aspectRatio: isOrphanLast ? undefined : '3 / 2',
        minHeight: isOrphanLast ? '180px' : undefined,
        backgroundColor: '#1c1a17',
        textDecoration: 'none',
        gridColumn: isOrphanLast ? '1 / -1' : undefined,
        transition: 'transform 200ms ease, border-color 200ms ease',
        border: '1px solid transparent',
      }}
    >
      {/* GL map container */}
      {hasCoords && (
        <div
          ref={mapRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
          }}
        />
      )}

      {/* Fallback — dark bg with amber name (shows when no coords or GL fails) */}
      {!hasCoords && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              fontStyle: 'italic',
              fontSize: '1.35rem',
              color: '#b8862b',
              textAlign: 'center',
              lineHeight: 1.3,
            }}
          >
            {region.name}
          </span>
        </div>
      )}

      {/* Listing count — top-right amber pill */}
      {count > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '0.75rem',
            right: '0.75rem',
            zIndex: 2,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              fontSize: '10px',
              letterSpacing: '0.04em',
              color: '#1c1a17',
              background: '#b8862b',
              padding: '0.2rem 0.55rem',
              borderRadius: '100px',
            }}
          >
            {count}
          </span>
        </div>
      )}

      {/* Text — bottom-left: state label + region name */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '1rem 1.125rem',
          zIndex: 2,
        }}
      >
        {/* State — amber small caps */}
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            fontSize: '9.5px',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#b8862b',
            display: 'block',
            marginBottom: '0.25rem',
          }}
        >
          {STATE_LABELS[region.state]?.split(' ')[0] || region.state}
        </span>

        {/* Region name — white serif italic */}
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontStyle: 'italic',
            fontSize: '1.2rem',
            color: '#fff',
            lineHeight: 1.2,
            margin: 0,
            textShadow: '0 1px 4px rgba(0,0,0,0.5)',
          }}
        >
          {region.name}
        </h3>
      </div>
      {/* Hide Mapbox logo on card thumbnails — non-interactive decorative maps */}
      <style>{`
        .region-map-card .mapboxgl-ctrl-logo,
        .region-map-card .mapboxgl-ctrl-attrib {
          display: none !important;
        }
      `}</style>
    </Link>
  )
}
