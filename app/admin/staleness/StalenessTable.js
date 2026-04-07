'use client'

import { useState, useCallback, useRef } from 'react'

// ─── Constants ───────────────────────────────────────────

const VERTICALS = {
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

const STATUS_COLORS = {
  live:       { bg: '#f0fff4', color: '#276749', border: '#c6e9c6' },
  redirect:   { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
  dead:       { bg: '#fef2f2', color: '#c53030', border: '#f5c6c6' },
  error:      { bg: '#fef2f2', color: '#c53030', border: '#f5c6c6' },
  unchecked:  { bg: '#f7f7f7', color: '#888',    border: '#e5e5e5' },
  nourl:      { bg: '#f7f7f7', color: '#888',    border: '#e5e5e5' },
}

const STALENESS_COLORS = {
  Fresh:      { bg: '#f0fff4', color: '#276749' },
  Ageing:     { bg: '#fffbeb', color: '#92400e' },
  Stale:      { bg: '#fef2f2', color: '#9B1C1C' },
  Unverified: { bg: '#f7f7f7', color: '#888' },
}

const PRIORITY_COLORS = {
  High:   { bg: '#fef2f2', color: '#C53030' },
  Medium: { bg: '#fffbeb', color: '#92400e' },
  Low:    { bg: '#f7f7f7', color: '#888' },
}

// ─── Helpers ─────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return '\u2014'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function getStalenessLabel(lastVerifiedAt) {
  if (!lastVerifiedAt) return 'Unverified'
  const months = (Date.now() - new Date(lastVerifiedAt).getTime()) / (1000 * 60 * 60 * 24 * 30)
  if (months < 6) return 'Fresh'
  if (months < 12) return 'Ageing'
  return 'Stale'
}

function getPriority(listing) {
  if (listing.is_claimed) return 'High'
  if (listing.is_featured) return 'Medium'
  return 'Low'
}

function getUrlStatusLabel(listing) {
  if (!listing.website) return 'No URL'
  if (!listing.website_status) return 'Unchecked'
  const s = listing.website_status
  if (s === 'live') return 'Live'
  if (s === 'redirect') return 'Redirect'
  if (s === 'dead') return 'Dead'
  if (s === 'error') return 'Error'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function getUrlStatusKey(listing) {
  if (!listing.website) return 'nourl'
  if (!listing.website_status) return 'unchecked'
  return listing.website_status
}

// ─── API helper ──────────────────────────────────────────

async function apiCall(body) {
  const res = await fetch('/api/admin/staleness', {
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

async function visibilityApiCall(body) {
  const res = await fetch('/api/admin/listing-visibility', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || 'Request failed')
  }
  return data
}

// ─── Icons (inline SVGs) ─────────────────────────────────

function RefreshIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 1v5h5" />
      <path d="M15 15v-5h-5" />
      <path d="M2.05 6.05A7 7 0 0 1 13.95 6.05" />
      <path d="M13.95 9.95A7 7 0 0 1 2.05 9.95" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8.5l3.5 3.5 6.5-7" />
    </svg>
  )
}

function FlagIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 2v12" />
      <path d="M2 2h9l-2 3.5 2 3.5H2" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: 'staleness-spin 0.8s linear infinite' }}>
      <path d="M8 1a7 7 0 0 1 7 7" />
    </svg>
  )
}

function ReinstateIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 1v5h5" />
      <path d="M2.5 10A6.5 6.5 0 1 0 3.8 4.5L1 1" />
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
        padding: '4px 10px',
        borderRadius: '6px',
        border: `1px solid ${borderColor || color}`,
        background: 'transparent',
        color: disabled ? '#ccc' : color,
        fontSize: '11px',
        fontWeight: 500,
        fontFamily: 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
        transition: 'background 0.12s, opacity 0.12s',
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {loading ? <SpinnerIcon /> : children}
    </button>
  )
}

// ─── StalenessTable ──────────────────────────────────────

export default function StalenessTable({ initialListings }) {
  const [listings, setListings] = useState(initialListings || [])
  const [selected, setSelected] = useState(new Set())
  const [loadingRows, setLoadingRows] = useState({}) // { [id]: 'check' | 'verify' | 'flag' | 'reinstate' }
  const [batchProgress, setBatchProgress] = useState(null) // { current, total, action }
  const [reinstateErrors, setReinstateErrors] = useState({}) // { [id]: 'error message' }
  const abortRef = useRef(false)

  // ── Selection ──

  const toggleSelect = useCallback((id) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    setSelected(prev => {
      if (prev.size === listings.length) return new Set()
      return new Set(listings.map(l => l.id))
    })
  }, [listings])

  const clearSelection = useCallback(() => setSelected(new Set()), [])

  // ── Row update helper ──

  const updateListing = useCallback((id, updates) => {
    setListings(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l))
  }, [])

  // ── Single actions ──

  const handleCheck = useCallback(async (id) => {
    setLoadingRows(prev => ({ ...prev, [id]: 'check' }))
    try {
      const data = await apiCall({ action: 'check_url', id })
      updateListing(id, {
        website_status: data.status,
        website_status_code: data.statusCode,
        website_checked_at: data.checkedAt,
      })
    } catch (err) {
      console.error('Check URL failed:', err)
    }
    setLoadingRows(prev => { const n = { ...prev }; delete n[id]; return n })
  }, [updateListing])

  const handleVerify = useCallback(async (id) => {
    setLoadingRows(prev => ({ ...prev, [id]: 'verify' }))
    try {
      const data = await apiCall({ action: 'mark_verified', id })
      updateListing(id, { last_verified_at: data.verifiedAt })
    } catch (err) {
      console.error('Verify failed:', err)
    }
    setLoadingRows(prev => { const n = { ...prev }; delete n[id]; return n })
  }, [updateListing])

  const handleFlag = useCallback(async (id) => {
    setLoadingRows(prev => ({ ...prev, [id]: 'flag' }))
    try {
      await apiCall({ action: 'flag_removal', id })
      updateListing(id, { removal_flagged: true, removal_flagged_at: new Date().toISOString() })
    } catch (err) {
      console.error('Flag failed:', err)
    }
    setLoadingRows(prev => { const n = { ...prev }; delete n[id]; return n })
  }, [updateListing])

  // ── Reinstate hidden listing ──

  const handleReinstate = useCallback(async (id) => {
    setLoadingRows(prev => ({ ...prev, [id]: 'reinstate' }))
    setReinstateErrors(prev => { const n = { ...prev }; delete n[id]; return n })
    try {
      await visibilityApiCall({ action: 'reinstate', id })
      // On success: update the listing in state
      updateListing(id, { status: 'active', hidden_reason: null })
    } catch (err) {
      console.error('Reinstate failed:', err)
      setReinstateErrors(prev => ({ ...prev, [id]: err.message }))
    }
    setLoadingRows(prev => { const n = { ...prev }; delete n[id]; return n })
  }, [updateListing])

  // ── Batch actions ──

  const batchCheckUrls = useCallback(async (ids) => {
    abortRef.current = false
    const idList = Array.from(ids)
    setBatchProgress({ current: 0, total: idList.length, action: 'check' })

    for (let i = 0; i < idList.length; i++) {
      if (abortRef.current) break
      setBatchProgress({ current: i + 1, total: idList.length, action: 'check' })
      const id = idList[i]
      setLoadingRows(prev => ({ ...prev, [id]: 'check' }))
      try {
        const data = await apiCall({ action: 'check_url', id })
        updateListing(id, {
          website_status: data.status,
          website_status_code: data.statusCode,
          website_checked_at: data.checkedAt,
        })
      } catch (err) {
        console.error('Batch check failed for', id, err)
      }
      setLoadingRows(prev => { const n = { ...prev }; delete n[id]; return n })
    }

    setBatchProgress(null)
    setSelected(new Set())
  }, [updateListing])

  const batchVerify = useCallback(async (ids) => {
    const idList = Array.from(ids)
    setBatchProgress({ current: 0, total: idList.length, action: 'verify' })
    try {
      const data = await apiCall({ action: 'batch_verify', ids: idList })
      const verifiedAt = data.verifiedAt || new Date().toISOString()
      for (const id of idList) {
        updateListing(id, { last_verified_at: verifiedAt })
      }
    } catch (err) {
      console.error('Batch verify failed:', err)
    }
    setBatchProgress(null)
    setSelected(new Set())
  }, [updateListing])

  const batchFlag = useCallback(async (ids) => {
    const idList = Array.from(ids)
    setBatchProgress({ current: 0, total: idList.length, action: 'flag' })
    try {
      await apiCall({ action: 'batch_flag', ids: idList })
      const now = new Date().toISOString()
      for (const id of idList) {
        updateListing(id, { removal_flagged: true, removal_flagged_at: now })
      }
    } catch (err) {
      console.error('Batch flag failed:', err)
    }
    setBatchProgress(null)
    setSelected(new Set())
  }, [updateListing])

  // ── Check all unchecked ──

  const handleCheckAllUnchecked = useCallback(async () => {
    const uncheckedIds = listings
      .filter(l => l.website && !l.website_status)
      .map(l => l.id)

    if (uncheckedIds.length === 0) return
    await batchCheckUrls(uncheckedIds)
  }, [listings, batchCheckUrls])

  const uncheckedCount = listings.filter(l => l.website && !l.website_status).length

  // ── Render ──

  const allSelected = listings.length > 0 && selected.size === listings.length
  const hasSelection = selected.size > 0
  const isBatching = batchProgress !== null

  return (
    <>
      {/* Keyframe for spinner */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes staleness-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      ` }} />

      {/* Batch toolbar */}
      {hasSelection && (
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'var(--color-sage, #6B7F5E)',
          color: '#fff',
          padding: '0.6rem 1.25rem',
          borderRadius: '8px',
          marginBottom: '0.75rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          fontSize: '0.8rem',
          fontFamily: 'var(--font-body, system-ui)',
        }}>
          <span style={{ fontWeight: 600 }}>{selected.size} selected</span>

          <button
            onClick={() => batchCheckUrls(selected)}
            disabled={isBatching}
            style={{
              padding: '5px 14px',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.4)',
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              fontSize: '0.78rem',
              fontWeight: 500,
              cursor: isBatching ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Check selected URLs
          </button>

          <button
            onClick={() => batchVerify(selected)}
            disabled={isBatching}
            style={{
              padding: '5px 14px',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.4)',
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              fontSize: '0.78rem',
              fontWeight: 500,
              cursor: isBatching ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Mark selected verified
          </button>

          <button
            onClick={() => batchFlag(selected)}
            disabled={isBatching}
            style={{
              padding: '5px 14px',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.3)',
              background: 'rgba(200,50,50,0.25)',
              color: '#fff',
              fontSize: '0.78rem',
              fontWeight: 500,
              cursor: isBatching ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Flag selected for removal
          </button>

          <button
            onClick={clearSelection}
            style={{
              padding: '5px 10px',
              borderRadius: '6px',
              border: 'none',
              background: 'transparent',
              color: 'rgba(255,255,255,0.7)',
              fontSize: '0.78rem',
              cursor: 'pointer',
              textDecoration: 'underline',
              fontFamily: 'inherit',
            }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Batch progress */}
      {isBatching && (
        <div style={{
          padding: '0.6rem 1.25rem',
          marginBottom: '0.75rem',
          background: '#fff',
          borderRadius: '8px',
          border: '1px solid var(--color-border, #E5E0D8)',
          fontSize: '0.8rem',
          fontFamily: 'var(--font-body, system-ui)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <span style={{ color: 'var(--color-ink, #2D2A26)' }}>
              {batchProgress.action === 'check' ? 'Checking' : batchProgress.action === 'verify' ? 'Verifying' : 'Flagging'}... {batchProgress.current} of {batchProgress.total}
            </span>
            {batchProgress.action === 'check' && (
              <button
                onClick={() => { abortRef.current = true }}
                style={{
                  padding: '2px 10px',
                  borderRadius: '4px',
                  border: '1px solid var(--color-border, #E5E0D8)',
                  background: '#fff',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  color: 'var(--color-muted, #8B8578)',
                  fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
            )}
          </div>
          <div style={{ height: '4px', background: '#eee', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${(batchProgress.current / batchProgress.total) * 100}%`,
              background: 'var(--color-sage, #6B7F5E)',
              borderRadius: '2px',
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border, #E5E0D8)' }}>
              <th style={{ ...thStyle, width: '36px', paddingRight: '0.25rem' }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--color-sage, #6B7F5E)', cursor: 'pointer' }}
                />
              </th>
              <Th>Name</Th>
              <Th>Vertical</Th>
              <Th>Region</Th>
              <Th>Priority</Th>
              <Th>Last Verified</Th>
              <Th>URL Status</Th>
              <Th>Website</Th>
              <th style={{ ...thStyle, textAlign: 'right' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem' }}>
                  <span>Actions</span>
                  {uncheckedCount > 0 && !isBatching && (
                    <button
                      onClick={handleCheckAllUnchecked}
                      style={{
                        padding: '3px 10px',
                        borderRadius: '5px',
                        border: '1px solid var(--color-sage, #6B7F5E)',
                        background: 'transparent',
                        color: 'var(--color-sage, #6B7F5E)',
                        fontSize: '10px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Check all unchecked ({uncheckedCount})
                    </button>
                  )}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {listings.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-muted, #8B8578)' }}>
                  No listings match the current filters.
                </td>
              </tr>
            ) : (
              listings.map(listing => (
                <ListingRow
                  key={listing.id}
                  listing={listing}
                  isSelected={selected.has(listing.id)}
                  onToggleSelect={toggleSelect}
                  loading={loadingRows[listing.id] || null}
                  onCheck={handleCheck}
                  onVerify={handleVerify}
                  onFlag={handleFlag}
                  onReinstate={handleReinstate}
                  reinstateError={reinstateErrors[listing.id] || null}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── ListingRow ──────────────────────────────────────────

function ListingRow({ listing, isSelected, onToggleSelect, loading, onCheck, onVerify, onFlag, onReinstate, reinstateError }) {
  const staleness = getStalenessLabel(listing.last_verified_at)
  const sc = STALENESS_COLORS[staleness] || STALENESS_COLORS.Unverified
  const priority = getPriority(listing)
  const pc = PRIORITY_COLORS[priority]
  const urlStatusKey = getUrlStatusKey(listing)
  const urlStatusLabel = getUrlStatusLabel(listing)
  const uc = STATUS_COLORS[urlStatusKey] || STATUS_COLORS.unchecked
  const isFlagged = listing.removal_flagged

  return (
    <tr style={{
      borderBottom: '1px solid var(--color-border, #E5E0D8)',
      background: isFlagged ? '#fef2f210' : isSelected ? '#f9f8f6' : 'transparent',
      transition: 'background 0.1s',
    }}>
      {/* Checkbox */}
      <td style={{ padding: '0.6rem 0.75rem', paddingRight: '0.25rem', width: '36px' }}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(listing.id)}
          style={{ width: '16px', height: '16px', accentColor: 'var(--color-sage, #6B7F5E)', cursor: 'pointer' }}
        />
      </td>

      {/* Name */}
      <td style={{ padding: '0.6rem 0.75rem', fontWeight: 500, color: 'var(--color-ink, #2D2A26)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {listing.name}
        {isFlagged && (
          <span style={{
            display: 'inline-block',
            marginLeft: '6px',
            padding: '1px 6px',
            borderRadius: '999px',
            fontSize: '0.6rem',
            fontWeight: 700,
            background: '#fef2f2',
            color: '#c53030',
            border: '1px solid #f5c6c6',
            verticalAlign: 'middle',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}>
            Flagged
          </span>
        )}
      </td>

      {/* Vertical */}
      <td style={{ padding: '0.6rem 0.5rem', color: 'var(--color-muted, #8B8578)' }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {VERTICALS[listing.vertical] || listing.vertical}
        </span>
      </td>

      {/* Region */}
      <td style={{ padding: '0.6rem 0.5rem', color: 'var(--color-muted, #8B8578)', fontSize: '0.82rem' }}>
        {listing.region || '\u2014'}
      </td>

      {/* Priority */}
      <td style={{ padding: '0.6rem 0.5rem' }}>
        <span style={{
          display: 'inline-block',
          padding: '0.15rem 0.5rem',
          borderRadius: '999px',
          fontSize: '0.68rem',
          fontWeight: 600,
          background: pc.bg,
          color: pc.color,
        }}>
          {priority}
        </span>
      </td>

      {/* Last Verified */}
      <td style={{ padding: '0.6rem 0.5rem' }}>
        <span style={{
          display: 'inline-block',
          padding: '0.15rem 0.5rem',
          borderRadius: '999px',
          fontSize: '0.68rem',
          fontWeight: 600,
          background: sc.bg,
          color: sc.color,
        }}>
          {staleness}
        </span>
        <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--color-muted, #8B8578)', marginTop: '0.15rem' }}>
          {formatDate(listing.last_verified_at)}
        </span>
      </td>

      {/* URL Status */}
      <td style={{ padding: '0.6rem 0.5rem' }}>
        {listing.website ? (
          <span style={{
            display: 'inline-block',
            padding: '0.15rem 0.5rem',
            borderRadius: '999px',
            fontSize: '0.68rem',
            fontWeight: 600,
            background: uc.bg,
            color: uc.color,
            border: `1px solid ${uc.border}`,
          }}>
            {urlStatusLabel}
            {listing.website_status_code ? ` ${listing.website_status_code}` : ''}
          </span>
        ) : (
          <span style={{ fontSize: '0.75rem', color: 'var(--color-muted, #8B8578)' }}>
            No URL
          </span>
        )}
      </td>

      {/* Website link */}
      <td style={{ padding: '0.6rem 0.5rem', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {listing.website ? (
          <a
            href={listing.website.startsWith('http') ? listing.website : `https://${listing.website}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--color-muted, #8B8578)', fontSize: '0.78rem', textDecoration: 'underline' }}
          >
            {listing.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').substring(0, 30)}
          </a>
        ) : (
          <span style={{ color: 'var(--color-muted, #8B8578)' }}>{'\u2014'}</span>
        )}
      </td>

      {/* Actions */}
      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', flexWrap: 'wrap', alignItems: 'center' }}>
          {listing.hidden_reason && (
            <ActionBtn
              onClick={() => onReinstate(listing.id)}
              disabled={false}
              loading={loading === 'reinstate'}
              color="#2563eb"
              borderColor="#2563eb"
              title="Reinstate listing (checks URL first)"
            >
              <ReinstateIcon /> Reinstate
            </ActionBtn>
          )}

          <ActionBtn
            onClick={() => onCheck(listing.id)}
            disabled={isFlagged || !listing.website}
            loading={loading === 'check'}
            color="var(--color-sage, #6B7F5E)"
            borderColor="var(--color-sage, #6B7F5E)"
            title={!listing.website ? 'No URL to check' : 'Check URL status'}
          >
            <RefreshIcon /> Check
          </ActionBtn>

          <ActionBtn
            onClick={() => onVerify(listing.id)}
            disabled={isFlagged}
            loading={loading === 'verify'}
            color="#276749"
            borderColor="#276749"
            title="Mark as verified now"
          >
            <CheckIcon /> Verify
          </ActionBtn>

          <ActionBtn
            onClick={() => onFlag(listing.id)}
            disabled={isFlagged}
            loading={loading === 'flag'}
            color="#c53030"
            borderColor="#c53030"
            title={isFlagged ? 'Already flagged' : 'Flag for removal review'}
          >
            <FlagIcon /> Flag
          </ActionBtn>
        </div>
        {reinstateError && (
          <div style={{
            marginTop: '4px',
            fontSize: '0.68rem',
            color: '#c53030',
            background: '#fef2f2',
            border: '1px solid #f5c6c6',
            borderRadius: '4px',
            padding: '3px 8px',
            textAlign: 'left',
            maxWidth: '280px',
            marginLeft: 'auto',
          }}>
            {reinstateError}
          </div>
        )}
      </td>
    </tr>
  )
}

// ─── Table header cell ───────────────────────────────────

const thStyle = {
  padding: '0.75rem 0.75rem',
  textAlign: 'left',
  fontWeight: 600,
  color: 'var(--color-muted, #8B8578)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontSize: '0.7rem',
  whiteSpace: 'nowrap',
}

function Th({ children }) {
  return <th style={thStyle}>{children}</th>
}
