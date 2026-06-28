'use client'

/* ============================================================
   FeatureGuide — first-click walkthroughs for the operator dashboard.

   Every dashboard tool the operator hasn't opened yet wears a small pulsing
   amber "!" badge in the sidebar. The first time they land on that tool's page,
   a bold three-slide walkthrough appears: a fabricated example illustration of
   the tool in action, a plain-English account of how it works, and why it's
   worth their time. Dismiss it once and it (and its badge) are gone for good —
   tracked per-operator in localStorage.

   This file owns the *content* (FEATURE_GUIDES), the *illustration scenes*, the
   *badge*, and the *modal*. The wiring (which is unseen, when to open) lives in
   the dashboard layout, which holds the operator identity and the route.
   ============================================================ */

import { useState, useEffect, useCallback } from 'react'
import './feature-guide.css'

/* ── palette (mirrors the dashboard's CSS custom properties) ───────────── */
const C = {
  ink: '#2D2A26',
  sage: '#5f8a7e',
  gold: '#C4973B',
  cream: '#FAF8F5',
  sand: '#F0EBDF',
  line: '#ECE7DD',
  muted: '#8A857D',
}

/* ── persistence ──────────────────────────────────────────────────────── */
const SEEN_PREFIX = 'aa:dash-guide-seen:v1'
const seenStoreKey = (userId) => `${SEEN_PREFIX}:${userId || 'anon'}`

export function loadSeen(userId) {
  try { return new Set(JSON.parse(window.localStorage.getItem(seenStoreKey(userId)) || '[]')) }
  catch { return new Set() }
}
export function persistSeen(userId, set) {
  try { window.localStorage.setItem(seenStoreKey(userId), JSON.stringify([...set])) }
  catch { /* private mode — guides simply re-show next session */ }
}

/* ── tiny shared illustration primitives ──────────────────────────────── */
function Cursor({ style }) {
  return (
    <svg className="fg-cursor" viewBox="0 0 24 24" style={style} aria-hidden="true">
      <path d="M5 3l14 7-6 1.6L9 18 5 3z" fill="#fff" stroke={C.ink} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}
function Pin({ color = C.sage, size = 30 }) {
  return <div className="fg-pin" style={{ background: color, width: size, height: size }}><span /></div>
}
function Lines({ rows = 3, w = ['100%', '85%', '60%'], color = '#E7E1D6', h = 7 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ height: h, width: w[i] || '70%', borderRadius: 100, background: color }} />
      ))}
    </div>
  )
}
function Frame({ children, style }) {
  return <div className="fg-card" style={{ padding: 16, ...style }}>{children}</div>
}

/* ============================================================
   ILLUSTRATION SCENES — fabricated examples, one per slide.
   The running example venue is "Wattle Lane Roastery, Daylesford VIC".
   ============================================================ */

/* —— Welcome —— */
function SceneWelcomeHome() {
  return (
    <Frame style={{ width: 320, padding: 0, overflow: 'hidden' }}>
      <div style={{ height: 54, background: 'linear-gradient(120deg,#dfeae5,#cdded7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Pin color={C.sage} />
      </div>
      <div style={{ padding: '12px 16px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-serif,Georgia)', fontSize: 15, color: C.ink }}>Wattle Lane Roastery</span>
          <span className="fg-pill" style={{ background: C.cream, color: C.sage, border: `1px solid ${C.line}` }}>Small Batch</span>
        </div>
        <p style={{ margin: '2px 0 12px', fontFamily: 'var(--font-sans,system-ui)', fontSize: 11, color: C.muted }}>Daylesford, VIC</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}`, padding: '10px 0' }}>
          {[['1.2k', 'Views'], ['340', 'Searches'], ['6', 'Trails'], ['58', 'Saves']].map(([n, l]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-serif,Georgia)', fontSize: 16, color: C.ink }}>{n}</div>
              <div style={{ fontSize: 8, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.muted, marginTop: 1 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  )
}
function SceneWelcomeBadge() {
  const items = ['My Listings', 'Listing Insights', 'Producer Picks', 'Suggested Trail']
  return (
    <div style={{ position: 'relative', width: 250, background: C.ink, borderRadius: 14, padding: '12px 0', boxShadow: '0 18px 40px -18px rgba(28,25,21,0.6)' }}>
      {items.map((label, i) => (
        <div key={label} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
          borderLeft: i === 2 ? `3px solid ${C.sage}` : '3px solid transparent',
          background: i === 2 ? 'rgba(255,255,255,0.06)' : 'transparent',
        }}>
          <div style={{ width: 14, height: 14, borderRadius: 4, background: 'rgba(255,255,255,0.18)' }} />
          <span style={{ fontFamily: 'var(--font-sans,system-ui)', fontSize: 12.5, color: i === 2 ? '#fff' : 'rgba(255,255,255,0.6)' }}>{label}</span>
          {i === 2 && <span className="fg-badge" style={{ marginLeft: 'auto' }} />}
        </div>
      ))}
      <Cursor style={{ right: 26, top: 92 }} />
    </div>
  )
}
function SceneWelcomeComplete() {
  const r = 46, circ = 2 * Math.PI * r
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ position: 'relative', width: 132, height: 132 }}>
        <svg width="132" height="132" viewBox="0 0 132 132">
          <circle cx="66" cy="66" r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="12" />
          <circle cx="66" cy="66" r={r} fill="none" stroke="#fff" strokeWidth="12" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={circ * 0.08} transform="rotate(-90 66 66)" />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: 'var(--font-serif,Georgia)', fontSize: 30, color: '#fff', lineHeight: 1 }}>92%</span>
          <span style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>Complete</span>
        </div>
      </div>
      <div className="fg-pill" style={{ background: 'rgba(255,255,255,0.16)', color: '#fff', fontSize: 10 }}>↑ from 38%</div>
    </div>
  )
}

/* —— My Listings —— */
function SceneListingCard() { return <SceneWelcomeHome /> }
function SceneListingEdit() {
  const fields = [['Venue name', 'Wattle Lane Roastery'], ['Opening hours', 'Wed–Sun · 8am–3pm'], ['Hero photo', '◇ uploaded']]
  return (
    <Frame style={{ width: 300, position: 'relative' }}>
      <p style={{ margin: '0 0 12px', fontFamily: 'var(--font-sans,system-ui)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.sage }}>Edit listing</p>
      {fields.map(([label, val]) => (
        <div key={label} style={{ marginBottom: 11 }}>
          <div style={{ fontSize: 9.5, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.muted, marginBottom: 4 }}>{label}</div>
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: '8px 10px', fontFamily: 'var(--font-sans,system-ui)', fontSize: 12, color: C.ink, background: C.cream }}>{val}</div>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
        <span style={{ background: C.ink, color: '#fff', fontFamily: 'var(--font-sans,system-ui)', fontSize: 11, fontWeight: 600, padding: '7px 16px', borderRadius: 8 }}>Save</span>
      </div>
      <Cursor style={{ right: 18, bottom: 12 }} />
    </Frame>
  )
}
function SceneListingComplete() {
  const checks = [['Description', true], ['Opening hours', true], ['Hero image', true], ['Website', true], ['Phone', false]]
  return (
    <Frame style={{ width: 290 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted }}>Listing completeness</span>
        <span style={{ fontFamily: 'var(--font-serif,Georgia)', fontSize: 14, color: C.sage }}>4/5</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: C.line, overflow: 'hidden', marginBottom: 14 }}>
        <div className="fg-bar" style={{ height: '100%', width: '80%', borderRadius: 3, transform: 'none' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {checks.map(([label, ok]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: ok ? '#16a34a' : '#dc2626', fontSize: 13, fontWeight: 700 }}>{ok ? '✓' : '✗'}</span>
            <span style={{ fontFamily: 'var(--font-sans,system-ui)', fontSize: 12, color: ok ? C.ink : '#9a8f86' }}>{label}</span>
          </div>
        ))}
      </div>
    </Frame>
  )
}

/* —— Your Description —— */
function SceneDescStory() {
  return (
    <Frame style={{ width: 320, position: 'relative', paddingTop: 20 }}>
      <span style={{ position: 'absolute', top: 0, left: 12, fontFamily: 'var(--font-serif,Georgia)', fontSize: 44, lineHeight: 1, color: C.sand }}>&ldquo;</span>
      <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-serif,Georgia)', fontSize: 14, lineHeight: 1.5, color: C.ink, fontStyle: 'italic' }}>
        We roast single-origin beans over a slow flame in a former goldfields cordial works, and pour them by the window.
      </p>
      <p style={{ margin: '10px 0 0', fontFamily: 'var(--font-sans,system-ui)', fontSize: 10.5, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.sage }}>Wattle Lane Roastery</p>
    </Frame>
  )
}
function SceneDescRewrite() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 300 }}>
      <Frame style={{ width: '100%', padding: 12, background: C.cream }}>
        <div style={{ fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.muted, marginBottom: 6 }}>Your notes</div>
        <p style={{ margin: 0, fontFamily: 'var(--font-sans,system-ui)', fontSize: 11.5, color: '#8a857d', lineHeight: 1.45 }}>good coffee, old building, open weekends, we roast our own</p>
      </Frame>
      <div style={{ color: C.sage, fontSize: 16 }}>↓</div>
      <Frame style={{ width: '100%', padding: 12 }}>
        <div style={{ fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.sage, marginBottom: 6 }}>Polished by the Atlas ✦</div>
        <p style={{ margin: 0, fontFamily: 'var(--font-serif,Georgia)', fontSize: 12, color: C.ink, lineHeight: 1.5, fontStyle: 'italic' }}>A weekend roastery in a heritage goldfields building, pouring small-batch single origin from beans roasted on site.</p>
      </Frame>
    </div>
  )
}
function SceneDescSearch() {
  return (
    <div style={{ width: 310, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 100, padding: '9px 14px', boxShadow: '0 8px 22px -12px rgba(28,25,21,0.4)' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
        <span style={{ fontFamily: 'var(--font-sans,system-ui)', fontSize: 12.5, color: C.ink }}>natural wine &amp; coffee daylesford</span>
      </div>
      <Frame style={{ width: '100%', padding: 12, border: `1.5px solid ${C.sage}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Pin color={C.sage} size={26} />
          <div>
            <div style={{ fontFamily: 'var(--font-serif,Georgia)', fontSize: 13, color: C.ink }}>Wattle Lane Roastery</div>
            <div style={{ fontSize: 10.5, color: C.sage }}>Top match · Daylesford</div>
          </div>
        </div>
      </Frame>
    </div>
  )
}

/* —— Listing Insights —— */
function SceneStatsChart() {
  return (
    <Frame style={{ width: 320 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted }}>Views · 30 days</span>
        <span style={{ fontFamily: 'var(--font-serif,Georgia)', fontSize: 20, color: C.ink }}>1,248 <span style={{ fontSize: 11, color: C.sage }}>↑ 24%</span></span>
      </div>
      <svg width="100%" height="96" viewBox="0 0 280 96" preserveAspectRatio="none">
        <defs>
          <linearGradient id="fgArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.sage} stopOpacity="0.35" />
            <stop offset="100%" stopColor={C.sage} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0,78 L40,70 L80,72 L120,52 L160,56 L200,34 L240,30 L280,12 L280,96 L0,96 Z" fill="url(#fgArea)" />
        <path d="M0,78 L40,70 L80,72 L120,52 L160,56 L200,34 L240,30 L280,12" fill="none" stroke={C.sage} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="280" cy="12" r="4" fill="#fff" stroke={C.sage} strokeWidth="2.5" />
      </svg>
    </Frame>
  )
}
function SceneStatsTerms() {
  const terms = [['natural wine daylesford', 86], ['weekend roastery', 64], ['coffee near hepburn', 47], ['where to brunch daylesford', 31]]
  const max = 86
  return (
    <Frame style={{ width: 320 }}>
      <p style={{ margin: '0 0 12px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted }}>Searches bringing you here</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {terms.map(([t, n]) => (
          <div key={t}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-sans,system-ui)', fontSize: 11.5, color: C.ink }}>{t}</span>
              <span style={{ fontFamily: 'var(--font-sans,system-ui)', fontSize: 11, color: C.muted }}>{n}</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: C.line, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(n / max) * 100}%`, borderRadius: 3, background: `linear-gradient(90deg,${C.sage},#4d7268)` }} />
            </div>
          </div>
        ))}
      </div>
    </Frame>
  )
}
function SceneStatsInsight() {
  return (
    <Frame style={{ width: 300, padding: 18 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(140deg,#FFF1D6,#F4DFAE)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2"><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3" /><circle cx="12" cy="12" r="3.2" fill={C.gold} stroke="none" /></svg>
        </div>
        <div>
          <p style={{ margin: 0, fontFamily: 'var(--font-serif,Georgia)', fontSize: 14, color: C.ink, lineHeight: 1.35 }}>Saturdays drive <b>3×</b> your weekday views.</p>
          <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-sans,system-ui)', fontSize: 11, color: C.muted, lineHeight: 1.45 }}>Worth highlighting your weekend hours and events.</p>
        </div>
      </div>
    </Frame>
  )
}

/* —— Producer Picks —— */
function PickRow({ name, kind, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', border: `1px solid ${C.line}`, borderRadius: 10, background: '#fff' }}>
      <Pin color={color} size={24} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-serif,Georgia)', fontSize: 12.5, color: C.ink }}>{name}</div>
        <div style={{ fontSize: 10, color: C.muted }}>{kind}</div>
      </div>
      <span style={{ color: C.gold, fontSize: 13 }}>★</span>
    </div>
  )
}
function ScenePicksCards() {
  return (
    <div style={{ width: 310 }}>
      <p style={{ margin: '0 0 10px', fontFamily: 'var(--font-sans,system-ui)', fontSize: 10.5, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#fff' }}>Wattle Lane recommends</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <PickRow name="Goldfields Sourdough" kind="Bakery · 200m away" color={C.gold} />
        <PickRow name="Hepburn Bottle Shop" kind="Natural wine · 1.2km" color="#8a5a8e" />
      </div>
    </div>
  )
}
function ScenePicksAdd() {
  return (
    <Frame style={{ width: 310 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${C.line}`, borderRadius: 100, padding: '8px 12px', marginBottom: 10 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
        <span style={{ fontFamily: 'var(--font-sans,system-ui)', fontSize: 12, color: C.ink }}>goldfields sourdough</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: C.cream, marginBottom: 10 }}>
        <Pin color={C.gold} size={22} />
        <span style={{ fontFamily: 'var(--font-serif,Georgia)', fontSize: 12, color: C.ink }}>Goldfields Sourdough</span>
        <span style={{ marginLeft: 'auto', color: C.sage, fontSize: 14 }}>✓</span>
      </div>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: '8px 10px' }}>
        <span style={{ fontFamily: 'var(--font-sans,system-ui)', fontSize: 11, color: '#8a857d', fontStyle: 'italic' }}>&ldquo;The loaf we serve with our weekend brunch.&rdquo;</span>
      </div>
    </Frame>
  )
}
function ScenePicksPublic() {
  return (
    <Frame style={{ width: 300, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(140deg,#7BA89B,#4d7268)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'var(--font-serif,Georgia)', fontSize: 13 }}>W</div>
        <div>
          <div style={{ fontFamily: 'var(--font-serif,Georgia)', fontSize: 12.5, color: C.ink }}>Recommended by the maker</div>
          <div style={{ fontSize: 10, color: C.muted }}>Wattle Lane Roastery</div>
        </div>
      </div>
      <PickRow name="Goldfields Sourdough" kind="Bakery · loved by the locals" color={C.gold} />
    </Frame>
  )
}

/* —— Suggested Trail —— */
function SceneTrailMap() {
  return (
    <Frame style={{ width: 320, padding: 0, overflow: 'hidden' }}>
      <div style={{ position: 'relative', height: 168, background: 'linear-gradient(150deg,#e7efe9,#d5e3dc)' }}>
        <svg width="100%" height="100%" viewBox="0 0 320 168" style={{ position: 'absolute', inset: 0 }}>
          <path d="M48,128 C100,120 90,70 150,72 C210,74 200,40 268,44" fill="none" stroke={C.sage} strokeWidth="2.5" strokeDasharray="2 7" strokeLinecap="round" />
        </svg>
        {[[48, 128, '1'], [150, 72, '2'], [268, 44, '3']].map(([x, y, n]) => (
          <div key={n} style={{ position: 'absolute', left: x - 13, top: y - 26 }}>
            <div style={{ width: 26, height: 26, borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)', background: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px -5px rgba(28,25,21,0.5)' }}>
              <span style={{ transform: 'rotate(45deg)', color: '#fff', fontFamily: 'var(--font-sans,system-ui)', fontSize: 11, fontWeight: 700 }}>{n}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: '10px 14px' }}>
        <div style={{ fontFamily: 'var(--font-serif,Georgia)', fontSize: 13, color: C.ink }}>A Slow Morning in Daylesford</div>
        <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>3 stops · starts at Wattle Lane</div>
      </div>
    </Frame>
  )
}
function SceneTrailBuild() {
  const stops = ['Coffee at Wattle Lane', 'Loaf from Goldfields Sourdough', 'Wine at Hepburn Bottle Shop']
  return (
    <Frame style={{ width: 300 }}>
      <p style={{ margin: '0 0 12px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.sage }}>Build your trail</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {stops.map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: `1px solid ${C.line}`, borderRadius: 8, background: C.cream }}>
            <span style={{ width: 18, height: 18, borderRadius: '50%', background: C.ink, color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
            <span style={{ fontFamily: 'var(--font-sans,system-ui)', fontSize: 11.5, color: C.ink }}>{s}</span>
            <span style={{ marginLeft: 'auto', color: '#cfc8bb', letterSpacing: 1 }}>⋮⋮</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: `1px dashed ${C.line}`, borderRadius: 8, color: C.sage, fontFamily: 'var(--font-sans,system-ui)', fontSize: 11.5 }}>+ Add a stop within 100km</div>
      </div>
    </Frame>
  )
}
function SceneTrailCard() {
  return (
    <Frame style={{ width: 300, padding: 0, overflow: 'hidden' }}>
      <div style={{ height: 96, background: 'linear-gradient(140deg,#7BA89B,#C4973B)', position: 'relative' }}>
        <span className="fg-pill" style={{ position: 'absolute', top: 10, left: 12, background: 'rgba(255,255,255,0.92)', color: C.ink }}>Operator trail</span>
      </div>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ fontFamily: 'var(--font-serif,Georgia)', fontSize: 15, color: C.ink }}>A Slow Morning in Daylesford</div>
        <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-sans,system-ui)', fontSize: 11, color: C.muted, lineHeight: 1.45 }}>Curated by Wattle Lane Roastery · 3 stops · half a day</p>
      </div>
    </Frame>
  )
}

/* —— Editorial —— */
function SceneEditorialArticle() {
  return (
    <Frame style={{ width: 300, padding: 0, overflow: 'hidden' }}>
      <div style={{ height: 104, background: 'linear-gradient(140deg,#4A443C,#2D2A26)', display: 'flex', alignItems: 'flex-end', padding: 12 }}>
        <span className="fg-pill" style={{ background: C.gold, color: '#fff' }}>The Journal</span>
      </div>
      <div style={{ padding: '14px 16px' }}>
        <div style={{ fontFamily: 'var(--font-serif,Georgia)', fontSize: 16, color: C.ink, lineHeight: 1.25 }}>The roastery keeping a goldfields ritual alive</div>
        <div style={{ fontSize: 10, color: C.muted, marginTop: 8 }}>Field notes · Daylesford</div>
      </div>
    </Frame>
  )
}
function SceneEditorialPitch() {
  return (
    <Frame style={{ width: 300, position: 'relative' }}>
      <p style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.sage }}>Pitch a story</p>
      <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: C.muted, marginBottom: 4 }}>Your angle</div>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: '8px 10px', minHeight: 46, marginBottom: 10 }}>
        <span style={{ fontFamily: 'var(--font-sans,system-ui)', fontSize: 11.5, color: C.ink, lineHeight: 1.45 }}>We&rsquo;ve revived a 1890s cordial recipe as a winter spiced filter…</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 40, height: 40, borderRadius: 8, background: 'linear-gradient(140deg,#dfeae5,#cdded7)' }} />
        <span style={{ fontSize: 10.5, color: C.muted }}>1 photo attached</span>
        <span style={{ marginLeft: 'auto', background: C.ink, color: '#fff', fontSize: 11, fontWeight: 600, padding: '7px 14px', borderRadius: 8 }}>Send pitch</span>
      </div>
      <Cursor style={{ right: 16, bottom: 12 }} />
    </Frame>
  )
}
function SceneEditorialFeatured() {
  return (
    <Frame style={{ width: 290, padding: 0, overflow: 'hidden' }}>
      <div style={{ height: 84, background: 'linear-gradient(140deg,#dfeae5,#cdded7)', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 12, right: -34, transform: 'rotate(45deg)', background: C.gold, color: '#fff', fontFamily: 'var(--font-sans,system-ui)', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', padding: '4px 40px' }}>FEATURED</div>
      </div>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ fontFamily: 'var(--font-serif,Georgia)', fontSize: 14, color: C.ink }}>Wattle Lane Roastery</div>
        <div style={{ fontSize: 10.5, color: C.sage, marginTop: 4 }}>As seen in the Atlas Journal</div>
      </div>
    </Frame>
  )
}

/* —— Recommend a Listing —— */
function SceneRecAdd() {
  return (
    <Frame style={{ width: 290 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '8px 0' }}>
        <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(140deg,#7BA89B,#4d7268)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </div>
        <div style={{ fontFamily: 'var(--font-serif,Georgia)', fontSize: 14, color: C.ink }}>Recommend a venue</div>
        <div style={{ width: '100%', border: `1px solid ${C.line}`, borderRadius: 8, padding: '8px 10px', fontFamily: 'var(--font-sans,system-ui)', fontSize: 12, color: C.muted, background: C.cream }}>Mill Markets Provedore</div>
      </div>
    </Frame>
  )
}
function SceneRecFlow() {
  const steps = [['Suggest', C.sage], ['We review', C.gold], ['Goes live', C.ink]]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {steps.map(([label, color], i) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'var(--font-serif,Georgia)', fontSize: 15 }}>{i + 1}</div>
            <span style={{ fontFamily: 'var(--font-sans,system-ui)', fontSize: 10.5, color: '#fff', fontWeight: 600 }}>{label}</span>
          </div>
          {i < 2 && <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16, marginBottom: 18 }}>→</span>}
        </div>
      ))}
    </div>
  )
}
function SceneRecNetwork() {
  const nodes = [[40, 40], [150, 26], [120, 96], [228, 56], [200, 118], [60, 110]]
  return (
    <svg width="270" height="150" viewBox="0 0 270 150">
      {[[0, 2], [1, 2], [2, 3], [2, 4], [2, 5], [1, 3]].map(([a, b], i) => (
        <line key={i} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
      ))}
      {nodes.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === 2 ? 13 : 8} fill={i === 2 ? '#fff' : 'rgba(255,255,255,0.65)'} stroke={i === 2 ? C.gold : 'none'} strokeWidth="3" />
      ))}
    </svg>
  )
}

/* —— Subscription —— */
function SceneSubPlan() {
  return (
    <Frame style={{ width: 290 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.muted }}>Your plan</div>
          <div style={{ fontFamily: 'var(--font-serif,Georgia)', fontSize: 20, color: C.ink, marginTop: 4 }}>Standard</div>
        </div>
        <span className="fg-pill" style={{ background: '#e7f3ee', color: '#2f7a5e' }}>Active</span>
      </div>
      <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 12, paddingTop: 12, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-serif,Georgia)', fontSize: 16, color: C.ink }}>A$295<span style={{ fontSize: 11, color: C.muted }}>/yr</span></span>
        <span style={{ fontSize: 11, color: C.muted, alignSelf: 'center' }}>Renews 14 May 2027</span>
      </div>
    </Frame>
  )
}
function SceneSubUnlock() {
  const feats = ['Full listing editing', 'Photos & hero image', 'Listing insights', 'Producer picks & trails', 'Journal pitches']
  return (
    <Frame style={{ width: 280 }}>
      <p style={{ margin: '0 0 12px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.sage }}>Standard unlocks</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {feats.map((f) => (
          <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ width: 17, height: 17, borderRadius: '50%', background: '#e7f3ee', color: '#2f7a5e', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>
            <span style={{ fontFamily: 'var(--font-sans,system-ui)', fontSize: 12, color: C.ink }}>{f}</span>
          </div>
        ))}
      </div>
    </Frame>
  )
}
function SceneSubPortal() {
  return (
    <Frame style={{ width: 290 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 44, height: 30, borderRadius: 6, background: 'linear-gradient(140deg,#4A443C,#2D2A26)', display: 'flex', alignItems: 'flex-end', padding: 4 }}>
          <div style={{ width: 16, height: 4, borderRadius: 2, background: C.gold }} />
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-sans,system-ui)', fontSize: 12, color: C.ink }}>•••• 4242</div>
          <div style={{ fontSize: 10, color: C.muted }}>Visa · on file</div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', background: C.ink, color: '#fff', fontFamily: 'var(--font-sans,system-ui)', fontSize: 11.5, fontWeight: 600, padding: '9px 0', borderRadius: 8 }}>Manage billing · Stripe</div>
    </Frame>
  )
}

/* ============================================================
   GUIDE CONTENT — keyed by the nav href the operator lands on.
   theme = the hero gradient; each slide = { scene, eyebrow, title, body, why? }.
   ============================================================ */
export const FEATURE_GUIDES = {
  '/dashboard': {
    theme: 'linear-gradient(140deg,#6f9a8e 0%,#3f6258 55%,#2d3f39 100%)',
    eyebrow: 'Your dashboard',
    slides: [
      { scene: SceneWelcomeHome, title: 'Welcome to your operator dashboard', body: 'Everything you need to run your listing on the Atlas — your details, your reach, and the tools that put you in front of the right travellers.' },
      { scene: SceneWelcomeBadge, title: 'Look for the amber dot', body: "When a tool has a glowing dot beside it, it's something you haven't explored yet. Open it and we'll show you exactly how it works." },
      { scene: SceneWelcomeComplete, title: 'A richer listing gets found', body: 'Complete profiles earn far more attention. Start with your story and a photo — the rest follows.', why: 'Listings with a description, hours and a photo are seen up to <b>3× more</b>.' },
    ],
  },
  '/dashboard/listings': {
    theme: 'linear-gradient(140deg,#7BA89B,#4d7268)',
    eyebrow: 'My Listings',
    slides: [
      { scene: SceneListingCard, title: 'Your listing, at a glance', body: 'See every venue you manage in one place — its map pin, live stats, and how complete its profile is.' },
      { scene: SceneListingEdit, title: 'Edit every detail in one place', body: 'Hours, photos, contact, story — tap Edit and change anything. Updates flow across the Atlas Network within the hour.' },
      { scene: SceneListingComplete, title: 'Complete profiles win', body: 'Fill the gaps and watch your completeness climb.', why: 'Listings with opening hours get seen <b>40% more</b> than those without.' },
    ],
  },
  '/dashboard/description': {
    theme: 'linear-gradient(140deg,#E8C27A,#C4973B)',
    eyebrow: 'Your Description',
    slides: [
      { scene: SceneDescStory, title: 'Tell travellers your story', body: 'Your description is the first thing a visitor reads. A few warm, specific lines turn a name on a map into a place worth the drive.' },
      { scene: SceneDescRewrite, title: "We'll help you write it", body: 'Stuck on words? Our writer shapes your rough notes into Atlas-house prose — you stay in control and approve every line.' },
      { scene: SceneDescSearch, title: 'Words that get you found', body: 'Your description feeds Atlas search.', why: 'The richer and truer it is, the more often <b>the right travellers</b> land on you.' },
    ],
  },
  '/dashboard/analytics': {
    theme: 'linear-gradient(140deg,#3C5A66,#233740)',
    eyebrow: 'Listing Insights',
    slides: [
      { scene: SceneStatsChart, title: "See who's finding you", body: 'Track views, searches and saves over the last 30 days — real signals of how travellers discover your venue.' },
      { scene: SceneStatsTerms, title: 'Know which searches surface you', body: "See the exact terms bringing people to your door — from 'natural wine daylesford' to 'where to brunch'." },
      { scene: SceneStatsInsight, title: 'Turn numbers into decisions', body: 'Spot what works and lean into it.', why: 'Insight into real traveller demand you <b>can’t get anywhere else</b>.' },
    ],
  },
  '/dashboard/picks': {
    theme: 'linear-gradient(140deg,#D9A24C,#B07C2A)',
    eyebrow: 'Producer Picks',
    slides: [
      { scene: ScenePicksCards, title: 'Recommend the places you love', body: 'Share the neighbours, makers and spots you genuinely rate. Your picks appear on your public profile as trusted local knowledge.' },
      { scene: ScenePicksAdd, title: 'Adding a pick takes a minute', body: 'Search the Atlas, choose a venue, and add a line on why you love it. That’s it.' },
      { scene: ScenePicksPublic, title: 'Local cred that builds trust', body: 'Travellers trust a real operator’s word over any algorithm.', why: 'Picks make you a <b>guide</b>, not just a stop on the map.' },
    ],
  },
  '/dashboard/trail': {
    theme: 'linear-gradient(140deg,#6f9a8e,#C4973B)',
    eyebrow: 'Suggested Trail',
    slides: [
      { scene: SceneTrailMap, title: 'Craft a day around your door', body: 'Design a day-trip with your venue at its heart — the perfect morning, the detour worth taking, the spot to end the day.' },
      { scene: SceneTrailBuild, title: 'Build it in minutes', body: 'Pick nearby gems within 100km, order the stops, add a sentence to each. We render it as a beautiful trail.' },
      { scene: SceneTrailCard, title: 'Turn a visit into a whole day', body: 'A great trail keeps travellers in your area longer.', why: 'And your venue is <b>where the day begins</b>.' },
    ],
  },
  '/dashboard/editorial': {
    theme: 'linear-gradient(140deg,#4A443C,#2D2A26)',
    eyebrow: 'Editorial',
    slides: [
      { scene: SceneEditorialArticle, title: 'Pitch your story to the Journal', body: 'A new season, a collaboration, a story worth telling? Pitch it for the Atlas Journal, read by travellers who care.' },
      { scene: SceneEditorialPitch, title: 'What makes a great pitch', body: 'A clear hook, a fresh angle, and a good photo. We do the writing — you bring the story.' },
      { scene: SceneEditorialFeatured, title: 'Editorial puts you on the map', body: 'A feature sends engaged readers straight to your listing.', why: 'Editorial coverage is attention that <b>money can’t buy</b>.' },
    ],
  },
  '/dashboard/recommend': {
    theme: 'linear-gradient(140deg,#7BA89B,#557F73)',
    eyebrow: 'Recommend a Listing',
    slides: [
      { scene: SceneRecAdd, title: 'Know a place that belongs here?', body: 'Spotted a maker or venue missing from the Atlas? Put them forward — we curate every nomination by hand.' },
      { scene: SceneRecFlow, title: 'How a recommendation works', body: 'Tell us the name and where to find them. It becomes a candidate our team reviews and, if it fits, adds to the network.' },
      { scene: SceneRecNetwork, title: 'A stronger network lifts everyone', body: 'The richer the Atlas, the more travellers it draws.', why: 'A bigger, better network means <b>more eyes find you</b>, too.' },
    ],
  },
  '/dashboard/subscription': {
    theme: 'linear-gradient(140deg,#E8C27A,#B07C2A)',
    eyebrow: 'Subscription',
    slides: [
      { scene: SceneSubPlan, title: 'Your plan & billing', body: 'See your current plan, renewal date and invoices — all in one calm place.' },
      { scene: SceneSubUnlock, title: 'What Standard unlocks', body: 'Full editing, photos, insights, picks, trails and Journal pitches — everything that makes a listing truly work.' },
      { scene: SceneSubPortal, title: 'Manage anytime, no friction', body: 'Update your card or download receipts through our secure Stripe portal whenever you need.' },
    ],
  },
}

export const FEATURE_GUIDE_KEYS = new Set(Object.keys(FEATURE_GUIDES))
export function hasGuide(href) { return FEATURE_GUIDE_KEYS.has(href) }

/* ── The pulsing "!" badge for unseen tools ───────────────────────────── */
export function FeatureBadge() {
  return <span className="fg-badge" aria-label="New — not opened yet" title="New — take a quick tour" />
}

/* ── The three-slide walkthrough modal ────────────────────────────────── */
export function FeatureGuideModal({ guideKey, onClose }) {
  const guide = FEATURE_GUIDES[guideKey]
  const [i, setI] = useState(0)

  // Reset to the first slide whenever a different guide opens.
  useEffect(() => { setI(0) }, [guideKey])

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const close = useCallback(() => onClose && onClose(), [onClose])

  // Esc closes; arrows move between slides.
  useEffect(() => {
    if (!guide) return
    const onKey = (e) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') setI((v) => Math.min(v + 1, guide.slides.length - 1))
      else if (e.key === 'ArrowLeft') setI((v) => Math.max(v - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [guide, close])

  if (!guide) return null

  const slides = guide.slides
  const slide = slides[i]
  const Scene = slide.scene
  const last = i === slides.length - 1

  return (
    <div className="fg-overlay" role="dialog" aria-modal="true" aria-labelledby="fg-title" onClick={close}>
      <div className="fg-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="fg-close" onClick={close} aria-label="Close walkthrough">&times;</button>

        <div className="fg-hero">
          <div className="fg-hero-glow" style={{ background: guide.theme }} />
          {/* key re-mounts the stage so each slide's illustration animates in */}
          <div className="fg-stage" key={i}><Scene /></div>
        </div>

        <div className="fg-body">
          <p className="fg-eyebrow">{guide.eyebrow}</p>
          <h2 id="fg-title" className="fg-title" key={`t${i}`}>{slide.title}</h2>
          <p className="fg-text" key={`b${i}`}>{slide.body}</p>
          {slide.why && (
            <div className="fg-why" key={`w${i}`}>
              <span className="fg-why-spark" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 5.6L19.5 9l-4.5 3.3L16.6 18 12 14.7 7.4 18l1.6-5.7L4.5 9l5.6-1.4z" /></svg>
              </span>
              <p dangerouslySetInnerHTML={{ __html: `<b>Why it matters.</b> ${slide.why}` }} />
            </div>
          )}
        </div>

        <div className="fg-foot">
          <div className="fg-dots" aria-hidden="true">
            {slides.map((_, d) => <span key={d} className={`fg-dot${d === i ? ' fg-dot-active' : ''}`} />)}
          </div>
          <div className="fg-actions">
            {i > 0 && <button type="button" className="fg-btn fg-btn-ghost" onClick={() => setI(i - 1)}>Back</button>}
            {last
              ? <button type="button" className="fg-btn fg-btn-primary" onClick={close}>Got it</button>
              : <button type="button" className="fg-btn fg-btn-primary" onClick={() => setI(i + 1)}>Next</button>}
          </div>
        </div>
      </div>
    </div>
  )
}
