'use client'

// Print / Save-as-PDF trigger for the council region report. Hidden from the
// printed output via .no-print.
export default function PrintButton({ label = 'Print / Save as PDF' }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print"
      style={{
        padding: '0.6rem 1.25rem',
        borderRadius: 8,
        border: 'none',
        background: 'var(--color-sage)',
        color: '#fff',
        fontFamily: 'var(--font-body)',
        fontSize: '0.875rem',
        fontWeight: 500,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}
