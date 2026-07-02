'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../layout'

// ============================================================
// /dashboard/embed — the operator's website embed kit.
//
// Two copy-paste snippets for the operator's OWN website:
//   (a) an <iframe> embedding the live Atlas card (/embed/listing/[slug])
//   (b) a plain HTML text-link badge ("Find us on the Australian Atlas")
// plus a live preview of the card as it will render on their site.
//
// Paid perk: gated on the listing's Standard claim (listing.paid from
// /api/dashboard, which counts a past_due dunning-grace claim as paid).
// Non-paid owners see the same locked treatment as the AI Visibility report.
// The public embed route itself renders any active listing — the perk here is
// the kit, not the card.
// ============================================================

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft', fine_grounds: 'Fine Grounds',
  rest: 'Rest', field: 'Field', corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'

// Escape a value for use inside an HTML attribute in the generated snippet.
function escAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function iframeSnippet(listing) {
  const src = `${SITE_URL}/embed/listing/${listing.slug}`
  const title = escAttr(`${listing.name} on the Australian Atlas`)
  return `<iframe src="${src}" title="${title}" width="360" height="152" style="border:0;max-width:100%;" loading="lazy"></iframe>`
}

function badgeSnippet(listing) {
  const href = `${SITE_URL}/place/${listing.slug}`
  return `<a href="${href}" target="_blank" rel="noopener">Find us on the Australian Atlas</a>`
}

export default function DashboardEmbed() {
  // Listings (with their paid flag) are fetched once by the dashboard layout
  // and shared via context — this page just selects and renders.
  const { dashUser, listings, listingsLoading, listingsError } = useAuth()
  const [listingId, setListingId] = useState(null)

  // Default to the first paid listing (the one the kit is unlocked for),
  // falling back to the first listing so the locked state has a subject.
  useEffect(() => {
    if (listingId || listings.length === 0) return
    const firstPaid = listings.find(l => l.paid)
    setListingId((firstPaid || listings[0]).id)
  }, [listings, listingId])

  const listing = listings.find(l => l.id === listingId) || null
  const loading = listingsLoading
  const error = listingsError || (!listingsLoading && !dashUser ? 'Sign in to view your embed kit' : null)

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.75rem', fontWeight: 600, color: 'var(--color-ink)', margin: '0 0 0.25rem' }}>
          Website Embed Kit
        </h1>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.95rem', color: 'var(--color-muted)', margin: 0, maxWidth: 640 }}>
          Show visitors you&rsquo;re on the Atlas. Paste a live Atlas card — or a simple text badge —
          into your own website. Both link straight to your Atlas page.
        </p>
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      {listings.length > 1 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <Label>Embed kit for</Label>
          <select value={listingId || ''} onChange={e => setListingId(e.target.value)}
            style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem', padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-border)', background: '#fff', color: 'var(--color-ink)', minWidth: 260 }}>
            {listings.map(l => (
              <option key={l.id} value={l.id}>{l.name} ({VERTICAL_LABELS[l.vertical] || l.vertical})</option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <Skeleton />
      ) : !listing ? (
        !error && (
          <EmptyState title="No claimed listing yet"
            body="Claim your listing to get an embeddable Atlas card and badge for your own website." />
        )
      ) : !listing.paid ? (
        <LockedState />
      ) : (
        <>
          {/* Live preview — the real embed route in a real iframe, on the cream
              page ground so the card's transparent surrounds are visible. */}
          <section style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--color-border)', padding: '1.5rem', marginBottom: '1.5rem' }}>
            <SectionHeading>Live preview</SectionHeading>
            <p style={helpStyle}>
              This is the card exactly as it will appear on your website. It stays in sync with your
              Atlas listing — update your details here and the card follows.
            </p>
            <div style={{ background: 'var(--color-cream, #FAF8F5)', border: '1px dashed var(--color-border)', borderRadius: 10, padding: '1.5rem', display: 'flex', justifyContent: 'center' }}>
              <iframe
                src={`/embed/listing/${listing.slug}`}
                title={`${listing.name} on the Australian Atlas`}
                width="360"
                height="152"
                loading="lazy"
                style={{ border: 0, maxWidth: '100%' }}
              />
            </div>
          </section>

          {/* Snippet (a): the iframe embed */}
          <CopyBlock
            heading="Embed the Atlas card"
            help="Copy this snippet and paste it into your website wherever you'd like the card to appear — most site builders (Squarespace, Wix, Shopify, WordPress) accept it in an HTML or embed block."
            value={iframeSnippet(listing)}
            rows={3}
          />

          {/* Snippet (b): the plain text-link badge */}
          <CopyBlock
            heading="Or use the text badge"
            help="A plain HTML link for footers, About pages, or anywhere an iframe doesn't fit. It inherits your site's own styling."
            value={badgeSnippet(listing)}
            rows={2}
          />

          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', lineHeight: 1.6, color: 'var(--color-muted)', margin: 0, fontStyle: 'italic' }}>
            The card shows your listing&rsquo;s current name, category, suburb and photo, and links to
            your Atlas page. It&rsquo;s a window onto your listing — embedding it doesn&rsquo;t change
            how you rank in Atlas search or maps.
          </p>
        </>
      )}
    </div>
  )
}

// Locked state for non-paid owners — same treatment as the AI Visibility report.
function LockedState() {
  return (
    <div style={{
      background: 'var(--color-cream)',
      border: '1px solid var(--color-border)',
      borderLeft: '3px solid var(--color-gold)',
      borderRadius: 12,
      padding: '1.75rem 2rem',
      marginBottom: '2rem',
    }}>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'var(--color-gold)', margin: '0 0 0.6rem' }}>
        A Standard-plan feature
      </p>
      <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.3rem', fontWeight: 600, color: 'var(--color-ink)', margin: '0 0 0.5rem' }}>
        Put your Atlas card on your own website
      </h2>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.92rem', lineHeight: 1.6, color: 'var(--color-muted)', margin: '0 0 1.25rem' }}>
        The embed kit gives you a live Atlas card and a &ldquo;Find us on the Australian Atlas&rdquo;
        badge to paste into your own website — a verified-independent mark that links visitors
        straight to your Atlas page.
      </p>
      <a href="/dashboard/subscription" style={{ display: 'inline-block', fontFamily: 'var(--font-sans)', fontSize: '0.88rem', fontWeight: 600, background: 'var(--color-ink)', color: 'var(--color-cream)', padding: '0.65rem 1.25rem', borderRadius: 8, textDecoration: 'none' }}>
        Manage subscription
      </a>
    </div>
  )
}

// Read-only snippet textarea + copy button (clipboard pattern from
// /dashboard/subscription's referral code).
function CopyBlock({ heading, help, value, rows }) {
  const [copied, setCopied] = useState(false)
  const areaRef = useRef(null)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable — the snippet is visible to copy by hand */ }
  }

  return (
    <section style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--color-border)', padding: '1.5rem', marginBottom: '1.5rem' }}>
      <SectionHeading>{heading}</SectionHeading>
      <p style={helpStyle}>{help}</p>
      <textarea
        ref={areaRef}
        readOnly
        value={value}
        rows={rows}
        onFocus={() => areaRef.current?.select()}
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: '0.78rem', lineHeight: 1.5, padding: '0.65rem 0.75rem',
          borderRadius: 8, border: '1px solid var(--color-border)', width: '100%',
          boxSizing: 'border-box', outline: 'none', color: 'var(--color-ink)',
          background: 'var(--color-cream, #FAF8F5)', resize: 'vertical',
        }}
      />
      <div style={{ marginTop: '0.6rem' }}>
        <button onClick={handleCopy} style={{
          fontFamily: 'var(--font-sans)', fontSize: '0.85rem', fontWeight: 600,
          padding: '0.55rem 1.1rem', borderRadius: 8, cursor: 'pointer',
          border: 'none', background: 'var(--color-sage, #4A7C59)', color: '#fff',
        }}>
          {copied ? 'Copied ✓' : 'Copy snippet'}
        </button>
      </div>
    </section>
  )
}

function SectionHeading({ children }) {
  return (
    <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', margin: '0 0 0.5rem' }}>
      {children}
    </h2>
  )
}

function Banner({ kind, children }) {
  const err = kind === 'error'
  return (
    <div style={{ background: err ? '#fef2f2' : '#f0f7f2', border: `1px solid ${err ? '#fca5a5' : '#9ec9af'}`, color: err ? '#c62828' : '#2f6b45', borderRadius: 10, padding: '0.75rem 1rem', margin: '0 0 1.25rem', fontFamily: 'var(--font-sans)', fontSize: '0.85rem' }}>
      {children}
    </div>
  )
}

function Label({ children }) {
  return (
    <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: '0.5rem' }}>
      {children}
    </label>
  )
}

function EmptyState({ title, body }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--color-border)', padding: '2rem', textAlign: 'center' }}>
      <p style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', color: 'var(--color-ink)', margin: '0 0 0.375rem' }}>{title}</p>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.825rem', color: 'var(--color-muted)', margin: '0 auto', maxWidth: 460 }}>{body}</p>
    </div>
  )
}

function Skeleton() {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--color-border)', padding: '1.5rem' }}>
      <div style={{ width: '40%', height: 12, background: 'var(--color-border)', borderRadius: 4, marginBottom: '1rem' }} />
      <div style={{ width: '100%', height: 10, background: 'var(--color-border)', borderRadius: 4, marginBottom: '0.5rem' }} />
      <div style={{ width: '80%', height: 10, background: 'var(--color-border)', borderRadius: 4 }} />
    </div>
  )
}

const helpStyle = {
  fontFamily: 'var(--font-sans)', fontSize: '0.82rem', color: 'var(--color-muted)',
  margin: '0 0 1rem', lineHeight: 1.5, maxWidth: 640,
}
