'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { COMP_DURATIONS, DEFAULT_COMP_DURATION, compExpiryFromDuration } from '@/lib/claims/comp.mjs'

// The comp-term popup. One "Grant Standard" button per claim opens this; the
// term is chosen here rather than from a dropdown sitting on every card (48 of
// them turned the review queue into a wall of form controls).
//
// It replaces window.confirm for these actions too — the native dialog couldn't
// show the end date, and an admin picking a term deserves to see the date they
// are actually granting before committing to it.
//
// Two modes:
//   grant     — pick a term (1 month … in perpetuity) + optional note
//   downgrade — confirm dropping back to Free
//
// Rendered through a portal so no card's stacking or overflow context can clip
// it, and only after mount so the server render stays identical to hydration.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

const STYLES = `
.ctd-backdrop {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
  background: rgba(28, 25, 20, 0.42);
  backdrop-filter: blur(3px);
  animation: ctd-fade 140ms ease-out;
}
.ctd-panel {
  width: 100%; max-width: 460px;
  max-height: calc(100vh - 40px); overflow-y: auto;
  background: var(--color-cream, #FBF8F1);
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 14px;
  box-shadow: 0 18px 48px rgba(28,25,20,0.24), 0 2px 6px rgba(28,25,20,0.08);
  padding: 26px 26px 22px;
  animation: ctd-rise 180ms cubic-bezier(0.16, 0.84, 0.44, 1);
}
@keyframes ctd-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes ctd-rise {
  from { opacity: 0; transform: translateY(10px) scale(0.985) }
  to   { opacity: 1; transform: none }
}
@media (prefers-reduced-motion: reduce) {
  .ctd-backdrop, .ctd-panel { animation: none }
}

.ctd-eyebrow {
  font-family: var(--font-body, system-ui);
  font-size: 10px; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--color-muted, #8a8378);
  margin: 0 0 6px;
}
.ctd-title {
  font-family: var(--font-display, Georgia, serif);
  font-size: 22px; font-weight: 400; line-height: 1.2;
  color: var(--color-ink, #24211c);
  margin: 0 0 4px;
}
.ctd-sub {
  font-family: var(--font-body, system-ui);
  font-size: 13px; font-weight: 300; line-height: 1.5;
  color: var(--color-muted, #8a8378);
  margin: 0 0 20px;
}

.ctd-grid {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 8px; margin-bottom: 6px;
}
.ctd-opt {
  appearance: none; cursor: pointer;
  padding: 11px 6px;
  border: 1px solid rgba(0,0,0,0.12);
  border-radius: 9px;
  background: #fff;
  font-family: var(--font-body, system-ui);
  font-size: 13px; font-weight: 500;
  color: var(--color-ink, #24211c);
  transition: border-color 120ms, background 120ms, box-shadow 120ms, transform 80ms;
}
.ctd-opt:hover:not(:disabled) { border-color: #4a7c59; background: #fbfdfb }
.ctd-opt:active:not(:disabled) { transform: translateY(1px) }
.ctd-opt[aria-pressed="true"] {
  border-color: #4a7c59; background: #EDF4EE; color: #35603f;
  box-shadow: inset 0 0 0 1px #4a7c59;
}
.ctd-opt--wide { grid-column: 1 / -1 }
.ctd-opt:disabled { opacity: 0.5; cursor: not-allowed }

.ctd-outcome {
  display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
  margin: 14px 0 18px; padding: 11px 13px;
  border-radius: 9px;
  background: #EDF4EE;
  border: 1px solid rgba(74,124,89,0.22);
  font-family: var(--font-body, system-ui);
  font-size: 13px; color: #35603f;
}
.ctd-outcome b { font-weight: 600 }
.ctd-outcome--warn {
  background: #FCF3E2; border-color: rgba(176,128,48,0.28); color: #8a6520;
}

.ctd-label {
  display: block;
  font-family: var(--font-body, system-ui);
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--color-muted, #8a8378);
  margin-bottom: 6px;
}
.ctd-input {
  width: 100%; box-sizing: border-box;
  padding: 9px 11px;
  border: 1px solid rgba(0,0,0,0.14);
  border-radius: 8px; background: #fff;
  font-family: var(--font-body, system-ui);
  font-size: 13px; color: var(--color-ink, #24211c);
}
.ctd-input:focus { outline: 2px solid rgba(74,124,89,0.4); outline-offset: 1px }
.ctd-input::placeholder { color: #b4ada2 }

.ctd-error {
  font-family: var(--font-body, system-ui);
  font-size: 12.5px; color: #b3453f;
  background: #FBEDEC; border: 1px solid rgba(179,69,63,0.22);
  border-radius: 8px; padding: 9px 11px; margin: 0 0 14px;
}

.ctd-actions {
  display: flex; align-items: center; justify-content: flex-end;
  gap: 10px; margin-top: 20px;
}
.ctd-btn {
  cursor: pointer; border-radius: 8px;
  font-family: var(--font-body, system-ui);
  font-size: 13px; font-weight: 500;
  padding: 10px 20px;
  transition: background 120ms, border-color 120ms, opacity 120ms;
}
.ctd-btn:disabled { opacity: 0.6; cursor: not-allowed }
.ctd-btn--ghost { border: none; background: transparent; color: var(--color-muted, #8a8378) }
.ctd-btn--ghost:hover:not(:disabled) { color: var(--color-ink, #24211c) }
.ctd-btn--go { border: 1px solid #4a7c59; background: #4a7c59; color: #fff }
.ctd-btn--go:hover:not(:disabled) { background: #3f6b4c; border-color: #3f6b4c }
.ctd-btn--danger { border: 1px solid #b3453f; background: #b3453f; color: #fff }
.ctd-btn--danger:hover:not(:disabled) { background: #9c3a35; border-color: #9c3a35 }

@media (max-width: 460px) {
  .ctd-grid { grid-template-columns: repeat(2, 1fr) }
  .ctd-panel { padding: 22px 18px 18px }
}
`

export default function CompTermDialog({
  mode = 'grant',          // 'grant' | 'downgrade'
  venueName,
  currentExpiresAt = null, // the term already running, if any
  isRetermimg = false,     // true when a comp is already live
  loading = false,
  error = null,
  onConfirm,               // ({ duration, note }) => void
  onCancel,
}) {
  const [mounted, setMounted] = useState(false)
  const [duration, setDuration] = useState(DEFAULT_COMP_DURATION)
  const [note, setNote] = useState('')
  const panelRef = useRef(null)

  useEffect(() => setMounted(true), [])

  // Escape closes; focus moves into the dialog; the page behind stops scrolling.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !loading) onCancel()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const t = setTimeout(() => panelRef.current?.focus(), 0)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      clearTimeout(t)
    }
  }, [loading, onCancel])

  // The date the admin is actually granting — shown before they commit, which
  // is the whole reason this replaced window.confirm.
  const preview = useMemo(() => {
    try {
      return compExpiryFromDuration(duration)
    } catch {
      return null
    }
  }, [duration])

  if (!mounted) return null

  const venue = venueName || 'this listing'
  const isDowngrade = mode === 'downgrade'

  return createPortal(
    <>
      <style>{STYLES}</style>
      <div
        className="ctd-backdrop"
        onMouseDown={e => { if (e.target === e.currentTarget && !loading) onCancel() }}
      >
        <div
          className="ctd-panel"
          role="dialog"
          aria-modal="true"
          aria-label={isDowngrade ? 'Downgrade to Free' : 'Grant Standard'}
          tabIndex={-1}
          ref={panelRef}
        >
          <p className="ctd-eyebrow">{isDowngrade ? 'Remove comped Standard' : isRetermimg ? 'Change comp term' : 'Comped Standard'}</p>
          <h2 className="ctd-title">
            {isDowngrade
              ? `Downgrade ${venue} to Free?`
              : isRetermimg
                ? `New term for ${venue}`
                : `Grant Standard to ${venue}`}
          </h2>
          <p className="ctd-sub">
            {isDowngrade
              ? 'Paid dashboard features lock again immediately and the comp term is cleared. The operator keeps the listing — they just drop back to Free. No email is sent.'
              : isRetermimg
                ? 'Replaces the term currently running. It is measured from today, not from when the original comp was granted.'
                : 'Unlocks every paid dashboard feature with no Stripe subscription — for payment taken outside Stripe, or as a comp. No email is sent.'}
          </p>

          {error && <p className="ctd-error">{error}</p>}

          {!isDowngrade && (
            <>
              <span className="ctd-label">How long?</span>
              <div className="ctd-grid">
                {COMP_DURATIONS.map(d => (
                  <button
                    key={d.key}
                    type="button"
                    className={`ctd-opt${d.key === 'perpetual' ? ' ctd-opt--wide' : ''}`}
                    aria-pressed={duration === d.key}
                    disabled={loading}
                    onClick={() => setDuration(d.key)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              <div className={`ctd-outcome${duration === 'perpetual' ? ' ctd-outcome--warn' : ''}`}>
                {duration === 'perpetual' ? (
                  <span><b>Never expires.</b> Standard stays on until someone downgrades it here.</span>
                ) : (
                  <span>
                    Runs until <b>{formatDate(preview)}</b>, then drops back to Free automatically.
                  </span>
                )}
                {currentExpiresAt && (
                  <span style={{ opacity: 0.75 }}>Replaces the current term ending {formatDate(currentExpiresAt)}.</span>
                )}
              </div>

              <label>
                <span className="ctd-label">Note <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(optional)</span></span>
                <input
                  className="ctd-input"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  disabled={loading}
                  maxLength={120}
                  placeholder="e.g. paid by invoice INV-0042, or founding operator"
                  onKeyDown={e => { if (e.key === 'Enter' && !loading) onConfirm({ duration, note }) }}
                />
              </label>
            </>
          )}

          <div className="ctd-actions">
            <button type="button" className="ctd-btn ctd-btn--ghost" onClick={onCancel} disabled={loading}>
              Cancel
            </button>
            <button
              type="button"
              className={`ctd-btn ${isDowngrade ? 'ctd-btn--danger' : 'ctd-btn--go'}`}
              onClick={() => onConfirm({ duration, note })}
              disabled={loading}
            >
              {loading
                ? (isDowngrade ? 'Downgrading…' : 'Granting…')
                : (isDowngrade ? 'Downgrade to Free' : isRetermimg ? 'Set term' : 'Grant Standard')}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
