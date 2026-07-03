import BuilderClient from './BuilderClient'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata() {
  const t = await getTranslations('trailsBuilder')
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  }
}

export default function TrailBuilderPage() {
  return <BuilderClient />
}
