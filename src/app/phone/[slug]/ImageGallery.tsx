'use client'

import { useState } from 'react'
import { Smartphone } from 'lucide-react'

interface DeviceImage {
  color: string
  url: string
}

interface ColorVariant {
  colorName: string
  imageUrl: string
  isDefault: boolean
}

interface Props {
  imageUrl?: string
  deviceImages: DeviceImage[]
  colorVariants: ColorVariant[]
  phoneName: string
}

export default function ImageGallery({ imageUrl, deviceImages, colorVariants, phoneName }: Props) {
  const variants = colorVariants.length > 0 ? colorVariants : deviceImages.map(d => ({
    colorName: d.color,
    imageUrl: d.url,
    isDefault: false,
  }))

  const defaultImg = imageUrl || variants[0]?.imageUrl || ''
  const [active, setActive] = useState(defaultImg)
  const [imgError, setImgError] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      {/* Main image */}
      <div className="relative aspect-square rounded-2xl bg-muted flex items-center justify-center overflow-hidden border border-border">
        {active && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={active}
            src={active}
            alt={phoneName}
            className="w-full h-full object-contain p-6"
            onError={() => setImgError(true)}
          />
        ) : (
          <Smartphone className="w-20 h-20 text-muted-foreground" />
        )}
      </div>

      {/* Color picker */}
      {variants.length > 1 && (
        <div className="flex flex-wrap gap-2 justify-center">
          {variants.map((v) => (
            <button
              key={v.imageUrl}
              title={v.colorName}
              onClick={() => { setActive(v.imageUrl); setImgError(false) }}
              className={`h-8 px-3 rounded-full text-xs font-medium border transition-all ${
                active === v.imageUrl
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-muted text-muted-foreground hover:border-primary/50'
              }`}
            >
              {v.colorName}
            </button>
          ))}
        </div>
      )}

      {/* Official image strip */}
      {colorVariants.length === 0 && deviceImages.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {deviceImages.map((img) => (
            <button
              key={img.url}
              onClick={() => { setActive(img.url); setImgError(false) }}
              className={`flex-shrink-0 w-14 h-14 rounded-lg border overflow-hidden bg-muted transition-all ${
                active === img.url ? 'border-primary' : 'border-border opacity-60 hover:opacity-100'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.color} className="w-full h-full object-contain p-1" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
