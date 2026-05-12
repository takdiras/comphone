import { getBrands } from '@/parser/parser.brands'
import { Card, CardContent } from '@/components/ui/card'
import { Smartphone } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Brands — Comphone' }

export default async function BrandsPage() {
  let brands: Awaited<ReturnType<typeof getBrands>> = {}
  try {
    brands = await getBrands()
  } catch {
    // render empty
  }

  const entries = Object.entries(brands).sort(([a], [b]) => a.localeCompare(b))

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Browse by Brand</h1>
          <p className="text-muted-foreground text-sm mt-1">{entries.length} brands</p>
        </div>

        {entries.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm mt-16">Could not load brands. Try again later.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {entries.map(([name, info]) => (
              <Link key={info.brand_slug} href={`/brands/${info.brand_slug}`}>
                <Card className="overflow-hidden h-full transition-colors hover:border-primary/50 hover:bg-accent cursor-pointer">
                  <CardContent className="p-4 flex flex-col items-center justify-center gap-2 text-center min-h-[90px]">
                    <Smartphone className="w-5 h-5 text-muted-foreground" />
                    <p className="text-sm font-semibold leading-snug">{name}</p>
                    <p className="text-xs text-muted-foreground">{info.device_count} devices</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
