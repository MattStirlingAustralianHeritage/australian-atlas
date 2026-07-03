'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

const REPORT_TYPE_KEYS = ['permanently_closed', 'temporarily_closed', 'incorrect_info', 'request_deletion']

const DETAIL_TYPES = ['incorrect_info', 'request_deletion']

export default function ReportIssueModal({ listingId, listingName, slug, onClose }) {
  const t = useTranslations('actions')
  const REPORT_TYPES = [
    { key: 'permanently_closed', label: t('reportPermanentlyClosed'), desc: t('reportPermanentlyClosedDesc') },
    { key: 'temporarily_closed', label: t('reportTemporarilyClosed'), desc: t('reportTemporarilyClosedDesc') },
    { key: 'incorrect_info', label: t('reportIncorrect'), desc: t('reportIncorrectDesc') },
    { key: 'request_deletion', label: t('reportRemoval'), desc: t('reportRemovalDesc') },
  ]
  const [selected, setSelected] = useState(null)
  const [details, setDetails] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit() {
    if (!selected) return
    setSubmitting(true)
    try {
      await fetch('/api/community-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listingId,
          report_type: selected,
          details: details.trim() || null,
          contact_email: contactEmail.trim() || null,
        }),
      })
      setSubmitted(true)
    } catch {
      // Silent fail — report is non-critical
      setSubmitted(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }} onClick={onClose}>
        <div style={{
          background: 'white', borderRadius: 16, padding: '32px 28px',
          maxWidth: 420, width: '100%', textAlign: 'center',
        }} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>{t('thankYou')}</div>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-muted)',
            lineHeight: 1.6, marginBottom: 20,
          }}>
            {t('reportReceived', { name: listingName })}
          </p>
          <button onClick={onClose} style={{
            fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13,
            background: 'var(--color-ink)', color: 'white', border: 'none',
            borderRadius: 8, padding: '10px 24px', cursor: 'pointer',
          }}>
            {t('close')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }} onClick={onClose}>
      <div style={{
        background: 'white', borderRadius: 16, padding: '28px 24px',
        maxWidth: 420, width: '100%',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{
          fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 20,
          color: 'var(--color-ink)', marginBottom: 4,
        }}>
          {t('reportIssue')}
        </h3>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)',
          marginBottom: 20,
        }}>
          {t('reportHelp', { name: listingName })}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {REPORT_TYPES.map(rt => (
            <button
              key={rt.key}
              onClick={() => setSelected(rt.key)}
              style={{
                textAlign: 'left', padding: '12px 16px', borderRadius: 10,
                border: selected === rt.key ? '2px solid var(--color-ink)' : '1px solid var(--color-border)',
                background: selected === rt.key ? '#fafaf8' : 'white',
                cursor: 'pointer', transition: 'all 0.15s ease',
              }}
            >
              <div style={{
                fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 14,
                color: 'var(--color-ink)',
              }}>
                {rt.label}
              </div>
              <div style={{
                fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 12,
                color: 'var(--color-muted)', marginTop: 2,
              }}>
                {rt.desc}
              </div>
            </button>
          ))}
        </div>

        {DETAIL_TYPES.includes(selected) && (
          <textarea
            value={details}
            onChange={e => setDetails(e.target.value)}
            placeholder={selected === 'request_deletion'
              ? t('reportRemovalPlaceholder')
              : t('reportCorrectPlaceholder')}
            rows={3}
            style={{
              width: '100%', fontFamily: 'var(--font-body)', fontSize: 13,
              border: '1px solid var(--color-border)', borderRadius: 8,
              padding: '10px 12px', resize: 'vertical', marginBottom: 12,
              outline: 'none',
            }}
          />
        )}

        {selected === 'request_deletion' && (
          <input
            type="email"
            value={contactEmail}
            onChange={e => setContactEmail(e.target.value)}
            placeholder={t('reportEmailPlaceholder')}
            style={{
              width: '100%', fontFamily: 'var(--font-body)', fontSize: 13,
              border: '1px solid var(--color-border)', borderRadius: 8,
              padding: '10px 12px', marginBottom: 16, outline: 'none',
            }}
          />
        )}

        {/* Notice-and-takedown entry point for rights holders. */}
        <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0 14px', paddingTop: 14 }}>
          <a
            href={`/report-infringement?${new URLSearchParams({ ...(slug ? { slug } : {}), ...(listingName ? { name: listingName } : {}) }).toString()}`}
            style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-muted)', textDecoration: 'underline' }}
          >
            {t('reportInfringement')}
          </a>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 13,
            background: 'transparent', color: 'var(--color-muted)',
            border: '1px solid var(--color-border)', borderRadius: 8,
            padding: '10px 20px', cursor: 'pointer',
          }}>
            {t('cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selected || submitting}
            style={{
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13,
              background: selected ? 'var(--color-ink)' : '#ccc',
              color: 'white', border: 'none', borderRadius: 8,
              padding: '10px 20px', cursor: selected ? 'pointer' : 'default',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? t('submitting') : t('submitReport')}
          </button>
        </div>
      </div>
    </div>
  )
}
