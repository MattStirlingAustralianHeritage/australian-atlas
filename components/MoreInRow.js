'use client'

import { Children, useCallback, useEffect, useRef, useState } from 'react'

/**
 * Horizontal, arrow-navigable "More in [region]" row.
 *
 * The server passes one ListingCard per child; this component wraps each in a
 * scroll-snapping flex track and overlays prev/next buttons beside the heading.
 * The arrows only render once the track actually overflows, and each disables
 * when it reaches its end. Native swipe/trackpad scrolling still works on touch
 * and the buttons are hidden on phones (where swiping is the natural gesture).
 */
export default function MoreInRow({ region, children }) {
  const trackRef = useRef(null)
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(false)

  const sync = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    setCanPrev(scrollLeft > 2)
    setCanNext(scrollLeft + clientWidth < scrollWidth - 2)
  }, [])

  // Re-measure after every render so the arrows stay correct when the card set
  // changes — e.g. client-side navigation to another place page swaps the
  // children without remounting this component. sync() only setStates on a real
  // change, so this settles immediately rather than looping.
  useEffect(() => { sync() })

  // Keep arrow state in sync with user scrolling and viewport changes.
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    el.addEventListener('scroll', sync, { passive: true })
    window.addEventListener('resize', sync)
    return () => {
      el.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
    }
  }, [sync])

  const page = (direction) => {
    const el = trackRef.current
    if (!el) return
    el.scrollBy({ left: direction * Math.max(el.clientWidth * 0.85, 260), behavior: 'smooth' })
  }

  const showArrows = canPrev || canNext

  return (
    <section className="mt-12">
      <style>{`
        .more-in-track {
          display: flex;
          gap: 16px;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 4px;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .more-in-track::-webkit-scrollbar { display: none; }
        .more-in-item {
          flex: 0 0 auto;
          width: 80%;
          scroll-snap-align: start;
        }
        @media (min-width: 640px) { .more-in-item { width: calc((100% - 16px) / 2); } }
        @media (min-width: 1024px) { .more-in-item { width: calc((100% - 32px) / 3); } }
        @media (min-width: 1280px) { .more-in-item { width: calc((100% - 48px) / 4); } }
        .more-in-arrow {
          width: 36px;
          height: 36px;
          border-radius: 9999px;
          border: 1px solid var(--color-border);
          background: var(--color-card-bg, #fff);
          color: var(--color-ink);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          line-height: 1;
          padding-bottom: 2px;
          box-shadow: 0 1px 6px rgba(0,0,0,0.08);
          cursor: pointer;
          transition: opacity .2s ease, background .2s ease, border-color .2s ease, color .2s ease;
        }
        .more-in-arrow:hover:not(:disabled) {
          background: var(--color-accent);
          border-color: var(--color-accent);
          color: #fff;
        }
        .more-in-arrow:disabled { opacity: .3; cursor: default; }
        .more-in-arrows { display: flex; gap: 8px; flex: 0 0 auto; }
        /* On phones the peeking next card signals swipe; arrows would crowd the
           heading, so hide them and let the native gesture do the work. */
        @media (max-width: 639px) { .more-in-arrows { display: none; } }
      `}</style>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 20,
      }}>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          fontSize: '22px',
          color: 'var(--color-ink)',
          margin: 0,
        }}>
          More in {region}
        </h2>
        {showArrows && (
          <div className="more-in-arrows">
            <button
              type="button"
              className="more-in-arrow"
              aria-label={`Scroll back through more in ${region}`}
              onClick={() => page(-1)}
              disabled={!canPrev}
            >
              ‹
            </button>
            <button
              type="button"
              className="more-in-arrow"
              aria-label={`Scroll forward through more in ${region}`}
              onClick={() => page(1)}
              disabled={!canNext}
            >
              ›
            </button>
          </div>
        )}
      </div>

      <div ref={trackRef} className="more-in-track">
        {Children.map(children, child => (
          <div className="more-in-item">{child}</div>
        ))}
      </div>
    </section>
  )
}
