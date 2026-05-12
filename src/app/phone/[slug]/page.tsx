import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calendar, Ruler, Cpu, HardDrive, ExternalLink, GitCompareArrows } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { getPhoneDetails } from '@/parser/parser.phone-details'
import { getDxoScores, type IDxoScore } from '@/parser/parser.dxomark'
import ImageGallery from './ImageGallery'
import { formatSpecValue } from '@/lib/formatSpec'

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
  let dxo: IDxoScore | null = null
  try {
    const dxoName = slug.replace(/-\d+$/, '').replace(/_/g, ' ')
    const [detailsResult, dxoResult] = await Promise.allSettled([
      getPhoneDetails(slug),
      getDxoScores(dxoName),
    ])
    if (detailsResult.status === 'rejected') notFound()
    data = (detailsResult as PromiseFulfilledResult<Awaited<ReturnType<typeof getPhoneDetails>>>).value
    if (dxoResult.status === 'fulfilled') dxo = dxoResult.value
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
              <Link href={`/compare?phones=${slug}`}>
                <Badge variant="secondary" className="gap-1 cursor-pointer hover:bg-accent">
                  <GitCompareArrows className="w-3 h-3" />
                  Compare
                </Badge>
              </Link>
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

        {/* DXOMark Camera Score */}
        {dxo && dxo._source !== 'failed' && !dxo.noCameraReview && (
          <DxoMarkSection dxo={dxo} />
        )}

        {/* Full specifications */}
        {specCategories.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-6">Full Specifications</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {specCategories.map(([category, specs]) => (
                <Card key={category} className="overflow-hidden">
                  <div className="px-4 py-3 bg-muted/50 border-b border-border">
                    <h3 className="text-sm font-semibold">{category === 'Tests' ? 'GSMArena Tests' : category}</h3>
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
                                __html: formatSpecValue(label, value),
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

// ── DXOMark Camera Score section ──────────────────────────────────────────────

function DxoMarkSection({ dxo }: { dxo: IDxoScore }) {
  const subScores: { label: string; value: number | null }[] = [
    { label: 'Photo',  value: dxo.scores.photo },
    { label: 'Video',  value: dxo.scores.video },
    { label: 'Zoom',   value: dxo.scores.zoom },
    { label: 'Bokeh',  value: dxo.scores.bokeh },
    { label: 'Selfie', value: dxo.scores.selfie },
    { label: 'Audio',  value: dxo.scores.audio },
  ].filter(s => s.value !== null)

  return (
    <div className="mb-12">
      <Card className="overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 bg-muted/50 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold">DXOMark Camera Score</h2>
          <div className="flex items-center gap-2">
            {dxo.rankLabel && (
              <Badge variant="secondary" className="text-xs">{dxo.rankLabel}</Badge>
            )}
            <a
              href={dxo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="View on DXOMark"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>

        <CardContent className="p-5">
          <div className="flex flex-wrap items-start gap-6">
            {/* Overall score circle */}
            {dxo.overallScore !== null && (
              <div className="flex flex-col items-center gap-1.5 shrink-0">
                <div className="w-20 h-20 rounded-full border-4 border-primary/70 flex items-center justify-center">
                  <span className="text-2xl font-bold">{dxo.overallScore}</span>
                </div>
                <span className="text-xs text-muted-foreground">Overall</span>
              </div>
            )}

            {/* Sub-score chips */}
            {subScores.length > 0 && (
              <div className="flex flex-wrap gap-2 flex-1">
                {subScores.map(({ label, value }) => (
                  <div
                    key={label}
                    className="flex flex-col items-center rounded-lg border border-border bg-card px-3 py-2 min-w-[60px]"
                  >
                    <span className="text-base font-semibold">{value}</span>
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Strengths & weaknesses */}
          {(dxo.strengths.length > 0 || dxo.weaknesses.length > 0) && (
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {dxo.strengths.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Strengths</p>
                  <ul className="space-y-1">
                    {dxo.strengths.slice(0, 4).map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs">
                        <span className="text-green-400 font-bold mt-px">+</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {dxo.weaknesses.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Weaknesses</p>
                  <ul className="space-y-1">
                    {dxo.weaknesses.slice(0, 4).map((w, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs">
                        <span className="text-red-400 font-bold mt-px">−</span>
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
