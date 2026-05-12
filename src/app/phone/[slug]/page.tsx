import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calendar, Ruler, Cpu, HardDrive, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { getPhoneDetails } from '@/parser/parser.phone-details'
import ImageGallery from './ImageGallery'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  try {
    const data = await getPhoneDetails(slug)
    return { title: `${data.brand} ${data.model} — Comphone` }
  } catch {
    return { title: 'Phone Details — Comphone' }
  }
}

const HIGHLIGHT_ICONS: Record<string, React.ElementType> = {
  'Released': Calendar,
  'Dimensions': Ruler,
  'OS': Cpu,
  'Storage': HardDrive,
}

export default async function PhoneDetailPage({ params }: Props) {
  const { slug } = await params

  let data: Awaited<ReturnType<typeof getPhoneDetails>>
  try {
    data = await getPhoneDetails(slug)
  } catch {
    notFound()
  }

  const highlights = [
    { label: 'Released', value: data.release_date },
    { label: 'Dimensions', value: data.dimensions },
    { label: 'OS', value: data.os },
    { label: 'Storage', value: data.storage },
  ].filter(h => h.value)

  const specCategories = Object.entries(data.specifications)

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Back navigation */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to search
        </Link>

        {/* Hero */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">

          {/* Left — image gallery */}
          <div className="max-w-sm mx-auto w-full">
            <ImageGallery
              imageUrl={data.imageUrl}
              deviceImages={data.device_images}
              colorVariants={data.picturesPageData?.colorVariants ?? []}
              phoneName={`${data.brand} ${data.model}`}
            />
          </div>

          {/* Right — info */}
          <div className="flex flex-col justify-center gap-6">
            <div>
              <p className="text-sm text-muted-foreground font-medium mb-1">{data.brand}</p>
              <h1 className="text-3xl font-bold tracking-tight leading-tight">{data.model}</h1>
            </div>

            {/* Key spec highlights */}
            {highlights.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {highlights.map(({ label, value }) => {
                  const Icon = HIGHLIGHT_ICONS[label]
                  return (
                    <div key={label} className="rounded-xl border border-border bg-card p-3">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                        {Icon && <Icon className="w-3.5 h-3.5" />}
                        {label}
                      </div>
                      <p className="text-sm font-medium leading-snug">{value}</p>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Action links */}
            <div className="flex flex-wrap gap-2">
              <a
                href={`https://www.gsmarena.com/${slug}.php`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Badge variant="outline" className="gap-1 cursor-pointer hover:bg-accent">
                  <ExternalLink className="w-3 h-3" />
                  GSMArena
                </Badge>
              </a>
              {data.review_url && (
                <a href={data.review_url} target="_blank" rel="noopener noreferrer">
                  <Badge variant="outline" className="gap-1 cursor-pointer hover:bg-accent">
                    <ExternalLink className="w-3 h-3" />
                    Review / Camera Samples
                  </Badge>
                </a>
              )}
            </div>

            {/* Sibling devices */}
            {data.siblingDeviceSlugs && data.siblingDeviceSlugs.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Related models</p>
                <div className="flex flex-wrap gap-2">
                  {data.siblingDeviceSlugs.slice(0, 6).map(s => (
                    <Link key={s} href={`/phone/${s}`}>
                      <Badge variant="secondary" className="cursor-pointer hover:bg-accent text-xs">
                        {s.replace(/-\d+$/, '').replace(/_/g, ' ')}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Full specifications */}
        {specCategories.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-6">Full Specifications</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {specCategories.map(([category, specs]) => (
                <Card key={category} className="overflow-hidden">
                  <div className="px-4 py-3 bg-muted/50 border-b border-border">
                    <h3 className="text-sm font-semibold">{category}</h3>
                  </div>
                  <CardContent className="p-0">
                    <table className="w-full text-sm">
                      <tbody>
                        {Object.entries(specs).map(([label, value]) => (
                          <tr key={label} className="border-b border-border/50 last:border-0">
                            <td className="px-4 py-2.5 text-muted-foreground font-medium w-2/5 align-top text-xs">
                              {label}
                            </td>
                            <td
                              className="px-4 py-2.5 text-xs leading-relaxed align-top [&_a]:text-primary [&_a]:underline"
                              dangerouslySetInnerHTML={{
                                __html: value.replace(/\n/g, '<br/>'),
                              }}
                            />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
