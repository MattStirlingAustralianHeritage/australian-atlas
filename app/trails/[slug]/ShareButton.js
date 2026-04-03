'use client'

import { useState } from 'react'

export default function ShareButton({ shortCode, slug }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    const path = shortCode ? `/t/${shortCode}` : `/trails/${slug}`
    const url = `${window.location.origin}${path}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={handleCopy}
      style={{
        display: 'inline-block', padding: '11px 24px',
        background: copied ? '#4A7C59' : 'var(--color-ink)',
        color: '#fff', border: 'none', cursor: 'pointer',
        fontSize: 12, fontWeight: 600, letterSpacing: '0.08em',
        textTransform: 'uppercase', fontFamily: 'var(--font-body)',
        borderRadius: 2, transition: 'background 0.2s',
      }}
    >
      {copied ? 'Copied!' : 'Copy link'}
    </button>
  )
}
