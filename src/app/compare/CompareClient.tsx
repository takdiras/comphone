'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { X, Smartphone, ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import PhoneSearch from './PhoneSearch'
import { buildComparisonTable, type ComparisonCategory, type CellHighlight } from '@/lib/compareSpecs'
import { formatSpecValue } from '@/lib/formatSpec'
import type { IPhoneDetails } from '@/types'

const MAX_PHONES = 4

type PhoneEntry = IPhoneDetails | 'loading' | 'error'

function cellClass(h: CellHighlight): string {
  switch (h) {
    case 'best':  return 'bg-green-950/60 text-green-300'
    case 'worst': return 'bg-red-950/60 text-red-300'
    case 'diff':  return 'bg-amber-950/50 text-amber-200'
    default:      return ''
  }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CompareClient() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const slugs = (searchParams.get('phones') ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  const [phoneData, setPhoneData] = useState<Record<string, PhoneEntry>>({})
  const requestedRef = useRef<Set<string>>(new Set())
  const [showDiffOnly, setShowDiffOnly] = useState(false)

  useEffect(() => {
    for (const slug of slugs) {
      if (requestedRef.current.has(slug)) continue
      requestedRef.current.add(slug)
      setPhoneData(prev => ({ ...prev, [slug]: 'loading' }))
      fetch(`/api/phone/${slug}`)
        .then(r => r.json())
        .then(json =>
          setPhoneData(prev => ({ ...prev, [slug]: json.status ? json.data : 'error' }))
        )
        .catch(() => setPhoneData(prev => ({ ...prev, [slug]: 'error' })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slugs.join(',')])

  function updateSlugs(next: string[]) {
    if (next.length === 0) router.replace('/compare')
    else router.replace(`/compare?phones=${next.join(',')}`)
  }

  function addPhone(slug: string) {
    if (slugs.includes(slug) || slugs.length >= MAX_PHONES) return
    updateSlugs([...slugs, slug])
  }

  function removePhone(slug: string) {
    updateSlugs(slugs.filter(s => s !== slug))
  }

  const loadedPhones = slugs
    .map(s => phoneData[s])
    .filter((p): p is IPhoneDetails =>
      typeof p === 'object' && p !== null && p !== ('loading' as never) && p !== ('error' as never)
    )

  const table = loadedPhones.length >= 2 ? buildComparisonTable(loadedPhones) : null
  const diffCount = table?.reduce((acc, cat) => acc + cat.rows.filter(r => r.comparison.hasDiff).length, 0) ?? 0

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Back nav */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to search
        </Link>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Compare Phones</h1>
          {table && (
            <Badge variant="secondary">
              {diffCount} difference{diffCount !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        {/* Phone selector grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-10">
          {slugs.map(slug => (
            <PhoneSlotCard
              key={slug}
              slug={slug}
              data={phoneData[slug]}
              onRemove={() => removePhone(slug)}
            />
          ))}
          {slugs.length < MAX_PHONES && (
            <AddPhoneSlot onAdd={addPhone} existingSlugs={slugs} />
          )}
        </div>

        {/* Comparison table */}
        {table && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-lg font-semibold">Specifications</h2>
              <div className="flex items-center gap-5">
                {/* Legend */}
                <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-green-950/60 border border-green-700 inline-block" />
                    Better
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-red-950/60 border border-red-700 inline-block" />
                    Lower
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-amber-950/50 border border-amber-700 inline-block" />
                    Different
                  </span>
                </div>
                <button
                  onClick={() => setShowDiffOnly(v => !v)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-accent transition-colors"
                >
                  {showDiffOnly
                    ? <><Eye className="w-3.5 h-3.5" /> Show all</>
                    : <><EyeOff className="w-3.5 h-3.5" /> Differences only</>
                  }
                </button>
              </div>
            </div>

            <CompareTable
              table={table}
              phones={loadedPhones}
              showDiffOnly={showDiffOnly}
            />
          </>
        )}

        {slugs.length === 0 && (
          <EmptyHint message="Search and add at least 2 phones to start comparing." />
        )}
        {slugs.length === 1 && loadedPhones.length === 1 && (
          <EmptyHint
            message={`Add one more phone to compare with ${loadedPhones[0].brand} ${loadedPhones[0].model}.`}
          />
        )}
      </div>
    </main>
  )
}

// ── Phone slot card ───────────────────────────────────────────────────────────

function PhoneSlotCard({
  slug, data, onRemove,
}: {
  slug: string
  data: PhoneEntry | undefined
  onRemove: () => void
}) {
  const removeBtn = (
    <button
      onClick={onRemove}
      title="Remove"
      className="absolute top-2 right-2 w-5 h-5 rounded-full bg-muted/80 hover:bg-destructive/80 flex items-center justify-center transition-colors z-10"
    >
      <X className="w-3 h-3" />
    </button>
  )

  if (!data || data === 'loading') {
    return (
      <Card className="relative overflow-hidden">
        <CardContent className="p-3 flex flex-col gap-2">
          <Skeleton className="aspect-square w-full rounded-lg" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </CardContent>
        {removeBtn}
      </Card>
    )
  }

  if (data === 'error') {
    return (
      <Card className="relative overflow-hidden border-destructive/50">
        <CardContent className="p-3 flex flex-col items-center gap-2 text-center">
          <div className="aspect-square w-full rounded-lg bg-muted/50 flex items-center justify-center">
            <Smartphone className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-xs text-destructive">Failed to load</p>
          <p className="text-xs text-muted-foreground truncate w-full">{slug}</p>
        </CardContent>
        {removeBtn}
      </Card>
    )
  }

  const phone = data as IPhoneDetails
  const img = phone.imageUrl || phone.device_images[0]?.url

  return (
    <Card className="relative overflow-hidden">
      <Link href={`/phone/${slug}`}>
        <CardContent className="p-3 flex flex-col items-center gap-2 text-center">
          <div className="aspect-square w-full rounded-lg bg-muted flex items-center justify-center overflow-hidden">
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt={phone.model} className="w-full h-full object-contain p-3" />
            ) : (
              <Smartphone className="w-8 h-8 text-muted-foreground" />
            )}
          </div>
          <div className="w-full">
            <p className="text-xs text-muted-foreground">{phone.brand}</p>
            <p className="text-xs font-semibold leading-snug line-clamp-2">{phone.model}</p>
          </div>
        </CardContent>
      </Link>
      {removeBtn}
    </Card>
  )
}

// ── Add phone slot ────────────────────────────────────────────────────────────

function AddPhoneSlot({ onAdd, existingSlugs }: { onAdd: (s: string) => void; existingSlugs: string[] }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <Card className="overflow-hidden border-dashed border-border/50">
      <CardContent className="p-3 flex flex-col justify-center h-full min-h-[190px]">
        {!expanded ? (
          <button
            onClick={() => setExpanded(true)}
            className="flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            <div className="w-10 h-10 rounded-full border-2 border-dashed border-border flex items-center justify-center">
              <span className="text-xl font-light leading-none">+</span>
            </div>
            <span className="text-xs">Add phone</span>
          </button>
        ) : (
          <PhoneSearch onAdd={slug => { onAdd(slug); setExpanded(false) }} existingSlugs={existingSlugs} />
        )}
      </CardContent>
    </Card>
  )
}

// ── Comparison table ──────────────────────────────────────────────────────────

function CompareTable({
  table, phones, showDiffOnly,
}: {
  table: ComparisonCategory[]
  phones: IPhoneDetails[]
  showDiffOnly: boolean
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border bg-card">
            <th className="px-4 py-3 text-left font-medium text-xs text-muted-foreground sticky left-0 bg-card z-10 min-w-[130px] w-[130px] border-r border-border/30">
              Spec
            </th>
            {phones.map((p, i) => (
              <th key={i} className="px-4 py-3 text-left min-w-[180px]">
                <p className="text-xs text-muted-foreground font-normal">{p.brand}</p>
                <p className="text-sm font-semibold text-foreground leading-snug">{p.model}</p>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.map(({ category, rows }) => {
            const visibleRows = showDiffOnly ? rows.filter(r => r.comparison.hasDiff) : rows
            if (visibleRows.length === 0) return null
            return (
              <CategorySection
                key={category}
                category={category}
                rows={visibleRows}
                colSpan={phones.length + 1}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CategorySection({
  category, rows, colSpan,
}: {
  category: string
  rows: ComparisonCategory['rows']
  colSpan: number
}) {
  return (
    <>
      <tr className="bg-muted/20">
        <td
          colSpan={colSpan}
          className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-t border-b border-border"
        >
          {category === 'Tests' ? 'GSMArena Tests' : category}
        </td>
      </tr>
      {rows.map(({ label, values, comparison }) => (
        <tr
          key={label}
          className={`border-b border-border/40 last:border-0 ${comparison.hasDiff ? '' : 'opacity-50'}`}
        >
          <td className="px-4 py-2.5 text-xs text-muted-foreground font-medium align-top sticky left-0 bg-background border-r border-border/30">
            {label}
          </td>
          {values.map((val, i) => (
            <td
              key={i}
              className={`px-4 py-2.5 text-xs leading-relaxed align-top transition-colors [&_a]:text-primary [&_a]:underline ${cellClass(comparison.cells[i])}`}
              dangerouslySetInnerHTML={{ __html: formatSpecValue(label, val) }}
            />
          ))}
        </tr>
      ))}
    </>
  )
}

function EmptyHint({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
      <Smartphone className="w-12 h-12 text-muted-foreground/20" />
      <p className="text-muted-foreground text-sm max-w-xs">{message}</p>
    </div>
  )
}
