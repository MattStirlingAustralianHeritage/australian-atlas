'use client'
// ============================================================
// TrailWizard — three quiet questions, then a drafted trail.
//
// This is Plan-a-Stay's engine wearing the map's clothes: the
// same /api/plan-a-stay/retrieve → /assemble pipeline (k-means
// clustering, intent→vertical mapping, taste-affinity ranking,
// coffee-first / lunch-middle day structure) seeds an editable
// trail straight onto the map. One tech tree, two surfaces.
// ============================================================

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { stopsFromPlanAStayTrip } from '@/lib/trail/draft'
import { readDiscoveryPicks } from '@/lib/discover/sessionPicks'

const SAGE = '#5f8a7e'

const INTENTS = [
  { key: 'food-and-producers', labelKey: 'wizardIntentFood' },
  { key: 'landscape-and-walking', labelKey: 'wizardIntentLandscape' },
  { key: 'makers-and-craft', labelKey: 'wizardIntentMakers' },
  { key: 'quiet-and-slow', labelKey: 'wizardIntentQuiet' },
  { key: 'a-bit-of-everything', labelKey: 'wizardIntentEverything' },
]

const DURATIONS = [
  { value: 1, labelKey: 'wizardDurationDay' },
  { value: 2, labelKey: 'wizardDurationWeekend' },
  { value: 3, labelKey: 'wizardDurationThree' },
  { value: 5, labelKey: 'wizardDurationLonger' },
]

const PACES = [
  { key: 'steady', labelKey: 'wizardPaceSteady' },
  { key: 'out-early-back-late', labelKey: 'wizardPaceFull' },
  { key: 'as-little-driving', labelKey: 'wizardPaceLittleDriving' },
]

function Chip({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '9px 14px', borderRadius: 18, cursor: 'pointer', minHeight: 38,
      border: `1px solid ${active ? SAGE : 'var(--color-border)'}`,
      background: active ? SAGE : '#fff',
      color: active ? '#fff' : 'var(--color-ink)',
      fontSize: 12, fontWeight: active ? 600 : 500, fontFamily: 'var(--font-sans)',
      transition: 'all 0.15s', textAlign: 'left',
    }}>{children}</button>
  )
}

export default function TrailWizard({ onSeed, onClose }) {
  const t = useTranslations('map')
  const [step, setStep] = useState(0) // 0 where · 1 what · 2 pace/length
  const [regions, setRegions] = useState(null) // null = loading
  const [regionQuery, setRegionQuery] = useState('')
  const [region, setRegion] = useState(null) // { name, state } | '__not_sure'
  const [intents, setIntents] = useState([])
  const [duration, setDuration] = useState(2)
  const [pace, setPace] = useState('steady')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/plan-a-stay/regions')
      .then(r => r.ok ? r.json() : { regions: [] })
      .then(({ regions }) => { if (!cancelled) setRegions(regions || []) })
      .catch(() => { if (!cancelled) setRegions([]) })
    return () => { cancelled = true }
  }, [])

  const toggleIntent = (key) => {
    setIntents(prev => prev.includes(key)
      ? prev.filter(k => k !== key)
      : prev.length >= 2 ? [...prev.slice(1), key] : [...prev, key])
  }

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      const answers = {
        intent: intents.length ? intents : ['a-bit-of-everything'],
        pacing: pace,
        duration,
        region: region === '__not_sure' ? '__not_sure' : region?.name,
        anchor: null,
        discoveryPicks: readDiscoveryPicks(),
      }
      const retrieveRes = await fetch('/api/plan-a-stay/retrieve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answers),
      })
      if (!retrieveRes.ok) throw new Error(`retrieve ${retrieveRes.status}`)
      const retrieval = await retrieveRes.json()

      const assembleRes = await fetch('/api/plan-a-stay/assemble', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, retrieval }),
      })
      if (!assembleRes.ok) throw new Error(`assemble ${assembleRes.status}`)
      const data = await assembleRes.json()

      if (!data.trip?.days?.length) {
        setError(t('wizardNoResults'))
        setGenerating(false)
        return
      }
      const stops = stopsFromPlanAStayTrip(data.trip)
      if (stops.length < 2) {
        setError(t('wizardNoResults'))
        setGenerating(false)
        return
      }
      onSeed(stops, data.trip.title || '')
    } catch (err) {
      console.error('[trail wizard]', err)
      setError(t('wizardError'))
      setGenerating(false)
    }
  }

  const filteredRegions = (regions || []).filter(r =>
    !regionQuery.trim() || r.name.toLowerCase().includes(regionQuery.trim().toLowerCase())
  )

  const stepTitles = [t('wizardWhere'), t('wizardWhat'), t('wizardHowLong')]

  return (
    <div style={{ padding: '14px 15px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {[0, 1, 2].map(i => (
            <span key={i} style={{
              width: i === step ? 18 : 6, height: 6, borderRadius: 3,
              background: i <= step ? SAGE : 'var(--color-border)',
              transition: 'all 0.25s',
            }} />
          ))}
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer', fontSize: 11,
          color: 'var(--color-muted)', fontFamily: 'var(--font-sans)', padding: '4px 0',
        }}>{t('wizardCancel')}</button>
      </div>

      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-ink)', lineHeight: 1.3 }}>
        {stepTitles[step]}
      </div>

      {step === 0 && (
        <>
          <input
            type="text"
            value={regionQuery}
            onChange={e => setRegionQuery(e.target.value)}
            placeholder={t('wizardRegionSearch')}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '9px 12px',
              border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 13,
              fontFamily: 'var(--font-sans)', outline: 'none', background: '#fff',
            }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, maxHeight: 220, overflowY: 'auto' }}>
            <Chip active={region === '__not_sure'} onClick={() => setRegion('__not_sure')}>
              {t('wizardSurpriseMe')}
            </Chip>
            {regions === null && <span style={{ fontSize: 11.5, color: 'var(--color-muted)', padding: '9px 2px' }}>{t('loading')}</span>}
            {filteredRegions.map(r => (
              <Chip key={r.slug} active={region?.name === r.name} onClick={() => setRegion(r)}>
                {r.name} <span style={{ opacity: 0.65, fontSize: 10.5 }}>{r.state}</span>
              </Chip>
            ))}
          </div>
          <button
            disabled={!region}
            onClick={() => setStep(1)}
            style={{
              padding: '11px 0', borderRadius: 8, border: 'none', cursor: region ? 'pointer' : 'default',
              background: region ? 'var(--color-ink)' : 'var(--color-border)',
              color: region ? 'var(--color-cream)' : 'var(--color-muted)',
              fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
              fontFamily: 'var(--font-sans)',
            }}
          >{t('wizardNext')}</button>
        </>
      )}

      {step === 1 && (
        <>
          <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: -6 }}>{t('wizardPickUpTo2')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {INTENTS.map(i => (
              <Chip key={i.key} active={intents.includes(i.key)} onClick={() => toggleIntent(i.key)}>
                {t(i.labelKey)}
              </Chip>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setStep(0)} style={{
              flex: '0 0 auto', padding: '11px 16px', borderRadius: 8, border: '1px solid var(--color-border)',
              background: '#fff', color: 'var(--color-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              fontFamily: 'var(--font-sans)',
            }}>{t('wizardBack')}</button>
            <button
              disabled={!intents.length}
              onClick={() => setStep(2)}
              style={{
                flex: 1, padding: '11px 0', borderRadius: 8, border: 'none',
                cursor: intents.length ? 'pointer' : 'default',
                background: intents.length ? 'var(--color-ink)' : 'var(--color-border)',
                color: intents.length ? 'var(--color-cream)' : 'var(--color-muted)',
                fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
                fontFamily: 'var(--font-sans)',
              }}
            >{t('wizardNext')}</button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {DURATIONS.map(d => (
              <Chip key={d.value} active={duration === d.value} onClick={() => setDuration(d.value)}>
                {t(d.labelKey)}
              </Chip>
            ))}
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--color-muted)', marginTop: 2 }}>
            {t('wizardPace')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {PACES.map(p => (
              <Chip key={p.key} active={pace === p.key} onClick={() => setPace(p.key)}>
                {t(p.labelKey)}
              </Chip>
            ))}
          </div>
          {error && (
            <div style={{ fontSize: 11.5, color: 'var(--color-accent)', lineHeight: 1.5 }}>{error}</div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setStep(1)} disabled={generating} style={{
              flex: '0 0 auto', padding: '11px 16px', borderRadius: 8, border: '1px solid var(--color-border)',
              background: '#fff', color: 'var(--color-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              fontFamily: 'var(--font-sans)',
            }}>{t('wizardBack')}</button>
            <button
              onClick={generate}
              disabled={generating}
              style={{
                flex: 1, padding: '11px 0', borderRadius: 8, border: 'none', cursor: generating ? 'default' : 'pointer',
                background: SAGE, color: '#fff',
                fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
                fontFamily: 'var(--font-sans)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {generating && <span style={{
                width: 13, height: 13, borderRadius: '50%', flexShrink: 0,
                border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff',
                animation: 'map-spin 0.7s linear infinite',
              }} />}
              {generating ? t('wizardDrafting') : t('wizardDraftTrail')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
