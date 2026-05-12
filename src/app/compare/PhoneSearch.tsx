'use client'

import { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Search, Plus, Smartphone } from 'lucide-react'

interface SearchResult {
  name: string
  slug: string
  thumbUrl?: string
  imageUrl?: string
}

interface Props {
  onAdd: (slug: string) => void
  existingSlugs: string[]
}

export default function PhoneSearch({ onAdd, existingSlugs }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/search?query=${encodeURIComponent(query.trim())}`)
        const json = await res.json()
        setResults(json.status ? (json.data ?? []) : [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutsideClick)
    return () => document.removeEventListener('mousedown', onOutsideClick)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Search phone…"
          className="pl-9 h-9 text-sm"
          autoFocus
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-muted border-t-primary rounded-full animate-spin" />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-xl shadow-2xl overflow-hidden max-h-64 overflow-y-auto">
          {results.map(r => {
            const already = existingSlugs.includes(r.slug)
            return (
              <button
                key={r.slug}
                disabled={already}
                onClick={() => {
                  if (!already) { onAdd(r.slug); setQuery(''); setOpen(false) }
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                  already
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-accent cursor-pointer'
                }`}
              >
                <div className="w-7 h-7 rounded bg-muted flex-shrink-0 flex items-center justify-center overflow-hidden">
                  {r.thumbUrl || r.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.thumbUrl || r.imageUrl}
                      alt=""
                      className="w-full h-full object-contain p-0.5"
                    />
                  ) : (
                    <Smartphone className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </div>
                <span className="flex-1 font-medium truncate text-xs">{r.name}</span>
                {!already && <Plus className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
