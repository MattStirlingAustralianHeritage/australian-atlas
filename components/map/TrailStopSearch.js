'use client'
// ============================================================
// TrailStopSearch — find any venue by name and drop it on the
// trail, without hunting for its pin. The plainest possible way
// to answer "how do I add somewhere specific?".
// ============================================================

import { useState, useEffect, useRef } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { getVerticalBadge, getVerticalBrandColour } from '@/lib/verticalUrl'
import { SUB_TYPE_LABELS } from '@/lib/subTypeLabels'
import { localizeSubcategory } from '@/lib/i18n/listingLabels'

const SAGE = '#5f8a7e'

export default function TrailStopSearch({ onAdd, inTrailIds, atCapacity, autoFocus = false }) {
  const t = useTranslations('map')
  const locale = useLocale()
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [openDrop, setOpenDrop] = useState(false)
  const timer = useRef(null)
  const boxRef = useRef(null)

  useEffect(() => {
    clearTimeout(timer.current)
    if (!q.trim() || q.trim().length < 2) { setResults([]); setLoading(false); return }
    setLoading(true)
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/trails/search?q=${encodeURIComponent(q.trim())}&limit=8`)
        const data = res.ok ? await res.json() : { results: [] }
        setResults(data.results || [])
        setOpenDrop(true)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer.current)
  }, [q])

  useEffect(() => {
    function onDoc(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setOpenDrop(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <span style={{ position: 'absolute', left: 11, display: 'flex', pointerEvents: 'none' }} aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        </span>
        <input
          type="text"
          value={q}
          autoFocus={autoFocus}
          onChange={e => setQ(e.target.value)}
          onFocus={() => { if (results.length) setOpenDrop(true) }}
          placeholder={t('trailSearchPlaceholder')}
          aria-label={t('trailSearchPlaceholder')}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '8px 30px 8px 31px',
            border: `1px solid ${q ? 'rgba(95,138,126,0.45)' : 'var(--color-border)'}`,
            borderRadius: 999, fontSize: 12.5, fontFamily: 'var(--font-sans)', color: 'var(--color-ink)',
            outline: 'none', background: '#fff',
          }}
        />
        {loading ? (
          <span className="map-spinner" style={{ position: 'absolute', right: 11 }} />
        ) : q ? (
          <button onClick={() => { setQ(''); setResults([]); setOpenDrop(false) }} aria-label={t('clearSearch')} style={{
            position: 'absolute', right: 6, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        ) : null}
      </div>

      {openDrop && q.trim().length >= 2 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 5, zIndex: 40,
          background: '#fff', border: '1px solid var(--color-border)', borderRadius: 12,
          boxShadow: '0 12px 30px rgba(82,58,30,0.16)', maxHeight: 280, overflowY: 'auto',
        }}>
          {results.length === 0 && !loading && (
            <div style={{ padding: '12px 14px', fontSize: 11.5, color: 'var(--color-muted)', fontFamily: 'var(--font-sans)' }}>
              {t('trailSearchNoResults', { query: q.trim() })}
            </div>
          )}
          {results.map(r => {
            const inTrail = inTrailIds?.has(String(r.id))
            const color = getVerticalBrandColour(r.vertical) || SAGE
            const subTypes = SUB_TYPE_LABELS[r.vertical] || {}
            const enSub = subTypes[r.sub_type]
            const catLabel = enSub ? localizeSubcategory(r.sub_type, enSub, locale) : getVerticalBadge(r.vertical)
            const disabled = inTrail || (atCapacity && !inTrail) || r.latitude == null
            return (
              <button
                key={r.id}
                onClick={() => { if (!disabled) { onAdd(r); setQ(''); setResults([]); setOpenDrop(false) } }}
                disabled={disabled}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
                  padding: '9px 12px', background: 'none', border: 'none', borderBottom: '1px solid rgba(28,26,23,0.06)',
                  cursor: disabled ? 'default' : 'pointer', opacity: disabled && !inTrail ? 0.5 : 1,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontFamily: 'var(--font-serif)', fontSize: 13, color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                  <span style={{ display: 'block', fontSize: 10, color: 'var(--color-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[catLabel, r.region].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span style={{ flexShrink: 0, color: inTrail ? SAGE : 'var(--color-muted)' }}>
                  {inTrail
                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                    : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
