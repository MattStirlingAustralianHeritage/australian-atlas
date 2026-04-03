'use client'

import { useState } from 'react'

export default function CopyUrlButton() {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback: do nothing
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors underline underline-offset-2"
    >
      {copied ? 'Link copied!' : 'Copy link to share'}
    </button>
  )
}
