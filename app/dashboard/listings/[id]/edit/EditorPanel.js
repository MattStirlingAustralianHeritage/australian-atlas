'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import Link from 'next/link'

/**
 * The editor's section shell.
 *
 * The old editor stacked thirteen always-open sections into one endless page,
 * each hand-rolling its own heading, its own separator rule and its own lock
 * card. A first-time operator met all of it at once and had no idea what they
 * were supposed to do first.
 *
 * A Panel is one collapsed row: title, a one-line summary of what's currently
 * there, and a state dot. Opening one closes the others (PanelGroup), so there
 * is only ever a single thing on screen to think about. Panels mount lazily on
 * first open — a section the operator never touches never fires its fetch —
 * and stay mounted afterwards, so half-typed form state survives collapsing.
 */

const PanelCtx = createContext(null)

/**
 * Uncontrolled by default. Pass `open` + `onOpenChange` to drive it from
 * outside — the "what's left to do" chips use that to jump straight to the
 * panel that fixes a given gap.
 */
export function PanelGroup({ children, defaultOpen = null, open: openProp, onOpenChange }) {
  const [openState, setOpenState] = useState(defaultOpen)
  const controlled = openProp !== undefined
  const open = controlled ? openProp : openState
  const setOpen = controlled ? (onOpenChange || (() => {})) : setOpenState
  return (
    <PanelCtx.Provider value={{ open, setOpen }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </PanelCtx.Provider>
  )
}

/** A titled break between groups of panels ("Essentials" / "Optional extras"). */
export function PanelGroupHeading({ title, note }) {
  return (
    <div style={{ margin: '20px 0 2px' }}>
      <h2 style={{
        fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
        letterSpacing: '0.13em', textTransform: 'uppercase',
        color: 'var(--color-muted)', margin: 0,
      }}>
        {title}
      </h2>
      {note && (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', margin: '6px 0 0', lineHeight: 1.5 }}>
          {note}
        </p>
      )}
    </div>
  )
}

const CHEVRON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9l6 6 6-6" />
  </svg>
)

const LOCK = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
)

const TICK = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

/**
 * @param id       stable key for the open-panel state
 * @param title    section name
 * @param summary  one line describing what's currently saved ("3 photos")
 * @param status   'done' | 'empty' | 'locked' — drives the leading marker
 * @param meta     right-aligned counter, e.g. "3 / 15"
 * @param dirty    show the amber unsaved marker on a collapsed panel
 */
export function Panel({ id, title, summary, status = 'empty', meta, dirty, children }) {
  const ctx = useContext(PanelCtx)
  if (!ctx) throw new Error('Panel must be used inside a PanelGroup')
  const { open, setOpen } = ctx
  const isOpen = open === id

  // Lazy mount: don't pay for a section's fetch until it's first opened, but
  // never unmount afterwards or in-progress edits would be thrown away.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { if (isOpen) setMounted(true) }, [isOpen])

  const locked = status === 'locked'
  const done = status === 'done'

  return (
    <section id={`panel-${id}`} style={{
      scrollMarginTop: 16,
      border: '1px solid var(--color-border)',
      borderRadius: 14,
      background: 'var(--color-card-bg)',
      overflow: 'hidden',
      boxShadow: isOpen ? '0 1px 2px rgba(82,58,30,0.06), 0 8px 24px rgba(82,58,30,0.07)' : 'none',
      transition: 'box-shadow 0.16s ease',
    }}>
      <button
        type="button"
        onClick={() => setOpen(isOpen ? null : id)}
        aria-expanded={isOpen}
        style={{
          display: 'flex', alignItems: 'center', gap: 14, width: '100%',
          padding: '16px 18px', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-body)',
        }}
      >
        {/* State marker: filled tick when there's content, hollow when empty. */}
        <span
          aria-hidden="true"
          style={{
            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: done ? 'var(--color-sage)' : 'transparent',
            border: done ? 'none' : `1.5px ${locked ? 'solid' : 'dashed'} var(--color-border)`,
            color: done ? '#fff' : 'var(--color-muted)',
          }}
        >
          {done ? TICK : locked ? LOCK : null}
        </span>

        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 400,
            color: 'var(--color-ink)', lineHeight: 1.3,
          }}>
            {title}
            {locked && (
              <span style={{
                fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                padding: '3px 8px', borderRadius: 100,
                background: 'rgba(196,151,59,0.14)', color: '#8a6520',
              }}>
                Standard
              </span>
            )}
            {dirty && (
              <span title="Unsaved changes" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-gold)', flexShrink: 0 }} />
            )}
          </span>
          {summary && (
            <span style={{
              display: 'block', marginTop: 3, fontSize: 13,
              color: 'var(--color-muted)', lineHeight: 1.45,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {summary}
            </span>
          )}
        </span>

        {meta && (
          <span style={{ fontSize: 12, color: 'var(--color-muted)', flexShrink: 0 }}>{meta}</span>
        )}
        <span
          aria-hidden="true"
          style={{
            color: 'var(--color-muted)', flexShrink: 0, display: 'inline-flex',
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.18s ease',
          }}
        >
          {CHEVRON}
        </span>
      </button>

      {mounted && (
        <div style={{ display: isOpen ? 'block' : 'none' }}>
          <div style={{ padding: '4px 18px 20px', borderTop: '1px solid var(--color-border)' }}>
            <div style={{ paddingTop: 16 }}>{children}</div>
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * The single upgrade card every locked section uses. Previously each of the
 * eight sections carried its own near-identical copy of this markup.
 */
export function LockedNote({ children }) {
  return (
    <div style={{
      display: 'flex', gap: 14, alignItems: 'flex-start',
      padding: 16, borderRadius: 12,
      border: '1px solid var(--color-border)', background: 'var(--color-cream)',
    }}>
      <span style={{ display: 'inline-flex', color: 'var(--color-gold)', flexShrink: 0, marginTop: 1 }}>{LOCK}</span>
      <div>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--color-muted)', margin: 0, lineHeight: 1.6 }}>
          {children}
        </p>
        <Link
          href="/dashboard/subscription"
          style={{
            display: 'inline-block', marginTop: 10, fontFamily: 'var(--font-body)',
            fontSize: 13, fontWeight: 600, color: 'var(--color-sage)', textDecoration: 'none',
          }}
        >
          See what Standard includes →
        </Link>
      </div>
    </div>
  )
}

/** Consistent footer for a panel's own save action. */
export function PanelActions({ children, note }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--color-border)',
    }}>
      {children}
      {note && (
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-muted)' }}>{note}</span>
      )}
    </div>
  )
}
