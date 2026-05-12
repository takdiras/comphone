'use client'

import { useState, useEffect, useCallback } from 'react'
import { Camera, ExternalLink, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { type ICameraSampleCategory } from '@/types'

interface FlatImage {
  url: string
  thumbnailUrl?: string
  caption?: string
  category: string
}

function flattenImages(samples: ICameraSampleCategory[]): FlatImage[] {
  return samples.flatMap(cat =>
    cat.images.slice(0, 12).map(img => ({
      url: img.url,
      thumbnailUrl: img.thumbnailUrl,
      caption: img.caption,
      category: cat.label,
    }))
  )
}

// ── Thumbnail ─────────────────────────────────────────────────────────────────

function Thumbnail({
  img,
  index,
  onClick,
}: {
  img: FlatImage
  index: number
  onClick: () => void
}) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  return (
    <button
      onClick={onClick}
      className="relative block overflow-hidden rounded-lg bg-muted aspect-[4/3] hover:ring-2 hover:ring-primary/60 transition-all focus:outline-none focus:ring-2 focus:ring-primary"
    >
      {/* Skeleton */}
      {!loaded && !error && (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}
      {!error && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={img.thumbnailUrl || img.url}
          alt={img.caption || `${img.category} sample ${index + 1}`}
          className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => { setError(true); setLoaded(true) }}
        />
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">
          <Camera className="w-5 h-5" />
        </div>
      )}
    </button>
  )
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

function Lightbox({
  images,
  startIndex,
  onClose,
}: {
  images: FlatImage[]
  startIndex: number
  onClose: () => void
}) {
  const [current, setCurrent] = useState(startIndex)
  const [imgLoaded, setImgLoaded] = useState(false)

  const prev = useCallback(() => {
    setCurrent(i => (i - 1 + images.length) % images.length)
    setImgLoaded(false)
  }, [images.length])

  const next = useCallback(() => {
    setCurrent(i => (i + 1) % images.length)
    setImgLoaded(false)
  }, [images.length])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, prev, next])

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const img = images[current]

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white/60 uppercase tracking-wide">{img.category}</span>
          {img.caption && (
            <span className="text-xs text-white/40 hidden sm:inline">— {img.caption}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/40">{current + 1} / {images.length}</span>
          <a
            href={img.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/50 hover:text-white transition-colors"
            title="Open full size"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Image area */}
      <div
        className="flex-1 flex items-center justify-center relative px-14 py-2 min-h-0"
        onClick={e => e.stopPropagation()}
      >
        {/* Prev */}
        <button
          onClick={prev}
          className="absolute left-2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        {/* Image */}
        <div className="relative w-full h-full flex items-center justify-center">
          {!imgLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
            </div>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={img.url}
            src={img.url}
            alt={img.caption || `${img.category} sample`}
            className={`max-w-full max-h-full object-contain rounded-lg transition-opacity duration-200 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setImgLoaded(true)}
            style={{ maxHeight: 'calc(100vh - 120px)' }}
          />
        </div>

        {/* Next */}
        <button
          onClick={next}
          className="absolute right-2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* Bottom strip */}
      <div
        className="shrink-0 flex gap-1.5 overflow-x-auto px-4 py-3 scrollbar-hide"
        onClick={e => e.stopPropagation()}
      >
        {images.map((im, i) => (
          <button
            key={i}
            onClick={() => { setCurrent(i); setImgLoaded(false) }}
            className={`shrink-0 w-12 h-12 rounded overflow-hidden border-2 transition-all ${
              i === current ? 'border-white opacity-100' : 'border-transparent opacity-40 hover:opacity-70'
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={im.thumbnailUrl || im.url}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CameraSamplesGallery({
  samples,
  reviewUrl,
}: {
  samples: ICameraSampleCategory[]
  reviewUrl: string
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const allImages = flattenImages(samples)

  // Build per-category offset for lightbox index
  const categoryOffsets: Record<string, number> = {}
  let offset = 0
  for (const cat of samples) {
    categoryOffsets[cat.label] = offset
    offset += Math.min(cat.images.length, 12)
  }

  return (
    <div className="mt-12">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Camera className="w-5 h-5" />
          Camera Samples
        </h2>
        <a
          href={reviewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Full Review
        </a>
      </div>

      <div className="space-y-6">
        {samples.map(cat => (
          <div key={cat.label}>
            <h3 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
              {cat.label}
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {cat.images.slice(0, 12).map((img, i) => {
                const globalIndex = categoryOffsets[cat.label] + i
                return (
                  <Thumbnail
                    key={i}
                    img={{ ...img, category: cat.label }}
                    index={i}
                    onClick={() => setLightboxIndex(globalIndex)}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          images={allImages}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  )
}
