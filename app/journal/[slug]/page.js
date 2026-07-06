import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { overlayArticleTranslations } from '@/lib/i18n/overlayEditorial'
import { dateLocale } from '@/lib/i18n/config'
import { VERTICAL_ACCENTS, VERTICAL_CARD_TOKENS } from '@/lib/verticalUrl'
import { articleBodyToHtml, readingTime } from '@/lib/journal/render'
import ReadingProgress from './ReadingProgress'

// Renders dynamically like every other portal route (getLocale/getTranslations
// read request headers, which the on-demand ISR path forbids — pairing them
// with generateStaticParams 500s in production with DYNAMIC_SERVER_USAGE).
export const revalidate = 3600

const SITE_URL = 'https://www.australianatlas.com.au'

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table', way: 'Way', atlas: 'Atlas',
}

async function getArticle(slug) {
  try {
    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('articles')
      .select('id, vertical, verticals, title, slug, excerpt, body, hero_image_url, author, published_at, category, region_tags, listing_tags, meta_description')
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle()
    return data || null
  } catch {
    return null
  }
}

// Sibling stories — same vertical first, then the freshest of the rest.
async function getRelatedArticles(article, limit = 3) {
  try {
    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('articles')
      .select('id, title, slug, excerpt, hero_image_url, vertical, verticals, published_at, category')
      .eq('status', 'published')
      .neq('slug', article.slug)
      .order('published_at', { ascending: false })
      .limit(12)
    if (!data || data.length === 0) return []
    const mine = new Set(article.verticals?.length ? article.verticals : [article.vertical])
    const scored = data.map(a => {
      const verts = a.verticals?.length ? a.verticals : [a.vertical]
      return { ...a, _shared: verts.some(v => mine.has(v)) ? 1 : 0 }
    })
    scored.sort((a, b) => b._shared - a._shared || new Date(b.published_at) - new Date(a.published_at))
    return scored.slice(0, limit)
  } catch {
    return []
  }
}

// "In this story" — venues the piece is tagged with (listing_tags uuid[]).
// Public-filter rules apply: active only, never needs_review.
async function getTaggedListings(listingIds) {
  if (!Array.isArray(listingIds) || listingIds.length === 0) return []
  try {
    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('listings')
      .select('id, name, slug, suburb, state, vertical, hero_image_url, needs_review')
      .in('id', listingIds.slice(0, 8))
      .eq('status', 'active')
    return (data || []).filter(l => !l.needs_review)
  } catch {
    return []
  }
}

export async function generateMetadata({ params }) {
  const article = await getArticle(params.slug)
  if (!article) return { title: 'Not Found | Australian Atlas' }
  const locale = await getLocale()
  const [localized] = await overlayArticleTranslations([article], locale)
  const title = `${localized.title} | Australian Atlas`
  const description = localized.meta_description || localized.excerpt || undefined
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/journal/${article.slug}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/journal/${article.slug}`,
      siteName: 'Australian Atlas',
      locale: 'en_AU',
      type: 'article',
      publishedTime: article.published_at || undefined,
      authors: article.author ? [article.author] : undefined,
      images: article.hero_image_url ? [article.hero_image_url] : [],
    },
  }
}

export default async function ArticlePage({ params }) {
  const article = await getArticle(params.slug)
  if (!article) notFound()

  const locale = await getLocale()
  const t = await getTranslations('journal')
  const [localized] = await overlayArticleTranslations([article], locale)

  const vertical = article.verticals?.length ? article.verticals[0] : (article.vertical || 'atlas')
  const accent = VERTICAL_ACCENTS[vertical] || 'var(--color-gold)'
  const verticalLabel = VERTICAL_LABELS[vertical] || vertical
  const ground = VERTICAL_CARD_TOKENS[vertical]?.bg || VERTICAL_CARD_TOKENS.portal.bg

  const bodyHtml = articleBodyToHtml(article.body)
  const minutes = readingTime(article.body)
  const date = article.published_at
    ? new Date(article.published_at).toLocaleDateString(dateLocale(locale), { day: 'numeric', month: 'long', year: 'numeric' })
    : null
  const tags = (article.region_tags || []).filter(Boolean)

  const [related, taggedListings] = await Promise.all([
    getRelatedArticles(article),
    getTaggedListings(article.listing_tags),
  ])

  return (
    <article style={{ minHeight: '100vh' }}>
      <ReadingProgress color={accent} />

      {/* ── Opening block — centred, set on the paper before the photograph.
             The Atlantic model: kicker, display title, italic dek, byline. ── */}
      <header className="jart-head">
        <p className="jart-kicker">
          <span style={{ color: accent }}>{verticalLabel}</span>
          {article.category && <span className="jart-kicker-cat">{article.category}</span>}
        </p>
        <h1 className="jart-title">{localized.title}</h1>
        {localized.excerpt && <p className="jart-dek">{localized.excerpt}</p>}
        <div className="jart-byline">
          <span className="jart-byline-rule" aria-hidden="true" />
          <span className="jart-byline-author">
            {article.author ? t('byAuthor', { name: article.author }) : 'Australian Atlas'}
          </span>
          {(date || minutes) && (
            <span className="jart-byline-meta">
              {date && <span>{date}</span>}
              {date && minutes && <span className="jart-dot" aria-hidden="true">·</span>}
              {minutes && <span>{t('minRead', { count: minutes })}</span>}
            </span>
          )}
        </div>
      </header>

      {/* ── Hero — contained at feature width, print-photography framing ── */}
      {article.hero_image_url ? (
        <figure className="jart-hero">
          <img src={article.hero_image_url} alt={localized.title} loading="eager" fetchPriority="high" />
        </figure>
      ) : (
        <div className="jart-hero jart-hero-type" style={{ background: ground }} aria-hidden="true">
          <span style={{ color: accent }}>✦</span>
        </div>
      )}

      {/* ── Body — 65ch measure, breakout grid for figures and quotes ── */}
      <div
        className="article-body"
        style={{ '--jart-accent': accent }}
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />

      {/* ── End matter ── */}
      <footer className="jart-end">
        {taggedListings.length > 0 && (
          <section className="jart-venues">
            <h2 className="jart-section-title"><span>{t('inStory')}</span></h2>
            <div className="jart-venues-grid">
              {taggedListings.map(l => (
                <Link key={l.id} href={`/place/${l.slug}`} className="jart-venue">
                  <div className="jart-venue-img" style={{ background: VERTICAL_CARD_TOKENS[l.vertical]?.bg || ground }}>
                    {l.hero_image_url && <img src={l.hero_image_url} alt="" loading="lazy" />}
                  </div>
                  <div>
                    <p className="jart-venue-name">{l.name}</p>
                    <p className="jart-venue-place">
                      {[l.suburb, l.state].filter(Boolean).join(', ')}
                      {l.vertical && VERTICAL_LABELS[l.vertical] && (
                        <span style={{ color: VERTICAL_ACCENTS[l.vertical] || accent }}> · {VERTICAL_LABELS[l.vertical]}</span>
                      )}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {related.length > 0 && (
          <section className="jart-related">
            <h2 className="jart-section-title"><span>{t('related')}</span></h2>
            <div className="jart-related-list">
              {related.map((a, i) => {
                const v = a.verticals?.length ? a.verticals[0] : (a.vertical || 'atlas')
                return (
                  <Link key={a.id} href={`/journal/${a.slug}`} className="jart-related-row">
                    <span className="jart-related-no" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p className="jart-related-kicker" style={{ color: VERTICAL_ACCENTS[v] || accent }}>
                        {VERTICAL_LABELS[v] || v}
                      </p>
                      <p className="jart-related-title">{a.title}</p>
                      {a.published_at && (
                        <p className="jart-related-date">
                          {new Date(a.published_at).toLocaleDateString(dateLocale(locale), { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                    {a.hero_image_url ? (
                      <div className="jart-related-img"><img src={a.hero_image_url} alt="" loading="lazy" /></div>
                    ) : (
                      <div className="jart-related-img" style={{ background: VERTICAL_CARD_TOKENS[v]?.bg || ground }} />
                    )}
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {tags.length > 0 && (
          <div className="jart-tags">
            <span className="jart-tags-label">{t('filedUnder')}</span>
            {tags.map(tag => <span key={tag} className="jart-tag">{tag}</span>)}
          </div>
        )}

        <div className="jart-back">
          <Link href="/journal">{t('back')}</Link>
        </div>
      </footer>

      {/* Editorial stylesheet — scoped by the jart-/article-body prefixes.
          dangerouslySetInnerHTML avoids the quote-escaping hydration trap
          that bites raw <style> children (see /atlas-index). */}
      <style dangerouslySetInnerHTML={{ __html: `
        /* Opening block — centred magazine header */
        .jart-head { max-width: 880px; margin: 0 auto; text-align: center;
          padding: clamp(48px, 8vh, 92px) 24px clamp(34px, 5vh, 52px); }
        .jart-kicker { display: flex; align-items: center; justify-content: center; gap: 14px;
          margin: 0 0 26px; font-family: var(--font-body); font-size: 12px; font-weight: 700;
          letter-spacing: 0.22em; text-transform: uppercase; }
        .jart-kicker::before, .jart-kicker::after { content: ''; width: 34px; height: 1px;
          background: var(--color-ink); opacity: 0.22; }
        .jart-kicker-cat { color: var(--color-muted); font-weight: 500; letter-spacing: 0.16em; }
        .jart-title { font-family: var(--font-display); font-weight: 400;
          font-size: clamp(2.5rem, 3vw + 1.7rem, 4.4rem); line-height: 1.04; letter-spacing: -0.02em;
          color: var(--color-ink); margin: 0 auto; max-width: 18em; text-wrap: balance; }
        .jart-dek { font-family: var(--font-display); font-weight: 400; font-style: italic;
          font-size: clamp(1.22rem, 0.6vw + 1.05rem, 1.5rem); line-height: 1.5;
          color: rgba(28, 26, 23, 0.68); max-width: 34em; margin: 26px auto 0; text-wrap: balance; }
        .jart-byline { display: flex; flex-direction: column; align-items: center; gap: 9px;
          margin-top: 34px; font-family: var(--font-body); }
        .jart-byline-rule { width: 44px; height: 1px; background: var(--color-ink); opacity: 0.28;
          margin-bottom: 7px; }
        .jart-byline-author { font-size: 11.5px; font-weight: 600; letter-spacing: 0.2em;
          text-transform: uppercase; color: var(--color-ink); }
        .jart-byline-meta { display: flex; gap: 10px; align-items: baseline; font-size: 12.5px;
          color: var(--color-muted); font-variant-numeric: oldstyle-nums; }
        .jart-dot { opacity: 0.5; }

        /* Hero — contained feature width, quiet frame */
        .jart-hero { max-width: 1150px; margin: 0 auto; padding: 0 24px; }
        .jart-hero img { width: 100%; height: auto; max-height: 68vh; object-fit: cover;
          display: block; border-radius: 2px; }
        .jart-hero-type { display: flex; align-items: center; justify-content: center;
          max-width: 1150px; margin: 0 auto 0; border-radius: 2px; aspect-ratio: 21/6;
          min-height: 150px; font-size: 26px; }
        @media (max-width: 640px) { .jart-hero { padding: 0; } .jart-hero img { border-radius: 0; } }

        /* Body — breakout grid skeleton: content | popout | full */
        .article-body { display: grid; margin-top: clamp(44px, 6vh, 68px);
          grid-template-columns:
            [full-start] minmax(24px, 1fr)
            [popout-start] minmax(0, 96px)
            [content-start] min(65ch, calc(100% - 48px)) [content-end]
            minmax(0, 96px) [popout-end]
            minmax(24px, 1fr) [full-end]; }
        .article-body > * { grid-column: content; }
        .article-body p { font-family: var(--font-display); font-size: 1.1875rem; line-height: 1.74;
          color: rgba(28, 26, 23, 0.9); margin: 0 0 1.4em; text-wrap: pretty;
          font-variant-numeric: oldstyle-nums; overflow-wrap: break-word; }
        .article-body > p:first-of-type { font-size: 1.28rem; line-height: 1.66; }
        .article-body > p:first-of-type::first-letter { font-family: var(--font-display);
          float: left; font-size: 3.9em; line-height: 0.8; font-weight: 460;
          padding: 0.04em 0.13em 0 0; color: var(--color-ink); }
        .article-body > p:last-of-type::after { content: ' ✦'; color: var(--jart-accent, var(--color-gold)); font-size: 0.8em; }
        .article-body h2 { font-family: var(--font-display); font-weight: 400; font-size: 1.7rem; line-height: 1.25;
          letter-spacing: -0.01em; color: var(--color-ink); margin: 2.8em 0 0.7em; text-wrap: balance; }
        .article-body h3 { font-family: var(--font-body); font-weight: 700; font-size: 0.82rem;
          letter-spacing: 0.18em; text-transform: uppercase; color: var(--color-ink); margin: 3em 0 1em; }
        .article-body h2:first-child, .article-body h3:first-child { margin-top: 0; }
        .article-body strong { font-weight: 600; color: var(--color-ink); }
        .article-body a { color: inherit; text-decoration: underline; text-underline-offset: 3px;
          text-decoration-thickness: 1px; text-decoration-color: var(--jart-accent, var(--color-gold)); }
        .article-body a:hover { color: var(--jart-accent, var(--color-accent)); }
        .article-body ul, .article-body ol { font-family: var(--font-display); font-size: 1.1875rem; line-height: 1.72;
          color: rgba(28, 26, 23, 0.9); padding-left: 1.4em; margin: 0 0 1.5em; }
        .article-body li { margin-bottom: 0.5em; }
        .article-body li::marker { color: var(--jart-accent, var(--color-gold)); }
        .article-body code { font-family: ui-monospace, Menlo, monospace; font-size: 0.85em;
          background: rgba(28, 26, 23, 0.05); border: 1px solid var(--color-border); padding: 1px 5px; border-radius: 4px; }

        /* Pull quote — popout width, a single measured accent rule above */
        .article-body blockquote { grid-column: popout; margin: 3.2em 0; padding: 2em 8px 0;
          border: 0; text-align: center; position: relative; }
        .article-body blockquote::before { content: ''; position: absolute; top: 0; left: 50%;
          transform: translateX(-50%); width: 56px; height: 2px; background: var(--jart-accent, var(--color-gold)); }
        .article-body blockquote p { font-family: var(--font-display); font-style: italic;
          font-size: 1.7rem; line-height: 1.38; letter-spacing: -0.005em;
          color: var(--color-ink); margin: 0; text-wrap: balance; }

        /* Section break — dinkus */
        .article-body hr { grid-column: content; border: 0; margin: 2.6em 0; text-align: center; }
        .article-body hr::after { content: '✦ ✦ ✦'; display: block; letter-spacing: 1.4em; padding-left: 1.4em;
          color: var(--jart-accent, var(--color-gold)); font-size: 0.62rem; opacity: 0.9; }

        /* Figures — popout by default, hairline caption */
        .article-body figure.fig { grid-column: popout; margin: 2.8em 0; }
        .article-body figure.fig img { width: 100%; height: auto; display: block; border-radius: 2px; }
        .article-body figcaption { font-family: var(--font-body); font-size: 0.8125rem; line-height: 1.5;
          color: var(--color-muted); border-top: 1px solid var(--color-border);
          margin-top: 12px; padding-top: 9px; }

        /* End matter */
        .jart-end { max-width: 720px; margin: 0 auto; padding: clamp(30px, 5vh, 56px) 24px 110px; }
        .jart-section-title { display: flex; align-items: center; gap: 18px;
          font-family: var(--font-body); font-size: 11px; font-weight: 700;
          letter-spacing: 0.24em; text-transform: uppercase; color: var(--color-muted);
          margin: 0 0 6px; }
        .jart-section-title::before, .jart-section-title::after { content: ''; flex: 1; height: 1px;
          background: var(--color-ink); opacity: 0.14; }
        .jart-section-title span { flex-shrink: 0; }
        .jart-venues { margin-bottom: 40px; }
        .jart-venues-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px; padding-top: 20px; }
        .jart-venue { display: flex; gap: 14px; align-items: center; text-decoration: none; }
        .jart-venue-img { width: 72px; height: 72px; border-radius: 4px; overflow: hidden; flex-shrink: 0; }
        .jart-venue-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .jart-venue-name { font-family: var(--font-display); font-size: 1.05rem; color: var(--color-ink); margin: 0; line-height: 1.3; }
        .jart-venue-place { font-family: var(--font-body); font-size: 11.5px; color: var(--color-muted); margin: 4px 0 0; }
        .jart-related { margin-bottom: 8px; }
        .jart-related-list { display: flex; flex-direction: column; }
        .jart-related-row { display: flex; gap: 22px; align-items: center; text-decoration: none;
          padding: 22px 2px; border-bottom: 1px solid var(--color-border); }
        .jart-related-list .jart-related-row:last-child { border-bottom: 0; }
        .jart-related-no { font-family: var(--font-display); font-size: 1.35rem;
          color: var(--jart-accent, var(--color-gold)); font-variant-numeric: oldstyle-nums;
          flex-shrink: 0; width: 2ch; }
        .jart-related-img { width: 96px; height: 68px; border-radius: 3px; overflow: hidden; flex-shrink: 0; }
        .jart-related-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .jart-related-kicker { font-family: var(--font-body); font-size: 10px; font-weight: 700;
          letter-spacing: 0.18em; text-transform: uppercase; margin: 0 0 5px; }
        .jart-related-title { font-family: var(--font-display); font-size: 1.28rem; line-height: 1.28;
          color: var(--color-ink); margin: 0; text-wrap: balance; transition: color 0.15s; }
        .jart-related-row:hover .jart-related-title { color: var(--jart-accent, var(--color-accent)); }
        .jart-related-date { font-family: var(--font-body); font-size: 11px; color: var(--color-muted);
          margin: 6px 0 0; font-variant-numeric: oldstyle-nums; }
        .jart-tags { display: flex; align-items: baseline; justify-content: center; gap: 10px;
          flex-wrap: wrap; margin-top: 40px; }
        .jart-tags-label { font-family: var(--font-body); font-size: 10px; font-weight: 700;
          letter-spacing: 0.2em; text-transform: uppercase; color: var(--color-muted); }
        .jart-tag { font-family: var(--font-body); font-size: 10.5px; font-weight: 500; letter-spacing: 0.1em;
          text-transform: uppercase; color: var(--color-ink); padding: 5px 14px;
          border: 1px solid var(--color-border); border-radius: 999px; }
        .jart-back { margin-top: 46px; text-align: center; }
        .jart-back a { display: inline-flex; align-items: center; gap: 10px;
          font-family: var(--font-body); font-size: 11.5px; font-weight: 600; letter-spacing: 0.18em;
          text-transform: uppercase; color: var(--color-muted); text-decoration: none; }
        .jart-back a::before { content: '←'; font-size: 13px; }
        .jart-back a:hover { color: var(--color-ink); }

        @media (max-width: 760px) {
          .article-body blockquote p { font-size: 1.35rem; }
          .jart-related-img { width: 78px; height: 56px; }
          .jart-related-row { gap: 14px; }
        }
      ` }} />
    </article>
  )
}
