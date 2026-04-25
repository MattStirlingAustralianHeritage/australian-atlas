'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getListingRegion } from '@/lib/regions'

// ─── Constants ───────────────────────────────────────────

const VERTICAL_NAMES = {
  sba: 'Small Batch',
  collection: 'Culture',
  craft: 'Craft',
  fine_grounds: 'Fine Grounds',
  rest: 'Rest',
  field: 'Field',
  corner: 'Corner',
  found: 'Found',
  table: 'Table',
}

const REASON_COLORS = {
  same_name_suburb: { bg: '#f0fff4', color: '#276749', border: '#c6e9c6' },
  same_website:     { bg: '#eff6ff', color: '#1e40af', border: '#bfdbfe' },
}

const CONFIDENCE_COLORS = {
  high:   { bg: '#fef2f2', color: '#c53030', border: '#f5c6c6' },
  medium: { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
}

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'high', label: 'High confidence' },
  { key: 'medium', label: 'Medium confidence' },
]

// ─── Helpers ─────────────────────────────────────────────

function getReasonStyle(reason) {
  if (reason === 'same_name_suburb') return REASON_COLORS.same_name_suburb
  if (reason === 'same_website') return REASON_COLORS.same_website
  // trigram_*pct
  if (reason && reason.startsWith('trigram_')) return { bg: '#fffbeb', color: '#92400e', border: '#fde68a' }
  return { bg: '#f7f7f7', color: '#888', border: '#e5e5e5' }
}

function getConfidenceStyle(confidence) {
  return CONFIDENCE_COLORS[confidence] || { bg: '#f7f7f7', color: '#888', border: '#e5e5e5' }
}

function formatReason(reason) {
  if (!reason) return 'Unknown'
  return reason.replace(/_/g, ' ').replace(/pct$/, '%')
}

function fieldsMatch(a, b, field) {
  if (!a || !b) return true
  const va = (a[field] || '').toLowerCase().trim()
  const vb = (b[field] || '').toLowerCase().trim()
  if (!va && !vb) return true
  return va === vb
}

// ─── API helper ──────────────────────────────────────────

async function apiCall(body) {
  const res = await fetch('/api/admin/duplicates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Request failed')
  }
  return res.json()
}

// ─── Inline SVG Icons ────────────────────────────────────

function MergeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v12" />
      <path d="M3 7l5-5 5 5" />
    </svg>
  )
}

function DismissIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4l8 8" />
      <path d="M12 4l-8 8" />
    </svg>
  )
}

function SkipIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3l6 5-6 5" />
      <path d="M12 3v10" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: 'dup-spin 0.8s linear infinite' }}>
      <path d="M8 1a7 7 0 0 1 7 7" />
    </svg>
  )
}

// ─── Action button ───────────────────────────────────────

function ActionBtn({ onClick, disabled, loading, color, borderColor, title, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '5px 10px',
        borderRadius: '6px',
        border: `1px solid ${borderColor || 'var(--color-border, #E5E0D8)'}`,
        background: '#fff',
        color: color || 'var(--color-ink, #2D2A26)',
        fontSize: '0.75rem',
        fontWeight: 500,
        fontFamily: 'inherit',
        cursor: disabled || loading ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'opacity 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {loading ? <SpinnerIcon /> : children}
    </button>
  )
}

// ─── Listing Card ────────────────────────────────────────

function ListingCard({ listing, isKeep, onSelect, selected }) {
  if (!listing) {
    return (
      <div style={{
        flex: 1,
        padding: '12px 16px',
        borderRadius: '8px',
        background: '#fef2f2',
        border: '1px solid #f5c6c6',
      }}>
        <p style={{ fontSize: '0.8rem', color: '#c53030', margin: 0 }}>Listing not found</p>
      </div>
    )
  }

  return (
    <div
      onClick={onSelect}
      style={{
        flex: 1,
        padding: '12px 16px',
        borderRadius: '8px',
        background: selected ? '#f0fff4' : 'var(--color-cream, #F5F1EB)',
        border: selected ? '2px solid #276749' : '1px solid var(--color-border, #E5E0D8)',
        cursor: onSelect ? 'pointer' : 'default',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      {selected && (
        <span style={{
          display: 'inline-block',
          fontSize: '0.65rem',
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#276749',
          marginBottom: '6px',
        }}>
          Keep this one
        </span>
      )}
      <p style={{
        fontFamily: 'var(--font-body, system-ui)',
        fontWeight: 600,
        fontSize: '0.85rem',
        color: 'var(--color-ink, #2D2A26)',
        margin: '0 0 4px',
      }}>
        {listing.name}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
        <Badge label={VERTICAL_NAMES[listing.vertical] || listing.vertical} bg="#f3f0eb" color="var(--color-ink, #2D2A26)" />
        {listing.quality_score != null && (
          <Badge label={`Q: ${listing.quality_score}`} bg="#f7f7f7" color="#888" />
        )}
        {listing.status && listing.status !== 'active' && (
          <Badge label={listing.status} bg="#fef2f2" color="#c53030" />
        )}
      </div>
      <DetailRow label="Region" value={[getListingRegion(listing)?.name, listing.state].filter(Boolean).join(', ')} />
      <DetailRow label="Address" value={listing.address} />
      <DetailRow label="Website" value={listing.website} isUrl />
      <DetailRow label="Slug" value={listing.slug} />
    </div>
  )
}

function Badge({ label, bg, color, border }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '100px',
      background: bg,
      color,
      border: border ? `1px solid ${border}` : 'none',
      fontSize: '0.7rem',
      fontWeight: 500,
      fontFamily: 'var(--font-body, system-ui)',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

function DetailRow({ label, value, isUrl }) {
  if (!value) return null
  return (
    <p style={{
      fontSize: '0.75rem',
      color: 'var(--color-muted, #8B8578)',
      margin: '2px 0',
      fontFamily: 'var(--font-body, system-ui)',
      lineHeight: 1.4,
    }}>
      <span style={{ fontWeight: 600, marginRight: '4px' }}>{label}:</span>
      {isUrl ? (
        <a
          href={value.startsWith('http') ? value : `https://${value}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--color-accent, #b8862b)', textDecoration: 'underline' }}
        >
          {value.replace(/^https?:\/\//, '').replace(/\/$/, '')}
        </a>
      ) : (
        value
      )}
    </p>
  )
}

// ─── Difference indicator ────────────────────────────────

function DiffIndicator({ a, b, field, label }) {
  if (!a || !b) return null
  if (fieldsMatch(a, b, field)) return null
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 6px',
      borderRadius: '4px',
      background: '#fffbeb',
      color: '#92400e',
      fontSize: '0.65rem',
      fontWeight: 500,
      marginRight: '4px',
    }}>
      {label} differs
    </span>
  )
}

// ─── Summary Card (moved here for client-side count updates) ─

function SummaryCard({ label, sublabel, count, color, bg, border }) {
  return (
    <div style={{
      display: 'block',
      background: bg,
      borderRadius: '12px',
      border: `1px solid ${border}`,
      padding: '1.25rem',
    }}>
      <p style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted, #8B8578)', margin: '0 0 0.375rem' }}>
        {label}
      </p>
      <p style={{ fontSize: '2rem', fontWeight: 600, color, margin: '0 0 0.25rem', fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-display, Georgia)' }}>
        {count}
      </p>
      <p style={{ fontSize: '0.7rem', color: 'var(--color-muted, #8B8578)', margin: 0 }}>
        {sublabel}
      </p>
    </div>
  )
}

// ─── Inline error banner for a pair ─────────────────────

function PairError({ message, onDismiss }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '8px',
      padding: '8px 12px',
      borderRadius: '6px',
      background: '#fef2f2',
      border: '1px solid #f5c6c6',
      marginBottom: '10px',
    }}>
      <p style={{ fontSize: '0.75rem', color: '#c53030', margin: 0, fontWeight: 500 }}>
        {message}
      </p>
      <button
        onClick={onDismiss}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#c53030', fontSize: '1rem', lineHeight: 1, padding: '0 2px',
        }}
        aria-label="Dismiss error"
      >
        &times;
      </button>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────

export default function DuplicatesTable({ initialPairs, initialCounts }) {
  const router = useRouter()
  const [filter, setFilter] = useState('all')
  const [skipped, setSkipped] = useState(new Set())
  const [resolved, setResolved] = useState(new Set()) // pairs removed by merge/dismiss
  const [loadingAction, setLoadingAction] = useState({}) // pairId -> action
  const [mergeSelections, setMergeSelections] = useState({}) // pairId -> keepId
  const [pairErrors, setPairErrors] = useState({}) // pairId -> error message
  const [countDeltas, setCountDeltas] = useState({ pending: 0, merged: 0, dismissed: 0 })

  // Live counts = server counts + local deltas
  const counts = {
    pending: (initialCounts?.pending || 0) + countDeltas.pending,
    merged: (initialCounts?.merged || 0) + countDeltas.merged,
    dismissed: (initialCounts?.dismissed || 0) + countDeltas.dismissed,
  }

  // Visible pairs: not skipped, not resolved
  const visible = (initialPairs || []).filter(p => !skipped.has(p.id) && !resolved.has(p.id))

  const filtered = visible.filter(p => {
    if (filter === 'high') return p.confidence === 'high'
    if (filter === 'medium') return p.confidence === 'medium'
    return true
  })

  const clearError = useCallback((pairId) => {
    setPairErrors(prev => {
      const next = { ...prev }
      delete next[pairId]
      return next
    })
  }, [])

  const handleMerge = useCallback(async (pair) => {
    const keepId = mergeSelections[pair.id]
    if (!keepId) {
      setPairErrors(prev => ({ ...prev, [pair.id]: 'Click on the listing you want to keep first, then press Merge.' }))
      return
    }
    const removeId = keepId === pair.listing_a_id ? pair.listing_b_id : pair.listing_a_id
    const keepName = keepId === pair.listing_a_id ? pair.listing_a?.name : pair.listing_b?.name
    const removeName = removeId === pair.listing_a_id ? pair.listing_a?.name : pair.listing_b?.name

    if (!confirm(`Merge duplicates?\n\nKEEP: "${keepName}"\nREMOVE: "${removeName}"\n\nThe removed listing will be marked as a duplicate.`)) {
      return
    }

    clearError(pair.id)
    setLoadingAction(prev => ({ ...prev, [pair.id]: 'merge' }))
    try {
      await apiCall({
        action: 'merge',
        pair_id: pair.id,
        keep_id: keepId,
        remove_id: removeId,
      })
      // Instantly remove the pair and update counts
      setResolved(prev => new Set([...prev, pair.id]))
      setCountDeltas(prev => ({ ...prev, pending: prev.pending - 1, merged: prev.merged + 1 }))
      // Background refresh for server-side consistency
      router.refresh()
    } catch (err) {
      setPairErrors(prev => ({ ...prev, [pair.id]: 'Merge failed: ' + err.message }))
    } finally {
      setLoadingAction(prev => ({ ...prev, [pair.id]: null }))
    }
  }, [mergeSelections, router, clearError])

  const handleDismiss = useCallback(async (pair) => {
    clearError(pair.id)
    setLoadingAction(prev => ({ ...prev, [pair.id]: 'dismiss' }))
    try {
      await apiCall({
        action: 'dismiss',
        pair_id: pair.id,
      })
      // Instantly remove the pair and update counts
      setResolved(prev => new Set([...prev, pair.id]))
      setCountDeltas(prev => ({ ...prev, pending: prev.pending - 1, dismissed: prev.dismissed + 1 }))
      router.refresh()
    } catch (err) {
      setPairErrors(prev => ({ ...prev, [pair.id]: 'Dismiss failed: ' + err.message }))
    } finally {
      setLoadingAction(prev => ({ ...prev, [pair.id]: null }))
    }
  }, [router, clearError])

  const handleSkip = useCallback((pairId) => {
    setSkipped(prev => new Set([...prev, pairId]))
  }, [])

  const selectForKeep = useCallback((pairId, listingId) => {
    clearError(pairId)
    setMergeSelections(prev => ({
      ...prev,
      [pairId]: prev[pairId] === listingId ? null : listingId,
    }))
  }, [clearError])

  return (
    <div>
      {/* Spinner keyframes */}
      <style>{`@keyframes dup-spin { to { transform: rotate(360deg) } }`}</style>

      {/* Summary Cards — live-updating */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <SummaryCard label="Pending" sublabel="Awaiting review" count={counts.pending} color="#92400e" bg="#fffbeb" border="#fde68a" />
        <SummaryCard label="Merged" sublabel="Duplicates resolved" count={counts.merged} color="#276749" bg="#f0fff4" border="#c6e9c6" />
        <SummaryCard label="Dismissed" sublabel="Not duplicates" count={counts.dismissed} color="#666" bg="#f7f7f7" border="#e5e5e5" />
      </div>

      {/* Table wrapper */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--color-border, #E5E0D8)', overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border, #E5E0D8)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: 'var(--color-ink, #2D2A26)' }}>
            Pairs
          </h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-muted, #8B8578)' }}>
            {visible.length} remaining
          </span>
        </div>

      {/* Filter Tabs */}
      <div style={{
        display: 'flex',
        gap: '4px',
        padding: '0.75rem 0.75rem 0',
        borderBottom: '1px solid var(--color-border, #E5E0D8)',
        marginBottom: '0.5rem',
      }}>
        {FILTER_TABS.map(tab => {
          const isActive = filter === tab.key
          const count = tab.key === 'all'
            ? visible.length
            : visible.filter(p => p.confidence === tab.key).length
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px 6px 0 0',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--color-ink, #2D2A26)' : '2px solid transparent',
                background: 'transparent',
                color: isActive ? 'var(--color-ink, #2D2A26)' : 'var(--color-muted, #8B8578)',
                fontSize: '0.8rem',
                fontWeight: isActive ? 600 : 400,
                fontFamily: 'inherit',
                cursor: 'pointer',
                transition: 'color 0.15s',
              }}
            >
              {tab.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Pair Cards */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 0' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-muted, #8B8578)' }}>
            No duplicate pairs to review.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px', padding: '0.5rem 0.5rem 1rem' }}>
          {filtered.map(pair => {
            const reasonStyle = getReasonStyle(pair.match_reason)
            const confStyle = getConfidenceStyle(pair.confidence)
            const isLoading = !!loadingAction[pair.id]
            const selectedKeep = mergeSelections[pair.id]
            const errorMsg = pairErrors[pair.id]

            return (
              <div key={pair.id} style={{
                padding: '16px 20px',
                borderRadius: '10px',
                border: errorMsg ? '1px solid #f5c6c6' : '1px solid var(--color-border, #E5E0D8)',
                background: '#fff',
                transition: 'border-color 0.2s',
              }}>
                {/* Inline error */}
                {errorMsg && (
                  <PairError message={errorMsg} onDismiss={() => clearError(pair.id)} />
                )}

                {/* Header row: badges + actions */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '12px',
                  flexWrap: 'wrap',
                  gap: '6px',
                }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <Badge
                      label={formatReason(pair.match_reason)}
                      bg={reasonStyle.bg}
                      color={reasonStyle.color}
                      border={reasonStyle.border}
                    />
                    <Badge
                      label={pair.confidence}
                      bg={confStyle.bg}
                      color={confStyle.color}
                      border={confStyle.border}
                    />
                    {/* Difference indicators */}
                    <DiffIndicator a={pair.listing_a} b={pair.listing_b} field="vertical" label="Vertical" />
                    <DiffIndicator a={pair.listing_a} b={pair.listing_b} field="region" label="Region" />
                    <DiffIndicator a={pair.listing_a} b={pair.listing_b} field="state" label="State" />
                  </div>

                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <ActionBtn
                      onClick={() => handleMerge(pair)}
                      disabled={isLoading || !selectedKeep}
                      loading={loadingAction[pair.id] === 'merge'}
                      color="#c53030"
                      borderColor="#f5c6c6"
                      title={selectedKeep ? 'Merge: keep selected, remove other' : 'Select which listing to keep first'}
                    >
                      <MergeIcon /> Merge
                    </ActionBtn>
                    <ActionBtn
                      onClick={() => handleDismiss(pair)}
                      disabled={isLoading}
                      loading={loadingAction[pair.id] === 'dismiss'}
                      color="var(--color-muted, #8B8578)"
                      borderColor="var(--color-border, #E5E0D8)"
                      title="Not a duplicate"
                    >
                      <DismissIcon /> Not a duplicate
                    </ActionBtn>
                    <ActionBtn
                      onClick={() => handleSkip(pair.id)}
                      disabled={isLoading}
                      color="var(--color-muted, #8B8578)"
                      borderColor="var(--color-border, #E5E0D8)"
                      title="Skip for now"
                    >
                      <SkipIcon /> Skip
                    </ActionBtn>
                  </div>
                </div>

                {/* Merge instruction */}
                {!selectedKeep && !errorMsg && (
                  <p style={{
                    fontSize: '0.7rem',
                    color: 'var(--color-muted, #8B8578)',
                    fontStyle: 'italic',
                    margin: '0 0 8px',
                  }}>
                    Click on the listing you want to keep, then press Merge
                  </p>
                )}

                {/* Side-by-side listings */}
                <div style={{ display: 'flex', gap: '12px' }}>
                  <ListingCard
                    listing={pair.listing_a}
                    selected={selectedKeep === pair.listing_a_id}
                    onSelect={() => selectForKeep(pair.id, pair.listing_a_id)}
                  />
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 4px',
                    color: 'var(--color-muted, #8B8578)',
                    fontSize: '1.2rem',
                    fontWeight: 300,
                    userSelect: 'none',
                  }}>
                    vs
                  </div>
                  <ListingCard
                    listing={pair.listing_b}
                    selected={selectedKeep === pair.listing_b_id}
                    onSelect={() => selectForKeep(pair.id, pair.listing_b_id)}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
      </div>
    </div>
  )
}
