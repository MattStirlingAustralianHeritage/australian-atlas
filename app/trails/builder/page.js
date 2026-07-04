import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { localizePath } from '@/lib/i18n/config'

// ============================================================
// The trail builder now lives ON the map — /map carries the
// full build-a-trail function (panel, wizard, suggestions,
// saving). This route survives only to catch old links:
//
//   /trails/builder            → /map?trail=1
//   /trails/builder?id=<uuid>  → /map?trail=<uuid>   (edit)
//   /trails/builder?region=X   → /map?trail=1&region=X
//   /trails/builder?resume=1   → /map?trail=1&resume=1
// ============================================================

export default async function TrailBuilderRedirect({ searchParams }) {
  const params = await searchParams
  const locale = await getLocale()

  const qs = new URLSearchParams()
  const id = typeof params?.id === 'string' ? params.id : ''
  qs.set('trail', /^[0-9a-f-]{36}$/i.test(id) ? id : '1')
  if (typeof params?.region === 'string' && params.region) qs.set('region', params.region.slice(0, 80))
  if (params?.resume === '1') qs.set('resume', '1')

  redirect(`${localizePath('/map', locale)}?${qs.toString()}`)
}
