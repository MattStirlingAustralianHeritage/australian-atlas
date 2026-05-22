import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf8')
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1].trim()
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1].trim()

const sb = createClient(url, key)
const { data } = await sb
  .from('listings')
  .select('slug, name, vertical, hero_image_url')
  .eq('status', 'active')
  .not('hero_image_url', 'is', null)
  .limit(15)

const APPROVED_HOSTS = ['supabase.co','storage.googleapis.com','static.wixstatic.com','images.squarespace-cdn.com','cdn.shopify.com','res.cloudinary.com','i0.wp.com','i1.wp.com','i2.wp.com','img1.wsimg.com','imagekit.io','imgix.net','amazonaws.com','framerusercontent.com','wp.heide.com.au','kakadu.gov.au','cdn.sanity.io','parks.vic.gov.au']

const isApproved = (u) => { try { return APPROVED_HOSTS.some(h => new URL(u).hostname.endsWith(h)) } catch { return false } }

const approved = (data || []).filter(l => isApproved(l.hero_image_url)).slice(0, 5)
console.log(JSON.stringify(approved.map(l => ({ slug: l.slug, name: l.name, vertical: l.vertical, host: new URL(l.hero_image_url).hostname })), null, 2))
