import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { validateCouncilSession } from '@/lib/council-session'

// Council brand logo upload — feeds the white-label regional report
// (council_accounts.logo_url). Session-gated; a council can only ever touch its
// own logo. Stored in the public 'council-logos' bucket.
//
// SVG is intentionally excluded (it can carry inline script — an XSS surface if
// opened directly); raster/webp/avif only. Logos are small, so a 2MB cap is ample.
const BUCKET = 'council-logos'
const ALLOWED_EXT = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif']
const MAX_BYTES = 2 * 1024 * 1024 // 2MB

// Extract the in-bucket path from a stored public URL so a replaced/removed logo
// can be cleaned up. Returns null if the URL isn't one of ours.
function storagePathFromUrl(url) {
  if (!url) return null
  const marker = `/object/public/${BUCKET}/`
  const i = url.indexOf(marker)
  return i === -1 ? null : url.slice(i + marker.length)
}

export async function POST(req) {
  const session = validateCouncilSession(req.cookies.get('council_session')?.value)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file')
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  if (!ALLOWED_EXT.includes(ext)) {
    return NextResponse.json({ error: 'Use a PNG, JPG, WebP, AVIF or GIF image.' }, { status: 400 })
  }
  const buffer = Buffer.from(await file.arrayBuffer())
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'Logo is too large (max 2MB).' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // Idempotent bucket ensure (mirrors the listing-image upload path).
  const { error: bucketErr } = await sb.storage.createBucket(BUCKET, { public: true })
  if (bucketErr && !/exist/i.test(bucketErr.message || '')) {
    console.warn('[council/logo] createBucket warning:', bucketErr.message)
  }

  // Capture the previous logo so we can clean it up after a successful replace.
  const { data: existing } = await sb
    .from('council_accounts')
    .select('logo_url')
    .eq('id', session.councilId)
    .maybeSingle()

  const filePath = `${session.councilId}/logo-${Date.now()}.${ext}`
  const { error: uploadErr } = await sb.storage
    .from(BUCKET)
    .upload(filePath, buffer, { contentType: file.type || `image/${ext}`, cacheControl: '31536000', upsert: false })
  if (uploadErr) {
    console.error('[council/logo] Storage error:', uploadErr.message)
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }

  const { data: urlData } = sb.storage.from(BUCKET).getPublicUrl(filePath)
  const logoUrl = urlData.publicUrl

  const { error: updateErr } = await sb
    .from('council_accounts')
    .update({ logo_url: logoUrl })
    .eq('id', session.councilId)
  if (updateErr) {
    // Roll back the orphaned object — never leave a stored asset we didn't record.
    await sb.storage.from(BUCKET).remove([filePath]).catch(() => {})
    console.error('[council/logo] DB update failed:', updateErr.message)
    return NextResponse.json({ error: 'Could not save the logo. Please try again.' }, { status: 500 })
  }

  // Best-effort: remove the prior logo object (replacement, not user data loss).
  const prevPath = storagePathFromUrl(existing?.logo_url)
  if (prevPath && prevPath !== filePath) {
    await sb.storage.from(BUCKET).remove([prevPath]).catch(() => {})
  }

  await sb.from('council_activity').insert({ council_id: session.councilId, action: 'logo_updated' }).catch(() => {})

  return NextResponse.json({ logo_url: logoUrl })
}

export async function DELETE(req) {
  const session = validateCouncilSession(req.cookies.get('council_session')?.value)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = getSupabaseAdmin()
  const { data: existing } = await sb
    .from('council_accounts')
    .select('logo_url')
    .eq('id', session.councilId)
    .maybeSingle()

  const { error } = await sb
    .from('council_accounts')
    .update({ logo_url: null })
    .eq('id', session.councilId)
  if (error) {
    console.error('[council/logo] DELETE update failed:', error.message)
    return NextResponse.json({ error: 'Could not remove the logo. Please try again.' }, { status: 500 })
  }

  const prevPath = storagePathFromUrl(existing?.logo_url)
  if (prevPath) await sb.storage.from(BUCKET).remove([prevPath]).catch(() => {})

  return NextResponse.json({ ok: true })
}
