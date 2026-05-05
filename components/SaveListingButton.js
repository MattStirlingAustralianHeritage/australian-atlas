'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Bookmark } from 'lucide-react'
import { getAuthSupabase } from '@/lib/supabase/auth-clients'
import AuthModal from './AuthModal'

const RESUME_QUERY_KEY = 'save_after_signin'

/**
 * Save button for the listing detail action row.
 *
 * On mount, fetches save status. Clicking toggles the save with
 * optimistic UI. Unauthenticated users get an AuthModal; if they
 * complete email/password sign-in synchronously, the save fires
 * immediately. Google OAuth redirects through /auth/callback and
 * resumes via the ?save_after_signin=1 URL flag.
 *
 * Props:
 *   listingId   – UUID of the listing
 *   listingName – display name (used for ARIA label)
 */
export default function SaveListingButton({ listingId, listingName }) {
  const [saved, setSaved] = useState(false)
  const [authed, setAuthed] = useState(null) // null = unknown, true/false = known
  const [statusLoading, setStatusLoading] = useState(true)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [error, setError] = useState('')
  const [hovering, setHovering] = useState(false)
  const errorTimer = useRef(null)
  const supabase = getAuthSupabase()

  const showError = useCallback((msg) => {
    setError(msg)
    if (errorTimer.current) clearTimeout(errorTimer.current)
    errorTimer.current = setTimeout(() => setError(''), 3000)
  }, [])

  const postSave = useCallback(async () => {
    const res = await fetch('/api/user/saves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_id: listingId }),
    })
    if (!res.ok) throw new Error('save failed')
  }, [listingId])

  const deleteSave = useCallback(async () => {
    const res = await fetch('/api/user/saves', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_id: listingId }),
    })
    if (!res.ok) throw new Error('unsave failed')
  }, [listingId])

  // Initial: check auth state and current save status
  useEffect(() => {
    let cancelled = false
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return
      setAuthed(!!user)

      if (!user) {
        setStatusLoading(false)
        return
      }

      try {
        const res = await fetch(`/api/user/saves?listing_id=${listingId}`)
        if (!cancelled && res.ok) {
          const data = await res.json()
          setSaved(!!data.saved)
        }
      } catch { /* ignore */ }
      if (!cancelled) setStatusLoading(false)
    }
    init()
    return () => { cancelled = true }
  }, [listingId, supabase])

  // Resume save after OAuth/magic redirect
  useEffect(() => {
    if (statusLoading || !authed) return
    const params = new URLSearchParams(window.location.search)
    if (params.get(RESUME_QUERY_KEY) !== '1') return

    // Strip the flag from the URL so a refresh doesn't re-fire
    params.delete(RESUME_QUERY_KEY)
    const newSearch = params.toString()
    const newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '') + window.location.hash
    window.history.replaceState({}, '', newUrl)

    if (saved) return
    setSaved(true)
    postSave().catch(() => {
      setSaved(false)
      showError('Could not save. Try again.')
    })
  }, [statusLoading, authed, saved, postSave, showError])

  function handleClick() {
    if (statusLoading) return

    if (!authed) {
      setAuthModalOpen(true)
      return
    }

    if (saved) {
      setSaved(false)
      deleteSave().catch(() => {
        setSaved(true)
        showError('Could not unsave. Try again.')
      })
    } else {
      setSaved(true)
      postSave().catch(() => {
        setSaved(false)
        showError('Could not save. Try again.')
      })
    }
  }

  async function handleAuthSuccess() {
    // Email/password sign-in resolved in modal — fire save now
    setAuthed(true)
    setSaved(true)
    try {
      await postSave()
    } catch {
      setSaved(false)
      showError('Could not save. Try again.')
    }
  }

  // Build returnTo URL with the resume flag for OAuth/magic flows
  const returnTo = typeof window !== 'undefined'
    ? (() => {
        const u = new URL(window.location.href)
        u.searchParams.set(RESUME_QUERY_KEY, '1')
        return u.toString()
      })()
    : undefined

  const baseStyle = {
    fontFamily: 'var(--font-body)',
    border: '1px solid var(--color-sage, #5F8A7E)',
    color: saved || hovering ? '#fff' : 'var(--color-sage, #5F8A7E)',
    background: saved || hovering ? 'var(--color-sage, #5F8A7E)' : 'transparent',
    transition: 'background 0.15s, color 0.15s, opacity 0.15s',
    minHeight: 44,
    cursor: statusLoading ? 'default' : 'pointer',
    opacity: statusLoading ? 0.5 : 1,
  }

  const ariaLabel = saved
    ? `Remove ${listingName} from saved listings`
    : `Save ${listingName} to your listings`

  return (
    <>
      <button
        onClick={handleClick}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        disabled={statusLoading}
        aria-label={ariaLabel}
        aria-pressed={saved}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium"
        style={baseStyle}
      >
        <Bookmark
          size={14}
          strokeWidth={2}
          fill={saved ? 'currentColor' : 'none'}
        />
        {saved ? 'Saved' : 'Save'}
      </button>

      {error && (
        <p
          role="alert"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            color: '#b91c1c',
            margin: '6px 0 0',
            width: '100%',
          }}
        >
          {error}
        </p>
      )}

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
        returnTo={returnTo}
      />
    </>
  )
}
