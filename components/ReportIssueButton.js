'use client'

import { useState } from 'react'
import ReportIssueModal from './ReportIssueModal'

export default function ReportIssueButton({ listingId, listingName }) {
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      <div className="flex justify-end mb-2" style={{ marginTop: '-4px' }}>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1.5 hover:opacity-70 transition-opacity"
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 400,
            fontSize: '12px',
            color: 'var(--color-muted)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
            <line x1="4" y1="22" x2="4" y2="15" />
          </svg>
          Report an issue
        </button>
      </div>
      {showModal && (
        <ReportIssueModal
          listingId={listingId}
          listingName={listingName}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}
