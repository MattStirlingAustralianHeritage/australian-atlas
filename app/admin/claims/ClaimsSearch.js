'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import ClaimTierActions from './ClaimTierActions'

// Find ANY listing from the claims desk.
//
// The queue below only renders the ~100 most recent claims, so a venue claimed
// months ago — or never claimed at all — was simply unreachable from the page
// that owns its commercial state. This searches the whole network by venue
// name, address, slug, listing id, or claimant email, and puts the same tier
// controls on whatever it finds.

const MIN_QUERY = 2
const DEBOUNCE_MS = 300

export default function ClaimsSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null) // null = nothing searched yet
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Only the newest request may write state — a slow early keystroke must never
  // land on top of a later, narrower result set.
  const requestRef = useRef(0)
  const abortRef = useRef(null)

  const runSearch = useCallback(async (q) => {
    const requestId = ++requestRef.current
    abortRef.current?.abort()

    if (q.trim().length < MIN_QUERY) {
      setResults(null)
      setTruncated(false)
      setLoading(false)
      setError(null)
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/admin/claims/search?q=${encodeURIComponent(q.trim())}`, {
        signal: controller.signal,
      })
      const data = await res.json()
      if (requestId !== requestRef.current) return
      if (!res.ok) {
        setError(data.error || 'Search failed')
        setResults([])
        return
      }
      setResults(data.results || [])
      setTruncated(!!data.truncated)
    } catch (err) {
      if (err.name === 'AbortError') return
      if (requestId !== requestRef.current) return
      setError('Network error — please try again')
      setResults([])
    } finally {
      if (requestId === requestRef.current) setLoading(false)
    }
  }, [])

  // Debounce keystrokes into one request.
  useEffect(() => {
    const t = setTimeout(() => runSearch(query), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query, runSearch])

  useEffect(() => () => abortRef.current?.abort(), [])

  const refresh = useCallback(() => runSearch(query), [runSearch, query])

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ position: 'relative' }}>
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Find any listing — venue name, address, listing id, or operator email"
          aria-label="Search listings"
          style={{
            width: '100%',
            padding: '12px 14px',
            borderRadius: 8,
            border: '1px solid var(--color-border, #e5e5e5)',
            background: '#fff',
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            color: 'var(--color-ink)',
            boxSizing: 'border-box',
          }}
        />
        {loading && (
          <span style={{
            position: 'absolute',
            right: 14,
            top: '50%',
            transform: 'translateY(-50%)',
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            color: 'var(--color-muted)',
          }}>
            searching…
          </span>
        )}
      </div>

      {error && (
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 12,
          color: '#c44',
          margin: '8px 0 0',
        }}>
          {error}
        </p>
      )}

      {results !== null && !error && (
        <div style={{ marginTop: 12 }}>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            fontSize: 11,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--color-muted)',
            marginBottom: 10,
          }}>
            {results.length === 0
              ? 'no matches'
              : `${results.length}${truncated ? '+' : ''} match${results.length === 1 ? '' : 'es'}`}
          </p>

          {results.length === 0 ? (
            <p style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 300,
              fontSize: 13,
              color: 'var(--color-muted)',
              margin: 0,
            }}>
              Nothing matched “{query.trim()}”. Try part of the venue name, the suburb, or the operator’s email.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {results.map(r => (
                <SearchResultCard key={r.listingId} result={r} onChanged={refresh} />
              ))}
              {truncated && (
                <p style={{
                  fontFamily: 'var(--font-body)',
                  fontWeight: 300,
                  fontSize: 12,
                  color: 'var(--color-muted)',
                  margin: '2px 0 0',
                }}>
                  More listings match than are shown — narrow the search to see the rest.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SearchResultCard({ result, onChanged }) {
  const { claim, review } = result
  const place = [result.region, result.state].filter(Boolean).join(', ')

  return (
    <div style={{
      padding: '14px 18px',
      borderRadius: 8,
      border: '1px solid var(--color-border)',
      background: '#fff',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            fontSize: 14,
            color: 'var(--color-ink)',
          }}>
            {result.name}
          </span>
          <Pill
            text={(result.vertical || 'unknown').toUpperCase()}
            color="var(--color-sage)"
            background="var(--color-cream)"
          />
          <OwnershipBadge result={result} />
          {result.listingStatus !== 'active' && (
            <Pill text={result.listingStatus || 'no status'} color="#a44" background="#F2D4D4" />
          )}
        </div>
        {result.slug && (
          <a
            href={`/place/${result.slug}`}
            target="_blank"
            rel="noreferrer"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 11,
              color: 'var(--color-muted)',
              whiteSpace: 'nowrap',
            }}
          >
            view ↗
          </a>
        )}
      </div>

      <p style={{
        fontFamily: 'var(--font-body)',
        fontWeight: 300,
        fontSize: 13,
        color: 'var(--color-muted)',
        margin: 0,
      }}>
        {claim?.claimantEmail || review?.claimantEmail || result.address || place || '—'}
        {(claim?.claimantEmail || review?.claimantEmail) && place ? ` · ${place}` : ''}
      </p>

      {claim ? (
        <ClaimTierActions
          claimId={review?.id || null}
          listingId={result.listingId}
          venueName={result.name}
          tier={claim.lapsed ? 'free' : claim.tier}
          hasStripeSubscription={claim.hasStripeSubscription}
          compExpiresAt={claim.compExpiresAt}
          compNote={claim.compNote}
          onChanged={onChanged}
        />
      ) : (
        // A tier is a property of ownership — there is nobody to give Standard
        // to until a claim is granted. Say so rather than showing a dead button.
        <p style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 300,
          fontSize: 12,
          fontStyle: 'italic',
          color: 'var(--color-muted)',
          margin: '10px 0 0',
        }}>
          {review
            ? `Claim ${review.status} — no live ownership row, so there is no tier to set yet.`
            : 'Unclaimed. An operator has to claim this listing before Standard can be granted.'}
        </p>
      )}
    </div>
  )
}

function OwnershipBadge({ result }) {
  const { claim } = result
  if (!claim) return <Pill text="unclaimed" color="var(--color-muted)" background="#EFEFEF" />
  if (claim.hasStripeSubscription && claim.tier === 'standard') {
    return <Pill text="standard · paid" color="#4a7c59" background="#C4D8B8" />
  }
  if (claim.tier === 'standard' && !claim.lapsed) {
    return (
      <Pill
        text={claim.perpetual ? 'standard · comped' : 'standard · comped term'}
        color="#4a7c59"
        background="#C4D8B8"
      />
    )
  }
  if (claim.lapsed) return <Pill text="comp lapsed" color="#b08030" background="#FCE4B8" />
  return <Pill text="free" color="var(--color-muted)" background="#EFEFEF" />
}

function Pill({ text, color, background }) {
  return (
    <span style={{
      fontFamily: 'var(--font-body)',
      fontWeight: 500,
      fontSize: 10,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color,
      background,
      padding: '2px 8px',
      borderRadius: 100,
    }}>
      {text}
    </span>
  )
}
