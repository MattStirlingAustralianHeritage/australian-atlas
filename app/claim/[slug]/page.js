import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getVerticalLabel, VERTICAL_ACCENTS } from '@/lib/verticalUrl'
import VerticalBadge from '@/components/VerticalBadge'
import ClaimForm from './ClaimForm'
import PreClaimEvidence from './PreClaimEvidence'
import { getListingRegion, LISTING_REGION_SELECT } from '@/lib/regions'
import { getCurrentLegalDocuments, CLAIM_REQUIRED_DOC_TYPES } from '@/lib/legal/documents'

export const revalidate = 3600

const VERTICAL_COLORS = VERTICAL_ACCENTS

// ── Data fetching ─────────────────────────────────────────────

async function getListing(slug) {
  const sb = getSupabaseAdmin()
  // slug is NOT unique across verticals — use limit(1) instead of .single()
  // to avoid PGRST116 if two verticals share a slug
  const { data, error } = await sb
    .from('listings')
    .select(`id, name, slug, vertical, region, state, description, is_claimed, ${LISTING_REGION_SELECT}`)
    .eq('slug', slug)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return data
}

// ── Metadata ──────────────────────────────────────────────────

export async function generateMetadata({ params }) {
  const { slug } = await params
  const listing = await getListing(slug)
  // Claim pages are private decision surfaces — never index them, even the
  // not-found variant. Mirrors the /claim/ Disallow in app/robots.js.
  const robots = { index: false, follow: false }
  if (!listing) return { title: 'Listing not found', robots }

  const title = `Claim ${listing.name} | Australian Atlas`
  const description = `Claim your listing for ${listing.name} on Australian Atlas. Update your details, add images, and connect with visitors.`
  return {
    title,
    description,
    robots,
    openGraph: { title, description, url: `https://australianatlas.com.au/claim/${listing.slug}` },
    twitter: { card: 'summary', title, description },
  }
}

// ── Page ──────────────────────────────────────────────────────

export default async function ClaimPage({ params }) {
  const { slug } = await params
  const listing = await getListing(slug)
  if (!listing) notFound()

  const vertLabel = getVerticalLabel(listing.vertical)
  const vertColor = VERTICAL_COLORS[listing.vertical] || '#5F8A7E'
  const location = [getListingRegion(listing)?.name, listing.state].filter(Boolean).join(', ')
  const descriptionSnippet = listing.description
    ? listing.description.slice(0, 200) + (listing.description.length > 200 ? '...' : '')
    : null

  // Current legal docs (rendered from the DB so wording is a data change, not code).
  const legalDocs = await getCurrentLegalDocuments(getSupabaseAdmin(), CLAIM_REQUIRED_DOC_TYPES)

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <div className="max-w-2xl mx-auto px-5 py-16">

        {/* Back link */}
        <nav className="mb-10">
          <Link
            href={`/place/${listing.slug}`}
            className="inline-flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
            style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to listing
          </Link>
        </nav>

        {/* Heading */}
        <h1
          className="mb-2"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: 'clamp(24px, 4vw, 32px)',
            lineHeight: 1.2,
            color: 'var(--color-ink)',
          }}
        >
          Claim this listing
        </h1>
        <p className="mb-8" style={{ fontFamily: 'var(--font-body)', fontSize: '15px', fontWeight: 300, color: 'var(--color-muted)' }}>
          Verify your connection to this listing to manage its details on Australian Atlas.
        </p>

        {/* Listing card */}
        <div
          className="rounded-xl p-5 mb-10"
          style={{ border: '1px solid var(--color-border)', background: 'var(--color-card-bg)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <VerticalBadge vertical={listing.vertical} />
            {location && (
              <span className="text-xs" style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}>
                {location}
              </span>
            )}
          </div>
          <h2
            className="mb-1"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              fontSize: '20px',
              color: 'var(--color-ink)',
            }}
          >
            {listing.name}
          </h2>
          <p className="text-xs mb-0" style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted)' }}>
            {vertLabel}
          </p>
          {descriptionSnippet && (
            <p className="mt-3" style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 300, lineHeight: 1.6, color: 'var(--color-ink)', opacity: 0.8 }}>
              {descriptionSnippet}
            </p>
          )}
        </div>

        {/* Pre-claim evidence — this listing's OWN organic activity over the
            last 30 days, shown at the decision moment. Renders nothing when
            there is no traction to show. */}
        <PreClaimEvidence listingId={listing.id} listingName={listing.name} slug={listing.slug} />

        {/* Claim form (client component) */}
        {listing.vertical === 'field' ? (
          <div
            className="text-center py-8 px-5 rounded-lg"
            style={{ background: 'var(--color-cream)', border: '1px solid var(--color-border)' }}
          >
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '15px', fontWeight: 400, color: 'var(--color-ink)', marginBottom: '4px' }}>
              This listing cannot be claimed.
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 300, color: 'var(--color-muted)' }}>
              Field Atlas features natural landmarks and public spaces that aren&apos;t operated by a single venue.
            </p>
          </div>
        ) : listing.is_claimed ? (
          <div
            className="text-center py-8 px-5 rounded-lg"
            style={{ background: 'var(--color-cream)', border: '1px solid var(--color-border)' }}
          >
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '15px', fontWeight: 400, color: 'var(--color-ink)', marginBottom: '4px' }}>
              This listing has already been claimed.
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 300, color: 'var(--color-muted)' }}>
              If you believe this is an error, please contact us.
            </p>
          </div>
        ) : (
          <ClaimForm
            listingId={listing.id}
            listingName={listing.name}
            slug={listing.slug}
            vertColor={vertColor}
            legalDocs={legalDocs}
          />
        )}
      </div>
    </div>
  )
}
