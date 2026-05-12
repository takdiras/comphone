import BrandPhonesClient from './BrandPhonesClient'

interface Props {
  params: Promise<{ brandSlug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { brandSlug } = await params
  const name = brandSlug
    .replace(/-\d+$/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
  return { title: `${name} Phones — Comphone` }
}

export default async function BrandPhonesPage({ params }: Props) {
  const { brandSlug } = await params
  return <BrandPhonesClient brandSlug={brandSlug} />
}
