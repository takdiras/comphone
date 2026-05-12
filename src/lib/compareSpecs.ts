import type { IPhoneDetails } from '@/types'

export type CellHighlight = 'same' | 'diff' | 'best' | 'worst'

export interface RowComparison {
  hasDiff: boolean
  cells: CellHighlight[]
}

export interface ComparisonRow {
  label: string
  values: string[]
  comparison: RowComparison
}

export interface ComparisonCategory {
  category: string
  rows: ComparisonRow[]
}

// ── Normalization ─────────────────────────────────────────────────────────────

/** Patterns to strip irrelevant qualifiers before comparing */
const STRIP_PATTERNS: RegExp[] = [
  /\bLi-?Ion\b/gi,
  /\bLi-?Po(?:lymer)?\b/gi,
  /\bnon-?removable\b/gi,
  /\bbuilt-?in\b/gi,
  /\bapprox\.?\s*/gi,
  /\([\d.]+\s*oz\)/gi,                // "(6.35 oz)"
  /\([\d.]+\s*cm2[^)]*\)/gi,          // "(87.2 cm2, ~83.7% screen-to-body)"
  /\([\d.]+\s*in2[^)]*\)/gi,          // "(13.52 in2)"
  /~(?=\s*\d)/g,                      // leading ~ on approximate values
]

/**
 * Normalise a raw spec value for comparison:
 *  1. Strip HTML tags and decode entities
 *  2. Remove irrelevant qualifiers
 *  3. Normalise spacing between numbers and units ("12GB" → "12 gb")
 *  4. Lowercase + collapse whitespace
 */
export function normalizeSpecValue(raw: string): string {
  let s = raw
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .toLowerCase()

  for (const pat of STRIP_PATTERNS) {
    s = s.replace(pat, ' ')
  }

  // Add space between digit and unit when missing: "12gb" → "12 gb"
  s = s.replace(
    /(\d)(gb|mb|tb|mp|mah|ghz|mhz|khz|hz|w\b|nm|mm|cm|px|inch|in\b)/gi,
    '$1 $2',
  )

  // Normalise fancy quotes / dashes
  s = s.replace(/[""]/g, '"').replace(/['']/g, "'").replace(/[–—]/g, '-')

  return s.replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').trim()
}

// ── Numeric extraction ────────────────────────────────────────────────────────

/**
 * Extract the "primary" quantity from a normalised spec value, scaled to a
 * common unit so values can be compared across minor formatting differences.
 *
 * Priority matters: more specific patterns come first (GHz before Hz, TB before GB).
 */
export function extractQuantity(normalized: string): number | null {
  const patterns: [RegExp, number][] = [
    [/(\d+(?:\.\d+)?)\s*tb\b/i,            1_000_000], // TB → MB
    [/(\d+(?:\.\d+)?)\s*gb\b/i,            1_000],     // GB → MB
    [/(\d+(?:\.\d+)?)\s*mb\b/i,            1],         // MB
    [/(\d+(?:\.\d+)?)\s*mah\b/i,           1],         // mAh
    [/(\d+(?:\.\d+)?)\s*mp\b/i,            1],         // megapixels
    [/(\d+(?:\.\d+)?)\s*ghz\b/i,           1_000],     // GHz → MHz
    [/(\d+(?:\.\d+)?)\s*mhz\b/i,           1],         // MHz
    [/(\d+(?:\.\d+)?)\s*hz\b/i,            1],         // Hz (refresh rate)
    [/(\d+(?:\.\d+)?)\s*w\b/i,             1],         // Watts
    [/(\d+(?:\.\d+)?)\s*(?:inch|")/i,      10],        // inches (×10 to avoid overlap with mm)
    [/(\d+(?:\.\d+)?)\s*mm\b/i,            1],         // mm
    [/(\d+(?:\.\d+)?)\s*nit/i,             1],         // nits
    [/(\d+(?:\.\d+)?)\s*g\b/i,             1],         // grams
    [/(\d+(?:\.\d+)?)/,                    1],         // fallback: first number
  ]

  for (const [re, multiplier] of patterns) {
    const m = normalized.match(re)
    if (m) return parseFloat(m[1]) * multiplier
  }
  return null
}

// ── Higher/lower-is-better detection ─────────────────────────────────────────

const HIGHER_BETTER: RegExp[] = [
  /\bram\b/i,
  /\binternal\b|\bstorage\b/i,
  /\bbattery\b/i,
  /\bcamera\b|\bmain.*sensor\b|\bsensor size\b/i,
  /\brefresh\b/i,
  /\bcharging\b/i,
  /\bchipset\b|\bcpu\b|\bprocessor\b/i,
  /\bbrightness\b/i,
  /\bspeaker\b/i,
  /\bdisplay.*size\b|\bscreen.*size\b/i,
  /\bperformance\b/i,
  /\bbluetooth\b/i,
  /\bwi-?fi\b/i,
  /\busb\b/i,
]

const LOWER_BETTER: RegExp[] = [
  /\bweight\b/i,
  /\bthickness\b/i,
]

function direction(label: string): 'higher' | 'lower' | 'none' {
  if (HIGHER_BETTER.some(r => r.test(label))) return 'higher'
  if (LOWER_BETTER.some(r => r.test(label))) return 'lower'
  return 'none'
}

// ── Performance benchmark extractor ──────────────────────────────────────────

/**
 * Extract the best representative benchmark score from a raw performance value.
 * Priority: AnTuTu (latest version) > GeekBench > GFXBench fps > any large number.
 * Scores from different benchmark apps are scaled to be roughly comparable.
 */
function extractBestBenchmarkScore(raw: string): number | null {
  const text = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/gi, '&')
    .toLowerCase()

  // AnTuTu — try v10 first, then v9, then any version
  const antutuLine = text.match(/antutu[^\n]*/)?.[0] ?? ''
  if (antutuLine) {
    const v10 = antutuLine.match(/\|\s*([\d,]+)\s*\(v10\)/)
    if (v10) return parseInt(v10[1].replace(/,/g, ''), 10)
    const v9 = antutuLine.match(/([\d,]{5,})\s*\(v9\)/)
    if (v9) return parseInt(v9[1].replace(/,/g, ''), 10)
    const any = antutuLine.match(/([\d,]{5,})/)
    if (any) return parseInt(any[1].replace(/,/g, ''), 10)
  }

  // GeekBench — try v6 first, then v5, then any
  const geekLine = text.match(/geekbench[^\n]*/)?.[0] ?? ''
  if (geekLine) {
    const v6 = geekLine.match(/\|\s*([\d,]+)\s*\(v6\)/)
    if (v6) return parseInt(v6[1].replace(/,/g, ''), 10) * 150 // scale up to AnTuTu range
    const v5 = geekLine.match(/([\d,]+)\s*\(v5/)
    if (v5) return parseInt(v5[1].replace(/,/g, ''), 10) * 150
    const any = geekLine.match(/([\d,]+)/)
    if (any) return parseInt(any[1].replace(/,/g, ''), 10) * 150
  }

  // GFXBench fps — scale up
  const gfxLine = text.match(/gfxbench[^\n]*/)?.[0] ?? ''
  if (gfxLine) {
    const fps = gfxLine.match(/([\d,]+)\s*fps/)
    if (fps) return parseInt(fps[1].replace(/,/g, ''), 10) * 10_000
  }

  // Fallback: largest multi-digit number
  const nums = text.match(/\d{4,}/g) ?? []
  if (nums.length) return Math.max(...nums.map(n => parseInt(n, 10)))

  return null
}

// ── Missing / absent value detection ─────────────────────────────────────────

const MISSING_RE = /^(no|none|unspecified|n\/a|not\s+available|-)$/i

function isMissing(normalized: string): boolean {
  return normalized === '' || MISSING_RE.test(normalized.trim())
}

// ── Core comparison ───────────────────────────────────────────────────────────

/**
 * Compare an array of raw spec values (one per phone) for the same spec label.
 *
 * Strategy:
 *  0. Any "No" / "Unspecified" / empty → worst (unless ALL are missing → same)
 *  1. Exact text match after normalisation → all "same"
 *  2. Numeric values identical after normalisation → all "same" (catches "12 GB" vs "12GB")
 *  3. Numeric values differ + spec has a known direction → colour best/worst cells
 *  4. Otherwise → mark all as "diff" (different but no clear ranking)
 */
export function compareSpecRow(rawValues: string[], specLabel: string): RowComparison {
  const norm = rawValues.map(normalizeSpecValue)

  // All empty
  if (norm.every(v => v === '')) {
    return { hasDiff: false, cells: rawValues.map(() => 'same') }
  }

  // Missing value detection ("No", "Unspecified", empty, etc.)
  const missingFlags = norm.map(isMissing)
  if (missingFlags.some(Boolean)) {
    // All missing → no meaningful difference
    if (missingFlags.every(Boolean)) {
      return { hasDiff: false, cells: rawValues.map(() => 'same') }
    }

    // Some missing — compare non-missing phones among themselves first,
    // then slot missing ones in as 'worst'
    const nonMissingRaw = rawValues.filter((_, i) => !missingFlags[i])
    const subResult =
      nonMissingRaw.length === 1
        ? ({ hasDiff: false, cells: ['same' as CellHighlight] })
        : compareSpecRow(nonMissingRaw, specLabel) // recursive, won't re-hit missing branch

    let subIdx = 0
    const cells: CellHighlight[] = missingFlags.map(missing =>
      missing ? 'worst' : subResult.cells[subIdx++]
    )
    return { hasDiff: true, cells }
  }

  // Normalised text identical → same
  if (norm.every(v => v === norm[0])) {
    return { hasDiff: false, cells: rawValues.map(() => 'same') }
  }

  // Special path for performance benchmarks — compare best representative score
  if (/\bperformance\b/i.test(specLabel)) {
    const scores = rawValues.map(extractBestBenchmarkScore)
    if (scores.every(s => s !== null)) {
      const vals = scores as number[]
      if (new Set(vals).size === 1) {
        return { hasDiff: false, cells: rawValues.map(() => 'same') }
      }
      const max = Math.max(...vals)
      const min = Math.min(...vals)
      const cells: CellHighlight[] = vals.map(n => {
        if (n === max) return 'best'
        if (n === min) return 'worst'
        return 'diff'
      })
      return { hasDiff: true, cells }
    }
  }

  // Attempt numeric extraction
  const nums = norm.map(extractQuantity)
  const allNumeric = nums.length > 1 && nums.every(n => n !== null)

  if (allNumeric) {
    const values = nums as number[]
    const unique = new Set(values)

    // Numbers are effectively the same (different text format) → same
    if (unique.size === 1) {
      return { hasDiff: false, cells: rawValues.map(() => 'same') }
    }

    // Numbers differ — apply directional colouring if possible
    const dir = direction(specLabel)
    if (dir !== 'none') {
      const max = Math.max(...values)
      const min = Math.min(...values)
      const cells: CellHighlight[] = values.map(n => {
        if (n === max) return dir === 'higher' ? 'best' : 'worst'
        if (n === min) return dir === 'lower' ? 'best' : 'worst'
        return 'diff'
      })
      return { hasDiff: true, cells }
    }
  }

  // Values differ with no clear winner
  return { hasDiff: true, cells: rawValues.map(() => 'diff') }
}

// ── Table builder ─────────────────────────────────────────────────────────────

/** Build a full side-by-side comparison table for the given phones. */
export function buildComparisonTable(phones: IPhoneDetails[]): ComparisonCategory[] {
  // Collect category order (preserve first-seen order across all phones)
  const catOrder: string[] = []
  const catSeen = new Set<string>()
  for (const p of phones) {
    for (const cat of Object.keys(p.specifications)) {
      if (!catSeen.has(cat)) { catOrder.push(cat); catSeen.add(cat) }
    }
  }

  return catOrder.map(category => {
    // Collect label order for this category
    const labelOrder: string[] = []
    const labelSeen = new Set<string>()
    for (const p of phones) {
      for (const lbl of Object.keys(p.specifications[category] ?? {})) {
        if (!labelSeen.has(lbl)) { labelOrder.push(lbl); labelSeen.add(lbl) }
      }
    }

    const rows: ComparisonRow[] = labelOrder.map(label => {
      const values = phones.map(p => p.specifications[category]?.[label] ?? '')
      return { label, values, comparison: compareSpecRow(values, label) }
    })

    return { category, rows }
  })
}
