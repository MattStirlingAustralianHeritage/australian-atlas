'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Card, PageHeader, SectionTitle, EmptyState, Pill, SkeletonPage,
  MicroLabel, verticalName,
} from '@/components/press/ui'

// Find a story — the Atlas's semantic search, pointed at story-hunting.
// Describe the story you're after in plain words; the same retrieval that
// powers the public search (embeddings + reranking + vibe expansion) finds
// the places that ARE that story, split into your regions vs the wider
// network, each with computed hooks (anniversaries, heritage, new listings,
// upcoming events, reachable owners).

const EXAMPLE_HUNTS = [
  'a business run by the same family for generations',
  'makers keeping a rare craft alive',
  'regenerative or organic farming',
  'a brewery in a heritage building',
  'city careers traded for a country venture',
  'chocolate makers doing bean to bar',
]

const HOOK_COLORS = {
  anniversary: 'var(--color-gold)',
  founded: 'var(--color-muted)',
  heritage: 'var(--color-gold)',
  new: 'var(--color-sage-dark)',
  event: 'var(--color-sage-dark)',
  pick: 'var(--color-gold)',
  reachable: 'var(--color-sage-dark)',
}

function HookChip({ hook }) {
  const color = HOOK_COLORS[hook.kind] || 'var(--color-muted)'
  const inner = (
    <span style={{
      display: 'inline-block', fontFamily: 'var(--font-body)', fontSize: '0.66rem',
      fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
      color, border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
      borderRadius: 999, padding: '0.14rem 0.55rem', marginRight: 6, marginTop: 6,
    }}>
      {hook.label}
    </span>
  )
  if (hook.kind === 'event' && hook.slug) {
    return <Link href={`/events/${hook.slug}`} target="_blank" style={{ textDecoration: 'none' }}>{inner}</Link>
  }
  return inner
}

function ResultRow({ r }) {
  const where = [r.suburb, r.regionName].filter(Boolean).join(' · ')
  const intro = `Interview / introduction: ${r.name}${r.suburb ? ` (${r.suburb})` : ''}`
  return (
    <div style={{ padding: '0.9rem 0', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--color-ink)', margin: 0, lineHeight: 1.3 }}>
          <Link href={`/place/${r.slug}`} target="_blank" style={{ color: 'inherit', textDecoration: 'none' }}>
            {r.name}
          </Link>
          {r.strong && (
            <span style={{
              marginLeft: 8, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.07em',
              textTransform: 'uppercase', color: '#fff', background: 'var(--color-sage)',
              borderRadius: 999, padding: '0.14rem 0.5rem', verticalAlign: 'middle',
            }}>
              Strong match
            </span>
          )}
        </p>
        <Link
          href={`/newsroom/requests?type=interview&subject=${encodeURIComponent(intro)}`}
          style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', fontWeight: 600, color: 'var(--color-sage-dark)', textDecoration: 'none', flexShrink: 0 }}
        >
          Request an intro →
        </Link>
      </div>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--color-muted)', margin: '2px 0 0' }}>
        {verticalName(r.vertical)}{r.sub_type ? ` · ${r.sub_type}` : ''}{where ? ` · ${where}` : ''}
      </p>
      {r.description && (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: 'var(--color-ink)', lineHeight: 1.55, margin: '0.4rem 0 0' }}>
          {r.description}{r.description.length >= 320 ? '…' : ''}
        </p>
      )}
      {r.hooks?.length > 0 && (
        <div style={{ marginTop: 2 }}>
          {r.hooks.map((h, i) => <HookChip key={i} hook={h} />)}
        </div>
      )}
    </div>
  )
}

export default function PressFindPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlQ = searchParams.get('q') || ''

  const [input, setInput] = useState(urlQ)
  const [data, setData] = useState(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const lastRun = useRef('')

  async function run(query) {
    const q = (query || '').trim()
    if (!q || q === lastRun.current) return
    lastRun.current = q
    setSearching(true)
    setError('')
    try {
      const res = await fetch(`/api/press/search?q=${encodeURIComponent(q)}&scope=all`)
      if (res.ok) {
        setData(await res.json())
      } else if (res.status === 429) {
        setError('Easy on — a few too many searches at once. Give it a minute.')
      } else {
        setError('Search hiccuped — try again.')
      }
    } catch {
      setError('Search hiccuped — try again.')
    } finally {
      setSearching(false)
    }
  }

  // Deep link: /newsroom/find?q=... (the newsdesk search box lands here).
  useEffect(() => {
    if (urlQ) {
      setInput(urlQ)
      run(urlQ)
    }
  }, [urlQ])

  function submit(e) {
    e.preventDefault()
    const q = input.trim()
    if (!q) return
    router.replace(`/newsroom/find?q=${encodeURIComponent(q)}`, { scroll: false })
    run(q)
  }

  function runExample(q) {
    setInput(q)
    router.replace(`/newsroom/find?q=${encodeURIComponent(q)}`, { scroll: false })
    run(q)
  }

  return (
    <div>
      <PageHeader
        title="Find a story"
        subtitle="Describe the story you're hunting in plain words — our semantic search reads for meaning, not keywords, across every listed independent in the country."
      />

      <Card style={{ padding: '1.3rem 1.4rem', marginBottom: '1.2rem' }}>
        <form onSubmit={submit} style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="e.g. a bakery run by the same family for generations"
            style={{
              flex: 1, minWidth: 260, padding: '0.7rem 0.9rem', borderRadius: 10,
              border: '1px solid var(--color-border)', fontFamily: 'var(--font-body)',
              fontSize: '0.95rem', color: 'var(--color-ink)', background: 'var(--color-card-bg)',
              outline: 'none', boxSizing: 'border-box',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--color-sage)'}
            onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
          />
          <button
            type="submit"
            disabled={searching || !input.trim()}
            style={{
              fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 600,
              background: 'var(--color-ink)', color: 'var(--color-cream)', border: 'none',
              borderRadius: 10, padding: '0.7rem 1.5rem', cursor: searching ? 'wait' : 'pointer',
              opacity: searching || !input.trim() ? 0.6 : 1,
            }}
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>
        <div style={{ marginTop: '0.8rem', display: 'flex', flexWrap: 'wrap', gap: '0.45rem', alignItems: 'baseline' }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.74rem', color: 'var(--color-muted)' }}>Try a hunt:</span>
          {EXAMPLE_HUNTS.map(x => (
            <button
              key={x}
              type="button"
              onClick={() => runExample(x)}
              style={{
                fontFamily: 'var(--font-body)', fontSize: '0.76rem', fontWeight: 500, cursor: 'pointer',
                color: 'var(--color-sage-dark)', background: 'transparent',
                border: '1px solid rgba(95,138,126,0.35)', borderRadius: 999, padding: '0.24rem 0.7rem',
              }}
            >
              {x}
            </button>
          ))}
        </div>
      </Card>

      {error && (
        <Card style={{ padding: '0.9rem 1.2rem', marginBottom: '1.2rem', border: '1px solid rgba(196,96,58,0.35)' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-accent)', margin: 0 }}>{error}</p>
        </Card>
      )}

      {searching && !data && <SkeletonPage />}

      {data && !searching && (
        <>
          {data.inRegions.length === 0 && data.beyond.length === 0 ? (
            <Card style={{ padding: '1.5rem' }}>
              <EmptyState title="Nothing close enough to that yet">
                Try describing the story a different way — or broaden it. The search reads meaning,
                so &ldquo;makers who rescue old timber&rdquo; works better than a single keyword.
              </EmptyState>
            </Card>
          ) : (
            <>
              {data.inRegions.length > 0 && (
                <div style={{ marginBottom: '1.6rem' }}>
                  <SectionTitle note={data.reranked ? 'ranked by how well each place answers the brief' : null}>
                    In your regions
                  </SectionTitle>
                  <Card style={{ padding: '0.3rem 1.3rem' }}>
                    {data.inRegions.map(r => <ResultRow key={r.id} r={r} />)}
                  </Card>
                </div>
              )}
              {data.beyond.length > 0 && (
                <div style={{ marginBottom: '1.6rem' }}>
                  <SectionTitle note={data.followedCount === 0 ? 'follow regions and your patch leads the results' : 'strong matches from outside your followed regions'}>
                    {data.inRegions.length ? 'Beyond your regions' : 'Across the network'}
                  </SectionTitle>
                  <Card style={{ padding: '0.3rem 1.3rem' }}>
                    {data.beyond.map(r => <ResultRow key={r.id} r={r} />)}
                  </Card>
                </div>
              )}
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--color-muted)', lineHeight: 1.6 }}>
                {data.expanded ? 'The search broadened your phrasing into venue vocabulary to find these. ' : ''}
                Hooks are computed from live listing data — check before you print. Need a fact-check,
                background or an owner introduction? <Link href="/newsroom/requests" style={{ color: 'var(--color-sage-dark)' }}>Ask the desk</Link>.
              </p>
            </>
          )}
        </>
      )}

      {!data && !searching && (
        <div style={{ marginTop: '0.4rem' }}>
          <MicroLabel>How journalists use it</MicroLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
            {[
              ['The colour piece', '“a pub with its own brewery in a gold-rush town” — find the place that carries the whole feature.'],
              ['The trend story', '“zero-waste refill grocers” — see how many there are, where they cluster, who to call first.'],
              ['The deadline save', '“chocolate makers near Margaret River” — a credible local voice, found in thirty seconds.'],
            ].map(([title, body]) => (
              <Card key={title} style={{ padding: '1rem 1.15rem' }}>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: '0.98rem', color: 'var(--color-ink)', margin: '0 0 0.3rem' }}>{title}</p>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-muted)', lineHeight: 1.55, margin: 0 }}>{body}</p>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
