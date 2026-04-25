import { ImageResponse } from 'next/og'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getListingRegion, LISTING_REGION_SELECT } from '@/lib/regions'

export const runtime = 'nodejs'

const VERTICAL_COLORS = {
  sba: '#C49A3C',
  collection: '#7A6B8A',
  craft: '#C1603A',
  fine_grounds: '#8A7055',
  rest: '#5A8A9A',
  field: '#4A7C59',
  corner: '#5F8A7E',
  found: '#D4956A',
  table: '#C4634F',
}

const VERTICAL_LABELS = {
  sba: 'Artisan Producer',
  collection: 'Cultural Institution',
  craft: 'Maker & Studio',
  fine_grounds: 'Specialty Coffee',
  rest: 'Boutique Stay',
  field: 'Natural Place',
  corner: 'Independent Shop',
  found: 'Vintage & Secondhand',
  table: 'Independent Dining',
}

// 1x1 transparent PNG for 404 fallback
const TRANSPARENT_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64'
)

export async function GET(request, { params }) {
  const { slug } = await params

  // Fetch listing from Supabase
  const sb = getSupabaseAdmin()
  const { data: listing, error } = await sb
    .from('listings')
    .select(`name, vertical, region, state, description, ${LISTING_REGION_SELECT}`)
    .eq('slug', slug)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Return transparent pixel if not found
  if (error || !listing) {
    return new Response(TRANSPARENT_PIXEL, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=60, s-maxage=60',
      },
    })
  }

  const verticalColor = VERTICAL_COLORS[listing.vertical] || '#5F8A7E'
  const verticalLabel = VERTICAL_LABELS[listing.vertical] || 'Place'
  const location = [getListingRegion(listing)?.name, listing.state].filter(Boolean).join(', ')
  const snippet = listing.description
    ? listing.description.slice(0, 100) + (listing.description.length > 100 ? '...' : '')
    : ''

  const image = new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#FAF8F5',
          fontFamily: 'Georgia, "Times New Roman", serif',
          position: 'relative',
        }}
      >
        {/* Top section with padding */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '56px 64px 0 64px',
            flex: 1,
          }}
        >
          {/* Wordmark */}
          <div
            style={{
              fontSize: '16px',
              letterSpacing: '0.12em',
              color: '#8A7A6A',
              textTransform: 'uppercase',
              fontFamily: 'Georgia, "Times New Roman", serif',
              marginBottom: '48px',
            }}
          >
            Australian Atlas
          </div>

          {/* Vertical badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '24px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '6px 16px',
                borderRadius: '20px',
                backgroundColor: verticalColor + '18',
                border: `1px solid ${verticalColor}40`,
                fontSize: '14px',
                color: verticalColor,
                letterSpacing: '0.06em',
              }}
            >
              {verticalLabel}
            </div>
          </div>

          {/* Listing name */}
          <div
            style={{
              fontSize: listing.name.length > 30 ? '44px' : '52px',
              fontWeight: 400,
              color: '#1C1A17',
              lineHeight: 1.15,
              marginBottom: '16px',
              fontFamily: 'Georgia, "Times New Roman", serif',
              maxWidth: '900px',
            }}
          >
            {listing.name}
          </div>

          {/* Location */}
          {location && (
            <div
              style={{
                fontSize: '20px',
                color: '#8A7A6A',
                fontWeight: 300,
                fontFamily: 'Georgia, "Times New Roman", serif',
                marginBottom: '20px',
              }}
            >
              {location}
            </div>
          )}

          {/* Description snippet */}
          {snippet && (
            <div
              style={{
                fontSize: '16px',
                color: '#A09080',
                lineHeight: 1.6,
                maxWidth: '800px',
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontWeight: 300,
              }}
            >
              {snippet}
            </div>
          )}
        </div>

        {/* Bottom accent bar */}
        <div
          style={{
            width: '1200px',
            height: '8px',
            backgroundColor: verticalColor,
            position: 'absolute',
            bottom: 0,
            left: 0,
          }}
        />
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  )

  // Return with caching headers
  return new Response(image.body, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  })
}
