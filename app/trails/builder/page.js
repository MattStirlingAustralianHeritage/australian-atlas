import BuilderClient from './BuilderClient'

export const metadata = {
  title: 'Trail Builder — Australian Atlas',
  description: 'Build your own trail of independent venues across Australia — wineries, galleries, cafes, nature stops and more, with live route times and smart suggestions.',
}

export default function TrailBuilderPage() {
  return <BuilderClient />
}
