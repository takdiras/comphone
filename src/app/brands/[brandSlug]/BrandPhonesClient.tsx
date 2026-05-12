'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Smartphone, GitCompareArrows, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface PhoneItem {
  name: string
  slug: string
  imageUrl?: string
  thumbUrl?: string
}

function PhoneCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-3">
        <Skeleton className="aspect-square w-full rounded-lg mb-3" />
        <Skeleton className="h-3 w-full mb-1" />
        <Skeleton className="h-3 w-2/3" />
      </CardContent>
    </Card>
  )
}

function PhoneCard({ phone }: { phone: PhoneItem }) {
  const [imgError, setImgError] = useState(false)
  const imgSrc = phone.thumbUrl || phone.imageUrl

  return (
    <div className="relative group">
      <Link href={`/phone/${phone.slug}`}>
        <Card className="overflow-hidden transition-colors hover:border-primary/50 hover:bg-accent cursor-pointer h-full">
          <CardContent className="p-3 flex flex-col h-full">
            <div className="aspect-square relative mb-3 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
              {imgSrc && !imgError ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imgSrc}
                  alt={phone.name}
                  className="w-full h-full object-contain p-2"
                  onError={() => setImgError(true)}
                />
              ) : (
                <Smartphone className="w-8 h-8 text-muted-foreground" />
              )}
            </div>
            <p className="text-xs font-medium leading-snug line-clamp-3 flex-1">{phone.name}</p>
          </CardContent>
        </Card>
      </Link>
      <Link
        href={`/compare?phones=${phone.slug}`}
        title="Compare"
        className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-md bg-muted/90 hover:bg-primary hover:text-primary-foreground flex items-center justify-center"
      >
        <GitCompareArrows className="w-3.5 h-3.5" />
      </Link>
    </div>
  )
}

export default function BrandPhonesClient({ brandSlug }: { brandSlug: string }) {
  const [phones, setPhones] = useState<PhoneItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/brands/${brandSlug}`)
      .then(r => r.json())
      .then(json => {
        if (!json.status) throw new Error(json.error || 'Failed')
        setPhones(json.data || [])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [brandSlug])

  const brandName = brandSlug
    .replace(/-\d+$/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <Link
          href="/brands"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          All Brands
        </Link>

        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">{brandName}</h1>
          {!loading && !error && (
            <p className="text-muted-foreground text-sm mt-1">{phones.length} devices</p>
          )}
        </div>

        {error && <p className="text-center text-destructive text-sm mt-12">{error}</p>}

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {Array.from({ length: 15 }).map((_, i) => <PhoneCardSkeleton key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {phones.map(phone => <PhoneCard key={phone.slug} phone={phone} />)}
          </div>
        )}
      </div>
    </main>
  )
}
