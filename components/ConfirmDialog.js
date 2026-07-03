'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'

// Branded replacement for window.confirm(). Controlled: render with open,
// wire onConfirm/onCancel. `danger` styles the confirm button for
// destructive actions; `busy` disables both buttons while the action runs.
//
//   <ConfirmDialog
//     open={!!pendingDelete}
//     title="Remove this pick?"
//     message={`“${pendingDelete?.name}” will no longer appear on your listing.`}
//     confirmLabel="Remove"
//     danger
//     onConfirm={doDelete}
//     onCancel={() => setPendingDelete(null)}
//   />
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const t = useTranslations('actions')
  const cancelRef = useRef(null)
  const confirmText = confirmLabel ?? t('confirm')
  const cancelText = cancelLabel ?? t('cancel')

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    function handleKey(e) {
      if (e.key === 'Escape' && !busy) onCancel?.()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, busy, onCancel])

  if (!open) return null

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel?.()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background: 'rgba(28, 26, 23, 0.45)',
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="nav-dropdown"
        style={{
          width: '100%',
          maxWidth: '400px',
          background: 'var(--color-card-bg)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          padding: '24px',
          transformOrigin: 'center',
        }}
      >
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: '19px',
            color: 'var(--color-ink)',
            margin: '0 0 8px',
            lineHeight: 1.3,
          }}
        >
          {title}
        </h3>
        {message && (
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '14px',
              color: 'var(--color-muted)',
              margin: '0 0 20px',
              lineHeight: 1.55,
            }}
          >
            {message}
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="button"
            ref={cancelRef}
            className="btn btn-secondary btn-sm"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? t('working') : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
