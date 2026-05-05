'use client'

import { useEffect } from 'react'
import { getAuthSupabase } from '@/lib/supabase/auth-clients'

const SESSION_KEY = 'srdp_session_id'

/**
 * Mounts a global listener that, on sign-in, claims any anonymous
 * Discover saves recorded against the device's session_id.
 *
 * Cross-device edge case: if the user signs in on a different device
 * than where they swiped, the session_id is not present in localStorage
 * and no merge happens. This is accepted — we cannot reconcile across
 * devices without the user signing in on the original device.
 */
export default function DiscoverSessionMerge() {
  useEffect(() => {
    const supabase = getAuthSupabase()

    async function tryMerge() {
      if (typeof window === 'undefined') return
      const sessionId = localStorage.getItem(SESSION_KEY)
      if (!sessionId) return

      try {
        const res = await fetch('/api/discover/merge-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        })
        if (res.ok) {
          localStorage.removeItem(SESSION_KEY)
        }
      } catch {
        // Network error — leave the session_id in place so we can retry
        // on a later sign-in event.
      }
    }

    // Fire on initial mount in case the user is already signed in
    // (e.g. they opened Discover anonymously, then navigated to a page
    // where they were already authenticated from a prior session).
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) tryMerge()
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') tryMerge()
    })

    return () => subscription.unsubscribe()
  }, [])

  return null
}
