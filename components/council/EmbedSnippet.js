'use client'

import { useState } from 'react'

const ORIGIN = 'https://www.australianatlas.com.au'

/**
 * Copy-paste iframe embed snippet for a council's region map. The slug is passed
 * in from the account's assigned region(s) (server-validated) — never free-typed,
 * so a council can only ever embed a region it manages. Plain iframe (not a script
 * injection): simpler and safer for the embedding site.
 */
export default function EmbedSnippet({ slug, regionName }) {
  const [copied, setCopied] = useState(false)

  const snippet =
    `<iframe src="${ORIGIN}/embed/region/${slug}" width="100%" height="600" ` +
    `style="border:0" loading="lazy" title="Independent operators — ${regionName} via Australian Atlas"></iframe>`

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet)
    } catch {
      // Clipboard API unavailable (older browsers / insecure context) — fall back.
      const ta = document.createElement('textarea')
      ta.value = snippet
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <textarea
        readOnly
        value={snippet}
        onFocus={(e) => e.target.select()}
        rows={3}
        style={{
          width: '100%',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '0.72rem',
          lineHeight: 1.5,
          color: 'var(--color-ink)',
          background: 'var(--color-cream, #faf7f0)',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          padding: '0.7rem 0.8rem',
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
        <button
          type="button"
          onClick={copy}
          style={{
            padding: '0.45rem 1rem',
            borderRadius: 8,
            border: 'none',
            background: 'var(--color-sage)',
            color: '#fff',
            fontFamily: 'var(--font-body)',
            fontSize: '0.8rem',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {copied ? 'Copied ✓' : 'Copy embed code'}
        </button>
        <a
          href={`/embed/region/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--color-sage)', textDecoration: 'none' }}
        >
          Preview ↗
        </a>
      </div>
    </div>
  )
}
