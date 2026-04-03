import Link from 'next/link'

export const metadata = {
  title: 'Event submitted — Australian Atlas',
}

export default function EventConfirmationPage() {
  return (
    <div
      className="min-h-[70vh] flex items-center justify-center px-5"
      style={{ background: 'var(--color-cream)' }}
    >
      <div className="text-center max-w-md">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ background: 'rgba(95,138,126,0.12)' }}
        >
          <svg
            className="w-8 h-8"
            style={{ color: 'var(--color-sage)' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <h1
          className="text-2xl md:text-3xl mb-3"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-ink)' }}
        >
          Your event has been submitted
        </h1>

        <p
          className="mb-8"
          style={{ color: 'var(--color-muted)', lineHeight: 1.6 }}
        >
          We'll review it within 48 hours and let you know when it goes live.
          A confirmation email has been sent to your inbox.
        </p>

        <Link
          href="/events"
          className="inline-block rounded-lg px-6 py-3 font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: 'var(--color-sage)' }}
        >
          Browse events
        </Link>
      </div>
    </div>
  )
}
