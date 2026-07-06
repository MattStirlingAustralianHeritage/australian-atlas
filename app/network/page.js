import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getListingRegion, LISTING_REGION_SELECT } from '@/lib/regions'
import { getPublicVerticals } from '@/lib/verticalUrl'
import { filterByVertical, relationHasVerticals } from '@/lib/listings/verticalFilter'
import { overlayListingTranslations } from '@/lib/i18n/overlayListings'
import { localizedCountWord } from '@/lib/i18n/config'

const ATLAS_COUNT_WORDS = { 8: 'eight', 9: 'nine', 10: 'ten', 11: 'eleven', 12: 'twelve' }

export async function generateMetadata() {
  const count = getPublicVerticals().length
  const word = ATLAS_COUNT_WORDS[count] || count
  const locale = await getLocale()
  const title = {
    en: 'The Network — Australian Atlas',
    ko: '네트워크 — Australian Atlas',
    zh: '网络 — Australian Atlas',
  }[locale] || 'The Network — Australian Atlas'
  const description = {
    en: `Live listing counts, recent additions, and coverage data across the ${word}-vertical Australian Atlas network.`,
    ko: `${count}개 버티컬로 이루어진 Australian Atlas 네트워크의 실시간 등록 수, 최근 추가, 커버리지 데이터.`,
    zh: `涵盖 ${count} 个门类的 Australian Atlas 网络的实时收录数量、最新新增与覆盖数据。`,
  }[locale] || `Live listing counts, recent additions, and coverage data across the ${word}-vertical Australian Atlas network.`
  return { title, description }
}

const VERTICAL_NAMES = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
}

async function getNetworkData(publicVerticals) {
  const sb = getSupabaseAdmin()
  try {
    // Total counts
    const { count: total } = await sb.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'active').in('vertical', publicVerticals)
    const { count: regionCount } = await sb.from('regions').select('*', { count: 'exact', head: true })
    const { count: claimed } = await sb.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'active').eq('is_claimed', true).in('vertical', publicVerticals)

    // Per-vertical counts
    const verticalCounts = {}
    // Parallel, not N sequential round-trips; resolve the relation shape once.
    const hasVerticals = await relationHasVerticals(sb, 'listings')
    const verticalCountResults = await Promise.all(
      publicVerticals.map(key => {
        let cq = sb.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'active')
        cq = filterByVertical(cq, key, hasVerticals)
        return cq.then(r => r.count || 0)
      })
    )
    publicVerticals.forEach((key, i) => { verticalCounts[key] = verticalCountResults[i] })

    // Recently added (last 20)
    const { data: recent } = await sb
      .from('listings')
      .select(`id, name, vertical, region, state, created_at, ${LISTING_REGION_SELECT}`)
      .eq('status', 'active')
      .in('vertical', publicVerticals)
      .order('created_at', { ascending: false })
      .limit(20)

    // Added this week
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { count: addedThisWeek } = await sb
      .from('listings')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .in('vertical', publicVerticals)
      .gte('created_at', weekAgo)

    // Region coverage: regions with at least one listing
    const { data: regionData } = await sb
      .from('regions')
      .select('name, slug, state, listing_count')
      .eq('status', 'live')
      .order('listing_count', { ascending: false })
      .limit(50)

    return {
      total: total || 0,
      regionCount: regionCount || 0,
      claimed: claimed || 0,
      verticalCounts,
      recent: recent || [],
      addedThisWeek: addedThisWeek || 0,
      regions: regionData || [],
    }
  } catch {
    return { total: 0, regionCount: 0, claimed: 0, verticalCounts: {}, recent: [], addedThisWeek: 0, regions: [] }
  }
}

function timeAgo(dateStr, t) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return t('justNow')
  if (hours < 24) return t('hoursAgo', { count: hours })
  const days = Math.floor(hours / 24)
  if (days === 1) return t('yesterday')
  return t('daysAgo', { count: days })
}

export default async function NetworkPage() {
  const publicVerticals = getPublicVerticals()
  const t = await getTranslations('explore')
  const locale = await getLocale()
  const data = await getNetworkData(publicVerticals)
  data.recent = await overlayListingTranslations(data.recent, locale)
  const atlasCount = publicVerticals.length
  const atlasCountWord = localizedCountWord(locale, ATLAS_COUNT_WORDS[atlasCount] || atlasCount, atlasCount)

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>
      {/* Hero */}
      <section style={{ padding: '5rem 1.5rem 2rem', maxWidth: '720px', margin: '0 auto', textAlign: 'center' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 12,
        }}>
          {t('networkKicker')}
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '2.5rem',
          color: 'var(--color-ink)', lineHeight: 1.15, marginBottom: '1rem',
        }}>
          {t('networkTitle')}
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 15,
          color: 'var(--color-muted)', lineHeight: 1.6, maxWidth: 500, margin: '0 auto',
        }}>
          {t('networkSubtitle', { countWord: atlasCountWord })}
        </p>
      </section>

      {/* Live stats */}
      <section style={{ padding: '2rem 1.5rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16,
          padding: '32px', borderRadius: 12,
          background: 'var(--color-ink)', color: '#fff',
        }}>
          {[
            { n: data.total.toLocaleString(), label: t('statVerifiedListings') },
            { n: String(atlasCount), label: t('statCuratedAtlases') },
            { n: String(data.regionCount), label: t('statMappedRegions') },
            { n: data.claimed.toLocaleString(), label: t('statOperatorClaimed') },
            { n: `+${data.addedThisWeek}`, label: t('statAddedThisWeek') },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <p style={{
                fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 32,
                color: '#fff', margin: 0, lineHeight: 1.1,
              }}>{s.n}</p>
              <p style={{
                fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 11,
                color: 'rgba(255,255,255,0.5)', margin: '8px 0 0',
              }}>{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Per-vertical breakdown */}
      <section style={{ padding: '2rem 1.5rem', maxWidth: '900px', margin: '0 auto' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 16,
        }}>
          {t('byAtlas')}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
          {Object.keys(VERTICAL_NAMES).filter(k => publicVerticals.includes(k)).map(key => (
            <div key={key} style={{
              padding: '14px 18px', borderRadius: 8,
              border: '1px solid var(--color-border)', background: '#fff',
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            }}>
              <span style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13, color: 'var(--color-ink)' }}>{VERTICAL_NAMES[key] ? t(`verticalName_${key}`) : key}</span>
              <span style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 13, color: 'var(--color-muted)' }}>{(data.verticalCounts[key] || 0).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Recently added */}
      <section style={{ padding: '2rem 1.5rem 3rem', maxWidth: '900px', margin: '0 auto' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 16,
        }}>
          {t('justAdded')}
        </p>
        <div style={{ display: 'grid', gap: 6 }}>
          {data.recent.map(r => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 16px', borderRadius: 6,
              border: '1px solid var(--color-border)', background: '#fff',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 10,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: 'var(--color-sage)', minWidth: 80,
                }}>
                  {VERTICAL_NAMES[r.vertical] ? t(`verticalName_${r.vertical}`) : r.vertical}
                </span>
                <span style={{
                  fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 14,
                  color: 'var(--color-ink)',
                }}>
                  {r.name}
                </span>
                {(() => {
                  const lr = getListingRegion(r)
                  return lr && (
                    <span style={{
                      fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 12,
                      color: 'var(--color-muted)',
                    }}>
                      {lr.name}, {r.state}
                    </span>
                  )
                })()}
              </div>
              <span style={{
                fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 11,
                color: 'var(--color-muted)', whiteSpace: 'nowrap',
              }}>
                {timeAgo(r.created_at, t)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Region coverage */}
      <section style={{ padding: '2rem 1.5rem 3rem', maxWidth: '900px', margin: '0 auto' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 10,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--color-sage)', marginBottom: 8,
        }}>
          {t('regionalCoverage')}
        </p>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14,
          color: 'var(--color-muted)', marginBottom: 20, lineHeight: 1.5,
        }}>
          {t('regionalCoverageDesc')}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {data.regions.map(r => (
            <Link
              key={r.slug}
              href={`/regions/${r.slug}`}
              style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                padding: '10px 14px', borderRadius: 6,
                border: '1px solid var(--color-border)', background: '#fff',
                textDecoration: 'none',
              }}
            >
              <div>
                <span style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13, color: 'var(--color-ink)' }}>{r.name}</span>
                <span style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 11, color: 'var(--color-muted)', marginLeft: 6 }}>{r.state}</span>
              </div>
              <span style={{
                fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 12,
                color: 'var(--color-muted)',
                opacity: Math.max(0.3, Math.min(1, (r.listing_count || 0) / 200)),
              }}>
                {r.listing_count || 0}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Suggest a venue */}
      <section style={{ padding: '2rem 1.5rem 5rem', maxWidth: '720px', margin: '0 auto', textAlign: 'center' }}>
        <div style={{
          padding: '36px 28px', borderRadius: 12,
          background: 'var(--color-cream)', border: '1px solid var(--color-border)',
        }}>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1.5rem',
            color: 'var(--color-ink)', marginBottom: 8,
          }}>
            {t('missedTitle')}
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 14,
            color: 'var(--color-muted)', lineHeight: 1.5, marginBottom: 20,
            maxWidth: 440, marginLeft: 'auto', marginRight: 'auto',
          }}>
            {t('missedDesc')}
          </p>
          <a
            href="mailto:suggest@australianatlas.com.au?subject=Venue suggestion"
            style={{
              display: 'inline-block', padding: '12px 28px', borderRadius: 6,
              background: 'var(--color-ink)', color: '#fff',
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13,
              textDecoration: 'none',
            }}
          >
            {t('suggestVenue')}
          </a>
        </div>
      </section>
    </div>
  )
}
