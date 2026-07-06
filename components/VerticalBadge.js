'use client'

import { useLocale } from 'next-intl'
import { localizeVerticalKicker } from '@/lib/i18n/listingLabels'
import { VERTICAL_STYLES } from '@/lib/verticalStyles'

// Re-exported for backwards compatibility: existing client components import
// VERTICAL_STYLES from here. Server components must import it directly from
// '@/lib/verticalStyles' (a client-module export can't be dotted into on the
// server).
export { VERTICAL_STYLES }

export default function VerticalBadge({ vertical, className = '', size = 'md' }) {
  const locale = useLocale()
  const style = VERTICAL_STYLES[vertical]
  if (!style) return null
  const isSmall = size === 'sm'
  const label = localizeVerticalKicker(vertical, style.label, locale)
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${className}`}
      style={{
        backgroundColor: style.bg,
        color: style.text,
        fontSize: isSmall ? '9px' : '12px',
        padding: isSmall ? '2px 8px' : '4px 10px',
      }}
    >
      {label}
    </span>
  )
}
