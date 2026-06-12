'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ConfirmDialog from '@/components/ConfirmDialog'

export default function AgentRunButton({ endpoint, name }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [pendingRun, setPendingRun] = useState(false)

  function handleRun() {
    setPendingRun(true)
  }

  async function confirmRun() {
    setLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/admin/run-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      })

      const data = await res.json()

      if (res.ok) {
        setResult({ ok: true, message: 'Agent triggered successfully' })
        // Refresh after a short delay to show updated run history
        setTimeout(() => router.refresh(), 2000)
      } else {
        setResult({ ok: false, message: data.error || 'Failed to trigger agent' })
      }
    } catch {
      setResult({ ok: false, message: 'Network error' })
    } finally {
      setLoading(false)
      setPendingRun(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <ConfirmDialog
        open={pendingRun}
        title={`Run ${name} now?`}
        message="This will execute immediately."
        confirmLabel="Run now"
        busy={loading}
        onConfirm={confirmRun}
        onCancel={() => setPendingRun(false)}
      />
      <button
        onClick={handleRun}
        disabled={loading}
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 12,
          fontWeight: 500,
          padding: '8px 18px',
          borderRadius: 6,
          border: '1px solid var(--color-ink, #1a1a1a)',
          background: loading ? '#e5e5e5' : 'var(--color-ink, #1a1a1a)',
          color: loading ? '#888' : '#fff',
          cursor: loading ? 'not-allowed' : 'pointer',
          transition: 'opacity 0.15s',
          whiteSpace: 'nowrap',
        }}
      >
        {loading ? 'Running...' : 'Run now'}
      </button>
      {result && (
        <span style={{
          fontFamily: 'var(--font-body)',
          fontSize: 11,
          color: result.ok ? '#166534' : '#991b1b',
        }}>
          {result.message}
        </span>
      )}
    </div>
  )
}
