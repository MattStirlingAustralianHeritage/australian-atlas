'use client'

import { useState } from 'react'

const TEST_CASES = [
  {
    label: 'Adelaide Hills — food + slow, steady, 3 days',
    body: {
      intent: ['food-and-producers', 'quiet-and-slow'],
      pacing: 'steady',
      duration: 3,
      region: 'Adelaide Hills',
      season: 'next-month',
      anchor: null,
    },
  },
  {
    label: 'Cradle Country — landscape, out-early, 5 days',
    body: {
      intent: ['landscape-and-walking'],
      pacing: 'out-early-back-late',
      duration: 5,
      region: 'Cradle Country',
      season: null,
      anchor: null,
    },
  },
  {
    label: 'Margaret River — everything, steady, 4 days',
    body: {
      intent: ['a-bit-of-everything'],
      pacing: 'steady',
      duration: 4,
      region: 'Margaret River',
      season: null,
      anchor: null,
    },
  },
]

export default function TestRetrievePage() {
  const [results, setResults] = useState({})
  const [loading, setLoading] = useState({})

  async function runTest(idx) {
    setLoading(prev => ({ ...prev, [idx]: true }))
    setResults(prev => ({ ...prev, [idx]: null }))

    try {
      const res = await fetch('/api/plan-a-stay/retrieve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(TEST_CASES[idx].body),
      })
      const data = await res.json()
      setResults(prev => ({ ...prev, [idx]: { status: res.status, data } }))
    } catch (err) {
      setResults(prev => ({ ...prev, [idx]: { status: 0, error: err.message } }))
    } finally {
      setLoading(prev => ({ ...prev, [idx]: false }))
    }
  }

  return (
    <div style={{
      maxWidth: 960,
      margin: '0 auto',
      padding: '48px 24px',
      fontFamily: 'var(--font-body)',
    }}>
      <h1 style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 400,
        fontSize: 28,
        marginBottom: 8,
      }}>
        Retrieval API Test Harness
      </h1>
      <p style={{ color: 'var(--color-muted)', fontSize: 14, marginBottom: 32 }}>
        Development only. Posts to <code>/api/plan-a-stay/retrieve</code> and renders raw JSON.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 32 }}>
        {TEST_CASES.map((tc, idx) => (
          <button
            key={idx}
            onClick={() => runTest(idx)}
            disabled={loading[idx]}
            style={{
              padding: '10px 18px',
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              fontWeight: 500,
              background: loading[idx] ? 'var(--color-muted)' : 'var(--color-ink)',
              color: '#FAF8F4',
              border: 'none',
              borderRadius: 6,
              cursor: loading[idx] ? 'wait' : 'pointer',
              opacity: loading[idx] ? 0.6 : 1,
            }}
          >
            {loading[idx] ? 'Loading...' : tc.label}
          </button>
        ))}
      </div>

      {TEST_CASES.map((tc, idx) => {
        const result = results[idx]
        if (!result) return null

        return (
          <div key={idx} style={{ marginBottom: 40 }}>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              fontSize: 20,
              marginBottom: 4,
            }}>
              {tc.label}
            </h2>
            <p style={{
              fontSize: 12,
              color: result.status === 200 ? '#2d7a3a' : '#a03030',
              marginBottom: 8,
            }}>
              Status: {result.status}
            </p>

            {result.data && (
              <>
                {/* Coverage summary */}
                {result.data.coverage && (
                  <div style={{
                    background: 'rgba(28,26,23,0.03)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    padding: '12px 16px',
                    marginBottom: 12,
                    fontSize: 13,
                    lineHeight: 1.6,
                  }}>
                    <strong>Coverage:</strong>{' '}
                    {result.data.coverage.clusters_found}/{result.data.coverage.clusters_requested} clusters,{' '}
                    intent match {Math.round(result.data.coverage.intent_match_rate * 100)}%,{' '}
                    constraint: {result.data.coverage.binding_constraint}
                    {result.data.coverage.fallbacks_used.length > 0 && (
                      <>, fallbacks: [{result.data.coverage.fallbacks_used.join(', ')}]</>
                    )}
                  </div>
                )}

                {/* Cluster summary cards */}
                {result.data.clusters && result.data.clusters.map(cluster => (
                  <div key={cluster.cluster_index} style={{
                    background: 'rgba(28,26,23,0.02)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    padding: '12px 16px',
                    marginBottom: 8,
                    fontSize: 13,
                  }}>
                    <strong>Cluster {cluster.cluster_index}</strong>{' '}
                    <span style={{ color: 'var(--color-muted)' }}>
                      ({cluster.candidate_count} candidates, {cluster.dist_from_trip_center_km}km from centre)
                    </span>
                    <div style={{ marginTop: 6 }}>
                      {cluster.candidates.map((c, i) => (
                        <div key={c.id} style={{ padding: '2px 0', color: i < 3 ? 'inherit' : 'var(--color-muted)' }}>
                          {i + 1}. <strong>{c.name}</strong>{' '}
                          <span style={{ opacity: 0.6 }}>
                            [{c.vertical}{c.sub_type ? `/${c.sub_type}` : ''}] score={c.score} {c.dist_from_centroid_km}km
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Raw JSON */}
                <details style={{ marginTop: 12 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--color-muted)' }}>
                    Raw JSON
                  </summary>
                  <pre style={{
                    fontSize: 11,
                    lineHeight: 1.5,
                    color: 'var(--color-muted)',
                    background: 'rgba(28,26,23,0.03)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    padding: '16px',
                    marginTop: 8,
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: 500,
                    overflow: 'auto',
                  }}>
                    {JSON.stringify(result.data, null, 2)}
                  </pre>
                </details>
              </>
            )}

            {result.error && (
              <pre style={{ color: '#a03030', fontSize: 12 }}>
                Error: {result.error}
              </pre>
            )}
          </div>
        )
      })}
    </div>
  )
}
