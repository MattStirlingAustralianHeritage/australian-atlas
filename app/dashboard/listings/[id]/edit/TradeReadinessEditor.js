'use client'

import { useCallback, useRef, useState } from 'react'
import { MAX_GROUP_SIZE, MAX_NOTICE_DAYS, normalizeTradeProfile } from '@/lib/trade-readiness/normalize'

/**
 * Trade readiness editor — the operator-authored Atlas Trade profile.
 *
 * Self-contained, mirroring HighlightsEditor / KeywordsEditor: it reads the six
 * trade_* columns off the listing, tracks its own dirty state, and saves through
 * the same PATCH /api/dashboard/listing contract (master-only write, owner +
 * paid gated server-side). The whole edit page is already gated to paid owners,
 * and the PATCH route re-checks ownership + active claim, so this section needs
 * no gate of its own.
 *
 * Behaviour:
 *   - `trade_welcome` is the master switch. Off → the sub-fields are hidden.
 *   - Toggling the master (or group) off does NOT clear the sub-values: they stay
 *     in component state and are written as-is, so toggling back on restores the
 *     prior settings (the same preservation contract the server enforces).
 *   - `trade_group_size_max` shows only when group trade is on. Integer ≥ 1,
 *     optional. Validation reuses lib/trade-readiness/normalize so the client and
 *     server agree.
 *   - `trade_rates_available` is a yes/no only — Atlas never asks for the rate.
 */
export default function TradeReadinessEditor({ listingId, token, initial, accent }) {
  const vertColor = accent || 'var(--color-sage)'
  const l = initial || {}

  const [welcome, setWelcome] = useState(l.trade_welcome === true)
  const [bespoke, setBespoke] = useState(l.trade_bespoke === true)
  const [group, setGroup] = useState(l.trade_group === true)
  const [contactBefore, setContactBefore] = useState(l.trade_contact_before_booking === true)
  const [rates, setRates] = useState(l.trade_rates_available === true)
  const [groupSize, setGroupSize] = useState(
    l.trade_group_size_max == null ? '' : String(l.trade_group_size_max)
  )

  // Extended fact-sheet profile (listing_trade_profiles via listing.trade_profile).
  const tp = l.trade_profile || {}
  const [noticeDays, setNoticeDays] = useState(tp.notice_days == null ? '' : String(tp.notice_days))
  const [coach, setCoach] = useState(tp.coach_access === true)
  const [famil, setFamil] = useState(tp.famil_open === true)
  const [insurance, setInsurance] = useState(tp.insurance_confirmed === true)
  const [languages, setLanguages] = useState(Array.isArray(tp.languages) ? tp.languages.join(', ') : '')
  const [dietary, setDietary] = useState(tp.dietary_notes || '')
  const [capacity, setCapacity] = useState(tp.capacity_notes || '')
  const [seasonal, setSeasonal] = useState(tp.seasonal_notes || '')
  const [contactName, setContactName] = useState(tp.contact_name || '')
  const [contactEmail, setContactEmail] = useState(tp.contact_email || '')
  const [contactPhone, setContactPhone] = useState(tp.contact_phone || '')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [justSaved, setJustSaved] = useState(false)

  const snapshot = useCallback(
    (vals) => JSON.stringify(vals.map((v) => (typeof v === 'string' ? v.trim() : v))),
    []
  )
  const collect = (w, b, g, c, r, size, nd, co, fa, ins, lang, diet, cap, sea, cn, ce, cp) =>
    [w, b, g, c, r, size, nd, co, fa, ins, lang, diet, cap, sea, cn, ce, cp]

  const baselineRef = useRef(
    snapshot(collect(
      l.trade_welcome === true,
      l.trade_bespoke === true,
      l.trade_group === true,
      l.trade_contact_before_booking === true,
      l.trade_rates_available === true,
      l.trade_group_size_max == null ? '' : String(l.trade_group_size_max),
      tp.notice_days == null ? '' : String(tp.notice_days),
      tp.coach_access === true,
      tp.famil_open === true,
      tp.insurance_confirmed === true,
      Array.isArray(tp.languages) ? tp.languages.join(', ') : '',
      tp.dietary_notes || '',
      tp.capacity_notes || '',
      tp.seasonal_notes || '',
      tp.contact_name || '',
      tp.contact_email || '',
      tp.contact_phone || ''
    ))
  )

  const current = snapshot(collect(
    welcome, bespoke, group, contactBefore, rates, groupSize,
    noticeDays, coach, famil, insurance, languages, dietary, capacity, seasonal,
    contactName, contactEmail, contactPhone
  ))
  const dirty = current !== baselineRef.current

  // Hydrate from a fresh server echo (or the values we just sent) + re-baseline.
  const hydrate = useCallback((row, profile) => {
    const w = row.trade_welcome === true
    const b = row.trade_bespoke === true
    const g = row.trade_group === true
    const c = row.trade_contact_before_booking === true
    const r = row.trade_rates_available === true
    const size = row.trade_group_size_max == null ? '' : String(row.trade_group_size_max)
    setWelcome(w); setBespoke(b); setGroup(g); setContactBefore(c); setRates(r); setGroupSize(size)
    const p = profile || {}
    const nd = p.notice_days == null ? '' : String(p.notice_days)
    const co = p.coach_access === true
    const fa = p.famil_open === true
    const ins = p.insurance_confirmed === true
    const lang = Array.isArray(p.languages) ? p.languages.join(', ') : ''
    const diet = p.dietary_notes || ''
    const cap = p.capacity_notes || ''
    const sea = p.seasonal_notes || ''
    const cn = p.contact_name || ''
    const ce = p.contact_email || ''
    const cp = p.contact_phone || ''
    setNoticeDays(nd); setCoach(co); setFamil(fa); setInsurance(ins)
    setLanguages(lang); setDietary(diet); setCapacity(cap); setSeasonal(sea)
    setContactName(cn); setContactEmail(ce); setContactPhone(cp)
    baselineRef.current = snapshot(collect(w, b, g, c, r, size, nd, co, fa, ins, lang, diet, cap, sea, cn, ce, cp))
  }, [snapshot])

  async function handleSave() {
    // Client-side guard mirrors the server (so the operator gets an inline error
    // without a round-trip). Empty = unspecified.
    const sizeStr = String(groupSize).trim()
    let sizeValue = null
    if (sizeStr !== '') {
      const n = Number(sizeStr)
      if (!Number.isInteger(n) || n < 1 || n > MAX_GROUP_SIZE) {
        setError('Maximum group size must be a whole number of at least 1.')
        return
      }
      sizeValue = n
    }

    // The profile shares one validation authority with the server.
    const profilePayload = {
      notice_days: String(noticeDays).trim(),
      coach_access: coach,
      famil_open: famil,
      insurance_confirmed: insurance,
      languages,
      dietary_notes: dietary,
      capacity_notes: capacity,
      seasonal_notes: seasonal,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone,
    }
    const profileNorm = normalizeTradeProfile(profilePayload)
    if (!profileNorm.ok) {
      setError(profileNorm.error)
      return
    }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/listing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          listing_id: listingId,
          // Send every field as-is (master/group off still sends sub-values, so
          // they are preserved — never cleared by a toggle).
          trade_readiness: {
            trade_welcome: welcome,
            trade_bespoke: bespoke,
            trade_group: group,
            trade_contact_before_booking: contactBefore,
            trade_rates_available: rates,
            trade_group_size_max: sizeValue,
          },
          trade_profile: profilePayload,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not save your trade settings.')
      } else {
        hydrate(
          data.listing || {
            trade_welcome: welcome, trade_bespoke: bespoke, trade_group: group,
            trade_contact_before_booking: contactBefore, trade_rates_available: rates,
            trade_group_size_max: sizeValue,
          },
          data.listing?.trade_profile || profileNorm.value
        )
        setJustSaved(true)
        setTimeout(() => setJustSaved(false), 2500)
      }
    } catch {
      setError('Could not save your trade settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ marginTop: 36, paddingTop: 28, borderTop: '1px solid var(--color-border)' }}>
      <style>{`
        .aa-tr-save:not(:disabled):hover { opacity: 0.9; }
        .aa-tr-size:focus { border-color: ${vertColor}; }
      `}</style>

      <div style={{ marginBottom: 4 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22, color: 'var(--color-ink)', margin: 0 }}>
          Trade readiness
        </h2>
      </div>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)', margin: '0 0 20px', lineHeight: 1.5, maxWidth: 560 }}>
        Tour operators and trip designers can include claimed venues when building itineraries. You control
        whether, and how. Off by default.
      </p>

      {/* ── Master switch ──────────────────────────────────── */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600, color: 'var(--color-ink)' }}>
              Welcome trade
            </span>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-muted)', margin: '4px 0 0', lineHeight: 1.5 }}>
              Let the trade include this venue. The specifics below appear once this is on.
            </p>
          </div>
          <Toggle on={welcome} onChange={setWelcome} color={vertColor} label="Welcome trade" />
        </div>

        {welcome && (
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14, borderTop: '1px solid var(--color-border)', paddingTop: 18 }}>
            <SwitchRow
              label="Bespoke trade"
              help="Individual / bespoke trade (private trip designers, DMCs)."
              on={bespoke} onChange={setBespoke} color={vertColor}
            />
            <SwitchRow
              label="Group trade"
              help="Group / volume trade."
              on={group} onChange={setGroup} color={vertColor}
            />

            {group && (
              <div style={{ paddingLeft: 4 }}>
                <label htmlFor="aa-tr-size" style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>
                  Maximum group size
                </label>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-muted)', margin: '2px 0 6px', lineHeight: 1.45 }}>
                  Optional. Leave blank if it depends on the experience.
                </p>
                <input
                  id="aa-tr-size"
                  className="aa-tr-size"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={groupSize}
                  onChange={e => setGroupSize(e.target.value)}
                  placeholder="e.g. 12"
                  style={{ ...inputStyle, maxWidth: 160 }}
                />
              </div>
            )}

            <SwitchRow
              label="Contact me first"
              help="Require trade to contact you before including you."
              on={contactBefore} onChange={setContactBefore} color={vertColor}
            />
            <SwitchRow
              label="Trade rates available"
              help="I offer trade rates. Atlas never asks for or shows the rate."
              on={rates} onChange={setRates} color={vertColor}
            />
          </div>
        )}
      </div>

      {/* ── Fact-sheet profile (the depth trade buyers contract against) ── */}
      {welcome && (
        <div style={{ ...cardStyle, marginTop: 14 }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600, color: 'var(--color-ink)' }}>
            Your trade fact sheet
          </span>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-muted)', margin: '4px 0 16px', lineHeight: 1.5 }}>
            The details buyers check before they contract a venue. Everything is optional — the more you state,
            the stronger your fact sheet reads. Your trade contact is shown only to signed-in trade buyers, never publicly.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 180px' }}>
                <FieldLabel htmlFor="aa-tr-notice" label="Minimum booking notice (days)" />
                <input
                  id="aa-tr-notice" type="number" inputMode="numeric" min={0} max={MAX_NOTICE_DAYS} step={1}
                  value={noticeDays} onChange={e => setNoticeDays(e.target.value)}
                  placeholder="e.g. 7" style={{ ...inputStyle, maxWidth: 160 }}
                />
              </div>
              <div style={{ flex: '1 1 220px' }}>
                <FieldLabel htmlFor="aa-tr-langs" label="Languages (comma-separated)" />
                <input
                  id="aa-tr-langs" value={languages} onChange={e => setLanguages(e.target.value)}
                  placeholder="e.g. English, Mandarin" style={inputStyle}
                />
              </div>
            </div>

            <SwitchRow label="Coach access" help="Coach parking or drop-off works at your venue." on={coach} onChange={setCoach} color={vertColor} />
            <SwitchRow label="Open to famils" help="Trade buyers can arrange a familiarisation visit." on={famil} onChange={setFamil} color={vertColor} />
            <SwitchRow label="Public liability insurance" help="You hold current public liability insurance (buyers routinely require this)." on={insurance} onChange={setInsurance} color={vertColor} />

            <div>
              <FieldLabel htmlFor="aa-tr-dietary" label="Dietary handling" />
              <input id="aa-tr-dietary" value={dietary} onChange={e => setDietary(e.target.value)}
                placeholder="e.g. GF and vegan with 48 hours notice" style={inputStyle} />
            </div>
            <div>
              <FieldLabel htmlFor="aa-tr-capacity" label="Capacity notes" />
              <input id="aa-tr-capacity" value={capacity} onChange={e => setCapacity(e.target.value)}
                placeholder="e.g. two seatings of 16 indoors, 40 on the lawn" style={inputStyle} />
            </div>
            <div>
              <FieldLabel htmlFor="aa-tr-seasonal" label="Seasonal closures" />
              <input id="aa-tr-seasonal" value={seasonal} onChange={e => setSeasonal(e.target.value)}
                placeholder="e.g. closed July; reduced hours over vintage" style={inputStyle} />
            </div>

            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
              <FieldLabel label="Dedicated trade contact (only shown to trade buyers)" />
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                <input aria-label="Trade contact name" value={contactName} onChange={e => setContactName(e.target.value)}
                  placeholder="Name" style={{ ...inputStyle, flex: '1 1 150px' }} />
                <input aria-label="Trade contact email" type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)}
                  placeholder="Email" style={{ ...inputStyle, flex: '1 1 200px' }} />
                <input aria-label="Trade contact phone" value={contactPhone} onChange={e => setContactPhone(e.target.value)}
                  placeholder="Phone" style={{ ...inputStyle, flex: '1 1 140px' }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Save row ───────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16, flexWrap: 'wrap' }}>
        <button
          type="button" className="aa-tr-save" onClick={handleSave} disabled={saving || !dirty}
          style={{
            padding: '10px 20px', borderRadius: 8, border: 'none',
            background: dirty ? 'var(--color-ink)' : 'var(--color-border)',
            color: dirty ? '#fff' : 'var(--color-muted)',
            fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
            cursor: saving || !dirty ? 'default' : 'pointer', transition: 'opacity 0.12s ease',
          }}
        >
          {saving ? 'Saving…' : 'Save trade settings'}
        </button>
        {error ? (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: '#c62828' }}>{error}</span>
        ) : justSaved ? (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: '#2e7d32', fontWeight: 600 }}>✓ Trade settings saved</span>
        ) : dirty ? (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-muted)' }}>Unsaved trade changes</span>
        ) : null}
      </div>
    </div>
  )
}

// ── Sub-components (match HighlightsEditor's aesthetic) ──────
function FieldLabel({ htmlFor, label }) {
  return (
    <label htmlFor={htmlFor} style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--color-ink)', marginBottom: 6 }}>
      {label}
    </label>
  )
}

function SwitchRow({ label, help, on, onChange, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>{label}</span>
        {help && (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-muted)', margin: '3px 0 0', lineHeight: 1.5 }}>{help}</p>
        )}
      </div>
      <Toggle on={on} onChange={onChange} color={color} label={label} />
    </div>
  )
}

function Toggle({ on, onChange, color, label }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label}
      onClick={() => onChange(!on)}
      style={{
        flexShrink: 0, position: 'relative', width: 46, height: 26, borderRadius: 999,
        border: 'none', cursor: 'pointer', padding: 0,
        background: on ? color : 'var(--color-border)', transition: 'background 0.15s ease',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: '50%',
        background: '#fff', transition: 'left 0.15s ease', boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
      }} />
    </button>
  )
}

const cardStyle = {
  borderRadius: 12, border: '1px solid var(--color-border)',
  background: 'var(--color-card-bg)', padding: 20,
}
const inputStyle = {
  width: '100%', padding: '9px 11px', border: '1px solid var(--color-border)', borderRadius: 8,
  fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink)', background: '#fff',
  outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.12s ease',
}
