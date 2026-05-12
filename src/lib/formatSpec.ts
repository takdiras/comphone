/**
 * formatSpec.ts
 *
 * Formats raw GSMArena spec HTML values into richer typography
 * for the Chipset and CPU rows.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#\d+;/g, '')
    .replace(/&[a-z]+;/gi, '')
    .trim()
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ── Chipset formatter ─────────────────────────────────────────────────────────

/**
 * Chipset examples:
 *   "Qualcomm SM8635 Snapdragon 7s Gen 3 (4 nm)"
 *   "Apple A18 Pro (3 nm)"
 *   "MediaTek Dimensity 9400+ (3 nm)"
 *   "Samsung Exynos 2500 (3 nm)"
 */
function formatChipset(html: string): string {
  const lines = stripHtml(html)
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  return lines
    .map(line => {
      const processMatch = line.match(/\((\d+(?:\.\d+)?\s*nm)\)\s*$/i)
      const process = processMatch ? processMatch[1] : null
      const name = process ? line.slice(0, processMatch!.index).trim() : line

      if (!process) {
        return `<span class="font-semibold">${esc(name)}</span>`
      }

      return (
        `<div class="flex flex-col gap-0.5">` +
          `<span class="font-semibold">${esc(name)}</span>` +
          `<span class="inline-flex items-center gap-1">` +
            `<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">${esc(process)}</span>` +
          `</span>` +
        `</div>`
      )
    })
    .join('<div class="mt-1.5 border-t border-border/30 pt-1.5"></div>')
}

// ── CPU formatter ─────────────────────────────────────────────────────────────

interface CoreCluster {
  count: number
  freq: string   // e.g. "2.7"
  core: string   // e.g. "Cortex-A720"
}

/** Parse "1x2.7 GHz Cortex-A720" → { count:1, freq:"2.7", core:"Cortex-A720" } */
function parseCluster(segment: string): CoreCluster | null {
  // Matches: "1x2.7 GHz Cortex-A720"  or  "4x1.80GHz Cortex-A510"
  const m = segment.trim().match(
    /^(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*GHz\s+(.+)$/i
  )
  if (!m) return null
  return { count: parseInt(m[1], 10), freq: m[2].replace(/0+$/, '').replace(/\.$/, ''), core: m[3].trim() }
}

/**
 * CPU examples:
 *   "Octa-core (1x2.7 GHz Cortex-A720 & 3x2.4 GHz Cortex-A720 & 4x1.8 GHz Cortex-A520)"
 *   multi-line with " - International" / " - USA" suffixes
 */
function formatCpu(html: string): string {
  const lines = stripHtml(html)
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  return lines
    .map(line => {
      // Extract region label e.g. " - International"
      const regionMatch = line.match(/\s+-\s+([^()]+)$/)
      const region = regionMatch ? regionMatch[1].trim() : null
      const lineClean = region ? line.slice(0, regionMatch!.index).trim() : line

      // Extract prefix ("Octa-core") and cluster block "(...)"
      const blockMatch = lineClean.match(/^([^(]*?)\s*\((.+)\)\s*$/)
      const prefix = blockMatch ? blockMatch[1].trim() : ''
      const clusterBlock = blockMatch ? blockMatch[2] : lineClean

      const clusters: CoreCluster[] = clusterBlock
        .split(/\s*&\s*/)
        .map(parseCluster)
        .filter((c): c is CoreCluster => c !== null)

      if (clusters.length === 0) {
        // Fallback — unrecognised format, just return plain
        return `<span>${esc(line)}</span>`
      }

      // Pick the highest frequency cluster for the "headline" freq
      const topFreq = clusters.reduce((a, b) =>
        parseFloat(b.freq) > parseFloat(a.freq) ? b : a
      )

      const regionHtml = region
        ? `<span class="text-[10px] text-muted-foreground ml-1">${esc(region)}</span>`
        : ''

      const prefixHtml = prefix
        ? `<div class="flex items-center gap-1 mb-1">` +
            `<span class="text-[10px] text-muted-foreground">${esc(prefix)}</span>` +
            `<span class="text-[10px] font-bold text-foreground">` +
              `${esc(topFreq.freq)} GHz` +
            `</span>` +
            `<span class="text-[10px] text-muted-foreground">peak</span>` +
            regionHtml +
          `</div>`
        : ''

      const clusterRows = clusters
        .map((c, idx) => {
          const isLast = idx === clusters.length - 1
          const connector = isLast ? '└' : '├'
          return (
            `<div class="flex items-baseline gap-1.5 text-[11px]">` +
              `<span class="text-muted-foreground/50 font-mono text-[10px] select-none">${connector}</span>` +
              `<span class="text-muted-foreground text-[10px]">${c.count}×</span>` +
              `<span class="font-bold text-foreground tabular-nums">${esc(c.freq)}&thinsp;GHz</span>` +
              `<span class="text-muted-foreground text-[10px]">${esc(c.core)}</span>` +
            `</div>`
          )
        })
        .join('')

      return `<div>${prefixHtml}<div class="flex flex-col gap-0.5">${clusterRows}</div></div>`
    })
    .join('<div class="mt-2 border-t border-border/30 pt-2"></div>')
}

// ── Public API ────────────────────────────────────────────────────────────────

const FORMATTED_LABELS = new Set(['chipset', 'cpu'])

/**
 * Returns formatted HTML for a spec cell.
 * For Chipset and CPU rows, applies richer typography.
 * All other rows: just converts `\n` to `<br/>`.
 */
export function formatSpecValue(label: string, rawHtml: string): string {
  const l = label.toLowerCase()
  if (l === 'chipset') return formatChipset(rawHtml)
  if (l === 'cpu') return formatCpu(rawHtml)
  return rawHtml.replace(/\n/g, '<br/>')
}

export function isFormattedLabel(label: string): boolean {
  return FORMATTED_LABELS.has(label.toLowerCase())
}
