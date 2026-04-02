import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

const STATE_LABELS = {
  VIC: 'Victoria',
  NSW: 'New South Wales',
  QLD: 'Queensland',
  SA: 'South Australia',
  WA: 'Western Australia',
  TAS: 'Tasmania',
  ACT: 'Australian Capital Territory',
  NT: 'Northern Territory',
}

// Unsplash images keyed by region slug
const REGION_IMAGES = {
  // Victoria
  'bellarine-peninsula':         'https://images.unsplash.com/photo-1523482580672-f109ba8cb9be?w=600&q=80',
  'central-victoria':            'https://images.unsplash.com/photo-1590559899731-a382839e5549?w=600&q=80',
  'daylesford-hepburn-springs':  'https://images.unsplash.com/photo-1596394516093-501ba68a0ba6?w=600&q=80',
  'grampians':                   'https://images.unsplash.com/photo-1558005530-a7958896ec60?w=600&q=80',
  'great-ocean-road':            'https://images.unsplash.com/photo-1529108190281-9a4f620bc2d8?w=600&q=80',
  'macedon-ranges':              'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=600&q=80',
  'mornington-peninsula':        'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&q=80',
  'yarra-valley':                'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600&q=80',
  // NSW
  'blue-mountains':              'https://images.unsplash.com/photo-1494949649109-ecfc3b8c35df?w=600&q=80',
  'byron-hinterland':            'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80',
  'hunter-valley':               'https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=600&q=80',
  'northern-rivers':             'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=600&q=80',
  'shoalhaven':                  'https://images.unsplash.com/photo-1519451241324-20b4ea2c4220?w=600&q=80',
  'southern-highlands':          'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=600&q=80',
  // Queensland
  'gold-coast-hinterland':       'https://images.unsplash.com/photo-1562602833-0f4ab2fc46e3?w=600&q=80',
  'noosa-hinterland':            'https://images.unsplash.com/photo-1507699622108-4be3abd695ad?w=600&q=80',
  'sunshine-coast-hinterland':   'https://images.unsplash.com/photo-1548263594-a71ea65a8598?w=600&q=80',
  // South Australia
  'adelaide-hills':              'https://images.unsplash.com/photo-1596436889106-be35e843f974?w=600&q=80',
  'barossa-valley':              'https://images.unsplash.com/photo-1474722883778-792e7990302f?w=600&q=80',
  'clare-valley':                'https://images.unsplash.com/photo-1506197603052-3cc9c3a201bd?w=600&q=80',
  'flinders-ranges':             'https://images.unsplash.com/photo-1529686342540-1b43aec0df75?w=600&q=80',
  'kangaroo-island':             'https://images.unsplash.com/photo-1583862077264-8a1b7bc06439?w=600&q=80',
  'mclaren-vale':                'https://images.unsplash.com/photo-1504279577054-acfeccf8fc52?w=600&q=80',
  // Western Australia
  'fremantle-swan-valley':       'https://images.unsplash.com/photo-1573455494060-c5595004fb6c?w=600&q=80',
  'margaret-river':              'https://images.unsplash.com/photo-1530053969600-caed2596d242?w=600&q=80',
  // Tasmania
  'bruny-island':                'https://images.unsplash.com/photo-1516553174826-d05833723cd4?w=600&q=80',
  'cradle-country':              'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=600&q=80',
  'hobart-southern-tasmania':    'https://images.unsplash.com/photo-1589871973318-9ca1258faa7d?w=600&q=80',
  'launceston-tamar-valley':     'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=600&q=80',
  'east-coast-tasmania':         'https://images.unsplash.com/photo-1559128010-7c1ad6e1b6a5?w=600&q=80',
  // ACT
  'canberra':                    'https://images.unsplash.com/photo-1514395462725-fb4566210144?w=600&q=80',
  // NT
  'alice-springs':               'https://images.unsplash.com/photo-1529108190281-9a4f620bc2d8?w=600&q=80',
  'darwin':                      'https://images.unsplash.com/photo-1506197603052-3cc9c3a201bd?w=600&q=80',
}

// Fallback image for regions without a specific photo
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1506197603052-3cc9c3a201bd?w=600&q=80'

export const metadata = {
  title: 'Regions — Australian Atlas',
  description: 'Explore Australian regions and discover the best independent places in each.',
}

async function getRegions() {
  try {
    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('regions')
      .select('id, name, slug, state, description, listing_count')
      .order('state')
      .order('name')
    return data || []
  } catch {
    return []
  }
}

export default async function RegionsPage() {
  const regions = await getRegions()

  // Group by state
  const byState = {}
  for (const r of regions) {
    if (!byState[r.state]) byState[r.state] = []
    byState[r.state].push(r)
  }

  const stateOrder = ['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400 }} className="text-3xl sm:text-4xl text-[var(--color-ink)]">Regions</h1>
      <p className="mt-2 max-w-xl" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px', color: 'var(--color-muted)' }}>
        Discover what makes each Australian region special — from wineries and makers to hidden swimming holes and boutique stays.
      </p>

      <div className="mt-10 space-y-12">
        {stateOrder.filter(s => byState[s]).map(state => (
          <div key={state}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '20px' }} className="text-[var(--color-ink)] border-b border-[var(--color-border)] pb-2 mb-5">
              {STATE_LABELS[state]}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {byState[state].map(region => {
                const imgUrl = REGION_IMAGES[region.slug] || FALLBACK_IMAGE
                return (
                  <Link
                    key={region.id}
                    href={`/regions/${region.slug}`}
                    className="group relative block rounded-xl overflow-hidden aspect-[3/2]"
                  >
                    <img
                      src={imgUrl}
                      alt={region.name}
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '18px' }} className="text-white leading-tight group-hover:text-white/90 transition-colors">
                        {region.name}
                      </h3>
                      {region.description && (
                        <p className="mt-1 line-clamp-2" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>{region.description}</p>
                      )}
                      {region.listing_count > 0 && (
                        <span className="inline-block mt-2 text-white/90 bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-full" style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '11px' }}>
                          {region.listing_count} listings
                        </span>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
