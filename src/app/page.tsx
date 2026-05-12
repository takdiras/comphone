'use client'

import { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, Smartphone, GitCompareArrows } from 'lucide-react'

interface SearchResult {
  name: string
  slug: string
  imageUrl?: string
  thumbUrl?: string
  detail_url: string
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

function PhoneCard({ phone }: { phone: SearchResult }) {
  const [imgError, setImgError] = useState(false)
  const imgSrc = phone.thumbUrl || phone.imageUrl

  return (
    <div className="relative group">
      <a href={`/phone/${phone.slug}`}>
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
            <p className="text-xs font-medium leading-snug line-clamp-3 flex-1">
              {phone.name}
            </p>
          </CardContent>
        </Card>
      </a>
      {/* Compare shortcut */}
      <a
        href={`/compare?phones=${phone.slug}`}
        title="Compare this phone"
        className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-md bg-muted/90 hover:bg-primary hover:text-primary-foreground flex items-center justify-center"
      >
        <GitCompareArrows className="w-3.5 h-3.5" />
      </a>
    </div>
  )
}

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setSearched(false)
      setError(null)
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      setSearched(true)
      setError(null)
      try {
        const res = await fetch(`/api/search?query=${encodeURIComponent(query.trim())}`)
        const json = await res.json()
        if (!json.status) throw new Error(json.error || 'Search failed')
        setResults(json.data || [])
      } catch (err: any) {
        setError(err.message)
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 400)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-tight mb-1.5">Comphone</h1>
          <p className="text-muted-foreground text-sm">
            Search any smartphone — powered by GSMArena
          </p>
        </div>

        {/* Search input */}
        <div className="relative max-w-2xl mx-auto mb-10">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="iPhone 16 Pro Max, Galaxy S25 Ultra, Pixel 9 Pro…"
            className="pl-9 pr-9 h-12 text-sm"
            autoFocus
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="text-center text-destructive text-sm mb-6">{error}</p>
        )}

        {/* Results count */}
        {!loading && results.length > 0 && (
          <div className="flex justify-center mb-6">
            <Badge variant="secondary">
              {results.length} result{results.length !== 1 ? 's' : ''}
            </Badge>
          </div>
        )}

        {/* Skeleton loading */}
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <PhoneCardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Results grid */}
        {!loading && results.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {results.map(phone => (
              <PhoneCard key={phone.slug} phone={phone} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {searched && !loading && !error && results.length === 0 && (
          <p className="text-center text-muted-foreground text-sm mt-12">
            No results for &ldquo;{query}&rdquo;
          </p>
        )}

        {/* Idle hint */}
        {!searched && !loading && (
          <p className="text-center text-muted-foreground/50 text-xs mt-16">
            Start typing to search over 10,000 devices
          </p>
        )}
      </div>
    </main>
  )
}
