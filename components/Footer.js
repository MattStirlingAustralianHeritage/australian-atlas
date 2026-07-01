import { getTranslations } from 'next-intl/server'
import LocalizedLink from './LocalizedLink'
import NewsletterSignup from './NewsletterSignup'
import { isVerticalPublic } from '@/lib/verticalUrl'

const WAY_NETWORK_LINK = { name: 'Way Atlas', url: 'https://wayatlas.com.au' }

const verticals = [
  { name: 'Small Batch Atlas', url: 'https://smallbatchatlas.com.au' },
  { name: 'Culture Atlas', url: 'https://collectionatlas.com.au' },
  { name: 'Craft Atlas', url: 'https://craftatlas.com.au' },
  { name: 'Fine Grounds Atlas', url: 'https://finegroundsatlas.com.au' },
  { name: 'Rest Atlas', url: 'https://restatlas.com.au' },
  { name: 'Field Atlas', url: 'https://fieldatlas.com.au' },
  { name: 'Corner Atlas', url: 'https://corneratlas.com.au' },
  { name: 'Found Atlas', url: 'https://foundatlas.com.au' },
  { name: 'Table Atlas', url: 'https://tableatlas.com.au' },
]

// Explore + partner links use translation keys resolved at render.
const exploreLinks = [
  { href: '/explore', key: 'browseByVertical' },
  { href: '/regions', key: 'browseByRegion' },
  { href: '/map', key: 'map' },
  { href: '/search', key: 'searchAll' },
  { href: '/trails', key: 'trails' },
  { href: '/journal', key: 'journal' },
  { href: '/events', key: 'events' },
  { href: '/plan', key: 'planTrip' },
]

const partnerLinks = [
  { href: '/for-venues', key: 'listVenue' },
  { href: '/for-councils', key: 'forCouncils' },
  { href: '/operators', key: 'forOperators' },
  { href: '/suggest', key: 'suggestPlace' },
  { href: '/press', key: 'press' },
  { href: '/about', key: 'about' },
]

const headingStyle = {
  fontFamily: 'var(--font-body)',
  fontWeight: 500,
  fontSize: '11px',
  letterSpacing: '0.12em',
  color: 'rgba(250,248,244,0.4)',
}

const linkStyle = {
  fontFamily: 'var(--font-body)',
  fontWeight: 300,
  fontSize: '13px',
  color: 'rgba(250,248,244,0.55)',
}

export default async function Footer() {
  const t = await getTranslations('footer')
  const networkVerticals = isVerticalPublic('way') ? [...verticals, WAY_NETWORK_LINK] : verticals
  return (
    <footer style={{ background: '#1A1A1A', borderTop: '1px solid rgba(250,248,244,0.08)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-14 pb-10">
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-4">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <h3
              className="mb-2"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 400,
                fontSize: '19px',
                letterSpacing: '-0.01em',
                color: '#FAF8F4',
              }}
            >
              Australian Atlas
            </h3>
            <div
              aria-hidden="true"
              style={{ width: '28px', height: '2px', background: 'var(--color-gold)', marginBottom: '14px' }}
            />
            <p
              className="leading-relaxed"
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 300,
                fontSize: '13px',
                maxWidth: '230px',
                color: 'rgba(250,248,244,0.5)',
              }}
            >
              {t('tagline')}
            </p>
          </div>

          {/* The Network */}
          <nav aria-label="The Atlas network">
            <h4 className="mb-3 uppercase" style={headingStyle}>{t('network')}</h4>
            <ul className="space-y-1.5">
              {networkVerticals.map(v => (
                <li key={v.url}>
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[#FAF8F4] transition-colors"
                    style={linkStyle}
                  >
                    {v.name}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Explore */}
          <nav aria-label="Explore">
            <h4 className="mb-3 uppercase" style={headingStyle}>{t('explore')}</h4>
            <ul className="space-y-1.5">
              {exploreLinks.map(link => (
                <li key={link.href}>
                  <LocalizedLink
                    href={link.href}
                    className="hover:text-[#FAF8F4] transition-colors"
                    style={linkStyle}
                  >
                    {t(link.key)}
                  </LocalizedLink>
                </li>
              ))}
            </ul>
          </nav>

          {/* Partners */}
          <nav aria-label="Partners and contact">
            <h4 className="mb-3 uppercase" style={headingStyle}>{t('workWithUs')}</h4>
            <ul className="space-y-1.5">
              {partnerLinks.map(link => (
                <li key={link.href}>
                  <LocalizedLink
                    href={link.href}
                    className="hover:text-[#FAF8F4] transition-colors"
                    style={linkStyle}
                  >
                    {t(link.key)}
                  </LocalizedLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* Newsletter */}
        <div
          className="mt-12 pt-6"
          style={{ borderTop: '1px solid rgba(250,248,244,0.08)' }}
        >
          <h4 className="mb-1 uppercase" style={headingStyle}>{t('stayInLoop')}</h4>
          <NewsletterSignup variant="footer" />
        </div>

        <div
          className="mt-6 pt-6 flex flex-col sm:flex-row items-center justify-between gap-2"
          style={{ borderTop: '1px solid rgba(250,248,244,0.08)' }}
        >
          <p style={{ fontSize: '12px', color: 'rgba(250,248,244,0.4)' }}>
            {t('partOf')}{' '}
            <a
              href="https://australianheritage.au"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-[#FAF8F4]"
              style={{ color: 'var(--color-gold)' }}
            >
              Australian Heritage
            </a>
          </p>
          <p style={{ fontSize: '12px', color: 'rgba(250,248,244,0.4)' }}>{t('copyright')}</p>
        </div>
      </div>
    </footer>
  )
}
