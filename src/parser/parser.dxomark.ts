/**
 * parser.dxomark.ts
 *
 * URL pattern:
 *   https://www.dxomark.com/smartphones/{Brand}/{Model-With-Dashes}
 *   e.g. https://www.dxomark.com/smartphones/Samsung/Galaxy-S25-Ultra
 *
 * Tiered scraping strategy:
 *   Tier 1 — __NEXT_DATA__ JSON blob (SSR / Next.js)
 *   Tier 2 — GraphQL endpoint
 *   Tier 3 — HTML heuristic fallback
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { cacheGet, cacheSet } from '../cache';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface IDxoScore {
  device: string;
  url: string;
  overallScore: number | null;
  scores: {
    photo: number | null;
    video: number | null;
    audio: number | null;
    display: number | null;
    zoom: number | null;
    bokeh: number | null;
    lowLight: number | null;
    selfie: number | null;
    portrait: number | null;
    photoMain: number | null;
    photoUltraWide: number | null;
    photoTele: number | null;
    videoMain: number | null;
    videoUltraWide: number | null;
    videoTele: number | null;
  };
  strengths: string[];
  weaknesses: string[];
  rankLabel: string | null;
  rankPosition: number | null;
  rankSegment: string | null;
  labelType: string | null;
  labelYear: string | null;
  /** True when the page is a display-only review with no camera scoring */
  noCameraReview?: boolean;
  scoreType?: 'camera' | 'display' | 'unknown';
  scrapedAt: string;
  _source: 'next_data' | 'graphql' | 'html' | 'failed';
  /** Populated only when the initial HTTP fetch fails */
  _fetchError?: string;
}

export interface IDxoSearchResult {
  name: string;
  url: string;
  score: number | null;
}

export interface IDxoSampleImage {
  category: string;
  url: string;
  caption: string | null;
}

export interface IDxoReview {
  device: string;
  reviewUrl: string;
  overallScore: number | null;
  rankPosition: number | null;
  rankLabel: string | null;
  cameraSpecs: string[];
  scores: ReviewScores;
  bestScores: ReviewScores;
  pros: string[];
  cons: string[];
  sampleImages: IDxoSampleImage[];
  sampleCount: number;
  scrapedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal types — strict shapes for GraphQL and __NEXT_DATA__ responses
// ─────────────────────────────────────────────────────────────────────────────

interface ReviewScores {
  photo: number | null;
  photoMain: number | null;
  photoBokeh: number | null;
  photoUltraWide: number | null;
  photoTele: number | null;
  video: number | null;
  videoMain: number | null;
  videoUltraWide: number | null;
  videoTele: number | null;
}

/** Flat sub-score map used inside parseHtmlFallback */
type HtmlScoreMap = ReviewScores;

/** Shape of the WordPress GraphQL post.dxomarkFields fragment */
interface GqlDxomarkFields {
  score?: unknown;
  photoScore?: unknown;
  videoScore?: unknown;
  audioScore?: unknown;
  displayScore?: unknown;
  rankingPosition?: unknown;
  pros?: Array<{ content?: string } | string>;
  cons?: Array<{ content?: string } | string>;
}

interface GqlPost {
  title?: string;
  dxomarkFields?: GqlDxomarkFields;
}

interface GqlDeviceScores {
  photo?: unknown;
  video?: unknown;
  zoom?: unknown;
  bokeh?: unknown;
  lowlight?: unknown;
  selfie?: unknown;
}

interface GqlDevice {
  name?: string;
  score?: unknown;
  scores?: GqlDeviceScores;
  rankingPosition?: unknown;
  pros?: Array<{ content?: string } | string>;
  cons?: Array<{ content?: string } | string>;
}

interface GqlResponseData {
  post?: GqlPost;
  device?: GqlDevice;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DXO_BASE = 'https://www.dxomark.com';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
};

const JSON_HEADERS = {
  'User-Agent': HEADERS['User-Agent'],
  'Accept': 'application/json, */*',
  'Origin': DXO_BASE,
  'Referer': DXO_BASE + '/',
};

// ─────────────────────────────────────────────────────────────────────────────
// Brand tables
// Multi-word sub-brand entries MUST appear before their single-word parents
// so the longest-match scan wins.
// ─────────────────────────────────────────────────────────────────────────────

const KNOWN_BRANDS: readonly string[] = [
  // Multi-word — compound sub-brands first
  'Google Pixel',
  'Xiaomi Poco',
  'Xiaomi Redmi',
  'Vivo iQOO',
  'Samsung Galaxy',
  'Apple iPhone',
  'Asus ROG',
  'Asus Zenfone',
  'ZTE Nubia',
  'Lenovo Legion',
  'Lenovo Tab',
  // Single-word brands
  'Nothing',
  'OnePlus',
  'BlackBerry',
  'Motorola',
  'Lenovo',
  'Huawei',
  'Honor',
  'Xiaomi',
  'Samsung',
  'Apple',
  'Google',
  'Oppo',
  'Vivo',
  'Realme',
  'Nokia',
  'Asus',
  'Sony',
  'ZTE',
  'HTC',
  'Meizu',
  'Infinix',
  'Tecno',
  'Itel',
  'TCL',
  'Lava',
  'Sharp',
  'Nubia',
  'Pixel',
  'iQOO',
  'Poco',
  'Redmi',
  'BlackView',
  'Ulefone',
  'Doogee',
  'Oukitel',
];

/**
 * Maps a KNOWN_BRANDS entry to the brand slug and optional model prefix
 * that DXOMark actually uses in its /smartphones/{brand}/{model} URLs.
 */
const DXO_BRAND_MAP: Record<string, { brand: string; modelPrefix?: string }> = {
  'Google Pixel': { brand: 'Google', modelPrefix: 'Pixel' },
  'Pixel':        { brand: 'Google', modelPrefix: 'Pixel' },
  'Xiaomi Poco':  { brand: 'Xiaomi', modelPrefix: 'Poco' },
  'Xiaomi Redmi': { brand: 'Xiaomi', modelPrefix: 'Redmi' },
  'Vivo iQOO':    { brand: 'Vivo',   modelPrefix: 'iQOO' },
  'Samsung Galaxy': { brand: 'Samsung', modelPrefix: 'Galaxy' },
  'Apple iPhone':   { brand: 'Apple',   modelPrefix: 'iPhone' },
  'Asus ROG':       { brand: 'Asus',    modelPrefix: 'ROG' },
  'Asus Zenfone':   { brand: 'Asus',    modelPrefix: 'Zenfone' },
  'ZTE Nubia':      { brand: 'ZTE',     modelPrefix: 'Nubia' },
  'Lenovo Legion':  { brand: 'Lenovo',  modelPrefix: 'Legion' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Small utilities
// ─────────────────────────────────────────────────────────────────────────────

async function getDxoHtml(url: string): Promise<string> {
  const { data } = await axios.get<unknown>(url, {
    headers: HEADERS,
    timeout: 15000,
    maxRedirects: 5,
  });
  return typeof data === 'string' ? data : JSON.stringify(data);
}

function safeInt(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const n = typeof val === 'number' ? val : parseInt(String(val), 10);
  return isNaN(n) ? null : n;
}

function deepFind(obj: unknown, key: string, depth = 10): unknown {
  if (depth <= 0 || !obj || typeof obj !== 'object') return undefined;
  const record = obj as Record<string, unknown>;
  if (key in record) return record[key];
  for (const v of Object.values(record)) {
    const r = deepFind(v, key, depth - 1);
    if (r !== undefined) return r;
  }
  return undefined;
}

function deepCollect(obj: unknown, key: string, depth = 10): unknown[] {
  if (depth <= 0 || !obj || typeof obj !== 'object') return [];
  const record = obj as Record<string, unknown>;
  const out: unknown[] = [];
  if (key in record) out.push(record[key]);
  for (const v of Object.values(record)) out.push(...deepCollect(v, key, depth - 1));
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Brand / model splitter
// ─────────────────────────────────────────────────────────────────────────────

function splitBrandModel(deviceName: string): { brand: string; model: string } {
  const name = deviceName.trim();
  const lower = name.toLowerCase();

  // Sort longest-first so multi-word brands always win
  const sorted = [...KNOWN_BRANDS].sort((a, b) => b.length - a.length);

  for (const knownBrand of sorted) {
    if (!lower.startsWith(knownBrand.toLowerCase())) continue;
    const rest = name.slice(knownBrand.length).trim();
    if (!rest) continue;

    const mapping = DXO_BRAND_MAP[knownBrand];
    if (mapping) {
      const model = mapping.modelPrefix ? `${mapping.modelPrefix} ${rest}` : rest;
      return { brand: mapping.brand, model };
    }
    return { brand: knownBrand, model: rest };
  }

  // Generic fallback — first word is brand
  const parts = name.split(' ');
  const brand = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  return { brand, model: parts.slice(1).join(' ') };
}

// ─────────────────────────────────────────────────────────────────────────────
// URL builder
// ─────────────────────────────────────────────────────────────────────────────

function buildDxoUrl(brand: string, model: string): string {
  const modelSlug = model
    .trim()
    .split(/\s+/)
    .map(w => (w.toLowerCase() === 'iphone' ? 'iPhone' : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('-');
  return `${DXO_BASE}/smartphones/${brand}/${modelSlug}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER 1 — __NEXT_DATA__ (Next.js SSR JSON)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Coerce an unknown value from __NEXT_DATA__ into a string array of meaningful
 * text items. Handles nested arrays and objects with common text-field names.
 */
function toStringArray(vals: unknown[]): string[] {
  const out: string[] = [];
  for (const v of vals) {
    if (Array.isArray(v)) {
      for (const x of v as unknown[]) {
        const t =
          typeof x === 'string'
            ? x
            : (x as Record<string, unknown>)?.text?.toString() ||
              (x as Record<string, unknown>)?.content?.toString() ||
              (x as Record<string, unknown>)?.title?.toString() ||
              (x as Record<string, unknown>)?.label?.toString() ||
              '';
        if (t.length > 3) out.push(t.trim());
      }
    } else if (typeof v === 'string' && v.length > 3) {
      out.push(v.trim());
    }
  }
  return out;
}

function parseNextData(html: string, pageUrl: string): IDxoScore | null {
  const $ = cheerio.load(html);
  const raw = $('script#__NEXT_DATA__').html();
  if (!raw) return null;

  let nd: unknown;
  try { nd = JSON.parse(raw); } catch { return null; }

  // Use `unknown` + explicit cast rather than `any` throughout
  const pp = (nd as Record<string, unknown>)?.props as Record<string, unknown> | undefined;
  const pageProps: Record<string, unknown> = (pp?.pageProps as Record<string, unknown>) ?? {};

  // Overall score
  const OVERALL_KEYS = ['score', 'totalScore', 'overallScore', 'dxomarkScore', 'global_score', 'rankingScore'];
  let overallScore: number | null = null;
  for (const k of OVERALL_KEYS) {
    const v = safeInt(deepFind(pageProps, k));
    if (v && v >= 50 && v <= 200) { overallScore = v; break; }
  }

  // Device name
  const device = String(
    deepFind(pageProps, 'deviceName') ??
    deepFind(pageProps, 'productName') ??
    deepFind(pageProps, 'name') ??
    deepFind(pageProps, 'title') ??
    $('meta[property="og:title"]').attr('content') ??
    ''
  ).replace(/\s*[\|–\-]\s*DXO.*$/i, '').trim();

  // Sub-scores
  const SCORE_ALIASES: Record<string, string[]> = {
    photo:    ['photo', 'photoScore', 'photo_score'],
    video:    ['video', 'videoScore', 'video_score'],
    audio:    ['audio', 'audioScore', 'audio_score'],
    display:  ['display', 'displayScore', 'display_score'],
    zoom:     ['zoom', 'zoomScore', 'telephoto', 'telephotoScore'],
    bokeh:    ['bokeh', 'bokehScore', 'portrait'],
    lowLight: ['lowlight', 'low_light', 'lowLight', 'night', 'nightScore'],
    selfie:   ['selfie', 'selfieScore', 'front', 'frontScore'],
  };

  type PartialScores = Pick<IDxoScore['scores'], 'photo' | 'video' | 'audio' | 'display' | 'zoom' | 'bokeh' | 'lowLight' | 'selfie'>;
  const scores: PartialScores = {
    photo: null, video: null, audio: null, display: null,
    zoom: null, bokeh: null, lowLight: null, selfie: null,
  };

  for (const [field, aliases] of Object.entries(SCORE_ALIASES)) {
    for (const alias of aliases) {
      const found = deepFind(pageProps, alias);
      const coerced = found !== null && typeof found === 'object'
        ? ((found as Record<string, unknown>).value ?? (found as Record<string, unknown>).score ?? null)
        : found;
      const v = safeInt(coerced);
      if (v && v >= 10 && v <= 200) {
        (scores as Record<string, number | null>)[field] = v;
        break;
      }
    }
  }

  // Strengths / weaknesses
  const PROS_KEYS = ['pros', 'strengths', 'advantages', 'positives', 'highlights', 'good'];
  const CONS_KEYS = ['cons', 'weaknesses', 'disadvantages', 'negatives', 'drawbacks', 'bad'];
  const strengths = toStringArray(PROS_KEYS.flatMap(k => deepCollect(pageProps, k)));
  const weaknesses = toStringArray(CONS_KEYS.flatMap(k => deepCollect(pageProps, k)));

  // Rank
  let rankPosition: number | null = null;
  let rankLabel: string | null = null;
  const rankRaw = deepFind(pageProps, 'rankingPosition') ?? deepFind(pageProps, 'rank') ?? deepFind(pageProps, 'ranking');
  if (rankRaw !== undefined) {
    rankPosition = safeInt(
      typeof rankRaw === 'object' && rankRaw !== null
        ? ((rankRaw as Record<string, unknown>).position ?? (rankRaw as Record<string, unknown>).value)
        : rankRaw
    );
    if (rankPosition) rankLabel = `#${rankPosition} Best Smartphone Camera`;
  }

  if (!overallScore && !scores.photo && !scores.video && strengths.length === 0) return null;

  return {
    device,
    url: pageUrl,
    overallScore,
    scores: {
      ...scores,
      portrait: null,
      photoMain: null, photoUltraWide: null, photoTele: null,
      videoMain: null, videoUltraWide: null, videoTele: null,
    },
    strengths: [...new Set(strengths)].slice(0, 12),
    weaknesses: [...new Set(weaknesses)].slice(0, 12),
    rankLabel, rankPosition,
    rankSegment: null, labelType: null, labelYear: null,
    scrapedAt: new Date().toISOString(),
    _source: 'next_data',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER 2 — GraphQL
// ─────────────────────────────────────────────────────────────────────────────

function gqlProsConsToStrings(items: Array<{ content?: string } | string> | undefined): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map(x => (typeof x === 'string' ? x : x?.content ?? ''))
    .filter(Boolean)
    .slice(0, 12);
}

async function queryGraphQL(brand: string, model: string, pageUrl: string): Promise<IDxoScore | null> {
  const queries: Array<{ query: string; vars: Record<string, string> }> = [
    {
      query: `query($slug:String!){post(id:$slug,idType:SLUG){title dxomarkFields{score photoScore videoScore audioScore displayScore rankingPosition pros{content} cons{content}}}}`,
      vars: { slug: `${brand.toLowerCase()}-${model.toLowerCase().replace(/\s+/g, '-')}` },
    },
    {
      query: `query($brand:String!,$model:String!){device(brand:$brand,model:$model){name score scores{photo video zoom bokeh lowlight selfie} pros cons rankingPosition}}`,
      vars: { brand, model },
    },
  ];

  for (const { query, vars } of queries) {
    try {
      const resp = await axios.post<{ data?: GqlResponseData }>(
        `${DXO_BASE}/graphql`,
        { query, variables: vars },
        { headers: { ...JSON_HEADERS, 'Content-Type': 'application/json' }, timeout: 10000 },
      );
      const gqlData = resp.data?.data;
      if (!gqlData) continue;

      // Shape 1 — post.dxomarkFields
      if (gqlData.post?.dxomarkFields) {
        const f = gqlData.post.dxomarkFields;
        const rank = safeInt(f.rankingPosition);
        return {
          device: gqlData.post.title ?? `${brand} ${model}`,
          url: pageUrl,
          overallScore: safeInt(f.score),
          scores: {
            photo: safeInt(f.photoScore), video: safeInt(f.videoScore),
            audio: safeInt(f.audioScore), display: safeInt(f.displayScore),
            zoom: null, bokeh: null, lowLight: null, selfie: null, portrait: null,
            photoMain: null, photoUltraWide: null, photoTele: null,
            videoMain: null, videoUltraWide: null, videoTele: null,
          },
          strengths: gqlProsConsToStrings(f.pros),
          weaknesses: gqlProsConsToStrings(f.cons),
          rankLabel: rank ? `#${rank} Best Smartphone Camera` : null,
          rankPosition: rank,
          rankSegment: null, labelType: null, labelYear: null,
          scrapedAt: new Date().toISOString(),
          _source: 'graphql',
        };
      }

      // Shape 2 — device{}
      if (gqlData.device) {
        const dev = gqlData.device;
        const s = dev.scores ?? {};
        const rank = safeInt(dev.rankingPosition);
        return {
          device: dev.name ?? `${brand} ${model}`,
          url: pageUrl,
          overallScore: safeInt(dev.score),
          scores: {
            photo: safeInt(s.photo), video: safeInt(s.video),
            audio: null, display: null,
            zoom: safeInt(s.zoom), bokeh: safeInt(s.bokeh),
            lowLight: safeInt(s.lowlight), selfie: safeInt(s.selfie), portrait: null,
            photoMain: null, photoUltraWide: null, photoTele: null,
            videoMain: null, videoUltraWide: null, videoTele: null,
          },
          strengths: gqlProsConsToStrings(dev.pros),
          weaknesses: gqlProsConsToStrings(dev.cons),
          rankLabel: rank ? `#${rank} Best Smartphone Camera` : null,
          rankPosition: rank,
          rankSegment: null, labelType: null, labelYear: null,
          scrapedAt: new Date().toISOString(),
          _source: 'graphql',
        };
      }
    } catch { /* try next query shape */ }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER 3 — HTML fallback helpers
// ─────────────────────────────────────────────────────────────────────────────

// All regex constants for the HTML parser in one place — easy to update if
// DXOMark renames their sections.
const HTML_REGEXES = {
  infoIconSuffix:   /\s*i\s*$/,
  pureNumber:       /^\d+$/,
  topSectionReset:  /^(use cases|specifications|pricing|summary)$/i,
  labelPhoto:       /^photo$/i,
  labelVideo:       /^video$/i,
  labelMain:        /^main$/i,
  labelUltraWide:   /^(ultra.?wide|ultrawide)$/i,
  labelTele:        /^tele$/i,
  labelBokeh:       /^bokeh$/i,
  // Boundary: a token that marks the end of a score-lookahead window
  scoreSectionBoundary: /^(photo|video|bokeh|main|ultra.?wide|tele|use cases|scoring|overview)$/i,
  bestMarker:       /best:/i,
  bestParenScore:   /\((\d{2,3})\)/,
  ordinal:          /(\d+)(st|nd|rd|th)/i,
  yearStandalone:   /^20\d\d$/,
  prosHeader:       /^pros$/i,
  consHeader:       /^cons$/i,
  sectionBreaker:   /^(overview|test summary|use cases|scoring|conclusion|about dxomark)/i,
  navItem:          /^(our label|our company|our partners|smart choice label|expert committee|how we test|b2b solutions|contact us?|glossary|press relations|join us|rankings|reviews|about|articles|insights|smartphones|cameras|speakers|laptops|wireless speakers|camera sensors|camera lenses|test results|best of|tech articles|custom ranking|b2b|english|français|中文)$/i,
  spatialTemporal:  /^(spatial|temporal)\s*noise$/i,
  unitOnlyLabel:    /^\d+\s*(lux|k|ev|db|fps)$/i,
};

/**
 * Build a flat list of leaf-node text items from the entire DOM.
 * Used by the score-extraction pass.
 */
function buildTextList($: cheerio.CheerioAPI): string[] {
  const items: string[] = [];
  $('h1,h2,h3,h4,h5,p,span,div,td,li,a').each((_, el) => {
    const txt = $(el).clone().children().remove().end().text().trim();
    if (txt.length > 0 && txt.length < 300) items.push(txt);
  });
  return items;
}

/**
 * Scan forward from position `start` in `allText` until we hit a recognised
 * section boundary token, returning the first valid score integer found.
 * Uses a boundary condition instead of a hardcoded lookahead distance.
 */
function nextScoreUntilBoundary(allText: string[], start: number): number | null {
  for (let j = start + 1; j < allText.length; j++) {
    const raw = allText[j];
    const clean = raw.replace(HTML_REGEXES.infoIconSuffix, '').trim();
    // Stop at the next recognised section heading
    if (HTML_REGEXES.scoreSectionBoundary.test(clean)) break;
    // Skip "BEST …" lines
    if (HTML_REGEXES.bestMarker.test(raw)) break;
    // Skip lines with mixed letters (device names, labels)
    if (/[a-zA-Z]/.test(raw) && !HTML_REGEXES.pureNumber.test(raw.replace(/\D/g, ''))) continue;
    const n = parseInt(raw.replace(/\D/g, ''), 10);
    if (!isNaN(n) && n >= 50 && n <= 200) return n;
  }
  return null;
}

/**
 * Advance forward from `start` collecting both the device score and the
 * best-in-class score for a given sub-score field.
 * Stops at the next section boundary.
 */
function getScorePairUntilBoundary(
  allText: string[],
  start: number,
  scores: HtmlScoreMap,
  bestScores: HtmlScoreMap,
  field: keyof HtmlScoreMap,
): void {
  let scoreFound = false;
  for (let j = start + 1; j < allText.length; j++) {
    const raw = allText[j];
    const clean = raw.replace(HTML_REGEXES.infoIconSuffix, '').trim();
    if (HTML_REGEXES.scoreSectionBoundary.test(clean)) break;

    if (HTML_REGEXES.bestMarker.test(raw)) {
      const m = raw.match(HTML_REGEXES.bestParenScore);
      if (m && bestScores[field] === null) bestScores[field] = parseInt(m[1], 10);
      break;
    }
    const v = parseInt(raw.replace(/\D/g, ''), 10);
    if (!isNaN(v) && v >= 50 && v <= 200 && HTML_REGEXES.pureNumber.test(raw.trim())) {
      if (!scoreFound && scores[field] === null) { scores[field] = v; scoreFound = true; }
      else if (scoreFound && bestScores[field] === null) { bestScores[field] = v; break; }
    }
  }
}

/** Extract strengths and weaknesses from the Tier-3 HTML document. */
function extractProsConsFromHtml($: cheerio.CheerioAPI): { strengths: string[]; weaknesses: string[] } {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  let currentSection: 'pros' | 'cons' | '' = '';

  $('h4, li').each((_, el) => {
    const tag = (el as cheerio.Element).name;
    const txt = $(el).text().trim();
    if (tag === 'h4') {
      if (HTML_REGEXES.prosHeader.test(txt)) currentSection = 'pros';
      else if (HTML_REGEXES.consHeader.test(txt)) currentSection = 'cons';
      else currentSection = '';
      return;
    }
    if (tag === 'li' && txt.length > 5) {
      if (currentSection === 'pros') strengths.push(txt);
      else if (currentSection === 'cons') weaknesses.push(txt);
    }
  });

  return { strengths, weaknesses };
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER 3 — HTML fallback (primary for many live pages)
// ─────────────────────────────────────────────────────────────────────────────

function parseHtmlFallback(html: string, pageUrl: string, brand: string, model: string): IDxoScore {
  const $ = cheerio.load(html);

  const device =
    $('title').first().text().replace(/\s*[-–|]\s*DXOMARK\s*$/i, '').trim() ||
    $('h1').first().text().trim() ||
    `${brand} ${model}`;

  // ── Score type detection ───────────────────────────────────────────────────
  const pageText = $('body').text().toLowerCase();
  const hasCameraTab =
    pageText.includes('overall camera score') ||
    $('a[href*="sort-camera"]').length > 0 ||
    /\d+\s*\n?\s*camera/i.test($('body').text());
  const hasDisplayOnly =
    !hasCameraTab &&
    (pageText.includes('overall display score') || $('a[href*="sort-display"]').length > 0);

  // ── Overall score ──────────────────────────────────────────────────────────
  let overallScore: number | null = null;

  let inCameraSection = false;
  $('*').each((_, el) => {
    if (overallScore && !inCameraSection) return false;
    const txt = $(el).clone().children().remove().end().text().trim();
    if (txt === 'Overall Camera Score') { inCameraSection = true; return; }
    if (txt === 'Overall Display Score') { inCameraSection = false; return; }
    if (inCameraSection && !overallScore) {
      const n = parseInt(txt, 10);
      if (!isNaN(n) && n >= 50 && n <= 200 && txt === String(n)) overallScore = n;
    }
  });

  if (!overallScore) {
    $('*').each((_, el) => {
      if (overallScore) return false;
      if ($(el).children().length > 0) return;
      const txt = $(el).text().trim();
      const n = parseInt(txt, 10);
      if (!isNaN(n) && n >= 50 && n <= 200 && txt === String(n)) overallScore = n;
    });
  }

  // ── Sub-scores ─────────────────────────────────────────────────────────────
  const scores: HtmlScoreMap = {
    photo: null, photoMain: null, photoBokeh: null,
    photoUltraWide: null, photoTele: null,
    video: null, videoMain: null,
    videoUltraWide: null, videoTele: null,
  };
  const bestScores: HtmlScoreMap = { ...scores };

  const allText = buildTextList($);
  let photoSection = false;
  let videoSection = false;

  const TOP_LABELS: Array<[RegExp, keyof HtmlScoreMap]> = [
    [HTML_REGEXES.labelPhoto, 'photo'],
    [HTML_REGEXES.labelVideo, 'video'],
    [HTML_REGEXES.labelBokeh, 'photoBokeh'],
  ];

  type SubKey = 'main' | 'ultrawide' | 'tele';
  const SUB_LABELS: Array<[RegExp, SubKey]> = [
    [HTML_REGEXES.labelMain, 'main'],
    [HTML_REGEXES.labelUltraWide, 'ultrawide'],
    [HTML_REGEXES.labelTele, 'tele'],
  ];

  for (let i = 0; i < allText.length; i++) {
    const label = allText[i].replace(HTML_REGEXES.infoIconSuffix, '').trim();

    // Track context
    if (HTML_REGEXES.labelPhoto.test(label)) { photoSection = true; videoSection = false; }
    if (HTML_REGEXES.labelVideo.test(label)) { videoSection = true; photoSection = false; }
    if (HTML_REGEXES.topSectionReset.test(label)) { photoSection = false; videoSection = false; }

    // Top-level scores
    for (const [regex, field] of TOP_LABELS) {
      if (regex.test(label) && scores[field] === null) {
        getScorePairUntilBoundary(allText, i, scores, bestScores, field);
        break;
      }
    }

    // Sub-scores — context-dependent
    for (const [regex, subKey] of SUB_LABELS) {
      if (!regex.test(label)) continue;
      if (subKey === 'main') {
        if (photoSection && !scores.photoMain)
          getScorePairUntilBoundary(allText, i, scores, bestScores, 'photoMain');
        else if (videoSection && !scores.videoMain)
          getScorePairUntilBoundary(allText, i, scores, bestScores, 'videoMain');
      } else if (subKey === 'ultrawide') {
        if (photoSection && !scores.photoUltraWide)
          getScorePairUntilBoundary(allText, i, scores, bestScores, 'photoUltraWide');
        else if (videoSection && !scores.videoUltraWide)
          getScorePairUntilBoundary(allText, i, scores, bestScores, 'videoUltraWide');
      } else if (subKey === 'tele') {
        if (photoSection && !scores.photoTele)
          getScorePairUntilBoundary(allText, i, scores, bestScores, 'photoTele');
        else if (videoSection && !scores.videoTele)
          getScorePairUntilBoundary(allText, i, scores, bestScores, 'videoTele');
      }
      break;
    }
  }

  // ── Pros / Cons ────────────────────────────────────────────────────────────
  const { strengths, weaknesses } = extractProsConsFromHtml($);

  // ── Rankings ───────────────────────────────────────────────────────────────
  let rankPosition: number | null = null;
  let rankLabel: string | null = null;
  let rankSegment: string | null = null;

  $('a[href*="sort-camera"]').each((_, el) => {
    const linkText = $(el).text().trim();
    const isGlobal = linkText.includes('Global Ranking');
    const isSegment = linkText.includes('Ranking') && !isGlobal;

    let ancestor = $(el).parent();
    for (let depth = 0; depth < 5; depth++) {
      const m = ancestor.text().trim().match(HTML_REGEXES.ordinal);
      if (m) {
        const pos = parseInt(m[1], 10);
        if (isGlobal && !rankPosition) { rankPosition = pos; rankLabel = `#${pos} in Global Ranking`; }
        if (isSegment && !rankSegment) rankSegment = `#${pos} in ${linkText}`;
        break;
      }
      ancestor = ancestor.parent();
    }
  });

  if (!rankPosition) {
    const m = $('body').text().match(/(\d+)(st|nd|rd|th)\s+in\s+Global Ranking/i);
    if (m) { rankPosition = parseInt(m[1], 10); rankLabel = `#${rankPosition} in Global Ranking`; }
  }

  // ── Label type (inferred from score thresholds) ────────────────────────────
  let labelType: string | null = null;
  if (overallScore !== null) {
    if (overallScore >= 140)     labelType = 'GOLD';
    else if (overallScore >= 120) labelType = 'SILVER';
    else if (overallScore >= 100) labelType = 'BRONZE';
    else if (overallScore >= 80)  labelType = 'RECOMMENDED';
  }

  // ── Year ───────────────────────────────────────────────────────────────────
  let labelYear: string | null = null;
  $('*').each((_, el) => {
    if (labelYear) return false;
    if ($(el).children().length > 0) return;
    const txt = $(el).text().trim();
    if (HTML_REGEXES.yearStandalone.test(txt)) labelYear = txt;
  });

  return {
    device, url: pageUrl,
    scoreType: hasCameraTab ? 'camera' : (hasDisplayOnly ? 'display' : 'unknown'),
    noCameraReview: !hasCameraTab,
    overallScore,
    scores: {
      photo: scores.photo,
      video: scores.video,
      audio: null,
      display: null,
      zoom: scores.photoTele,       // tele = zoom
      bokeh: scores.photoBokeh,
      lowLight: null,
      selfie: null,
      portrait: null,
      photoMain: scores.photoMain,
      photoUltraWide: scores.photoUltraWide,
      photoTele: scores.photoTele,
      videoMain: scores.videoMain,
      videoUltraWide: scores.videoUltraWide,
      videoTele: scores.videoTele,
    },
    strengths: [...new Set(strengths)].slice(0, 15),
    weaknesses: [...new Set(weaknesses)].slice(0, 15),
    rankLabel, rankPosition, rankSegment,
    labelType, labelYear,
    scrapedAt: new Date().toISOString(),
    _source: 'html',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Review page — sample image extraction (extracted from scrapeDxoReview)
// ─────────────────────────────────────────────────────────────────────────────

// Regex constants for the review image scraper — grouped together for easy updating
const REVIEW_IMAGE_REGEXES = {
  validExtension:   /\.(jpe?g|png|webp)($|\?)/i,
  badAsset:         /\b(icon|logo|badge|sprite|pixel\.gif|blank|placeholder)\b/i,
  svgExtension:     /\.svg/i,
  categoryHeading:  /^h[1-6]$/,
  captionNotHeading:/^\s*(best|top score|portrait|lowlight|zoom|outdoor|indoor|photo|video)/i,
};

const CATEGORY_PATTERNS: Array<[RegExp, string]> = [
  [/\bselfie\b|front.?cam|facing/i,              'Selfie'],
  [/main\s*camera|primary|rear\s*cam/i,           'Main Camera'],
  [/ultra.?wide|wide.?angle/i,                    'Ultra-Wide'],
  [/tele(photo)?|zoom|periscope/i,                'Telephoto / Zoom'],
  [/bokeh|portrait|depth/i,                       'Bokeh / Portrait'],
  [/low.?light|night\s*(mode)?|lowlight/i,        'Low Light / Night'],
  [/outdoor|bright\s*light/i,                     'Outdoor'],
  [/indoor/i,                                     'Indoor'],
  [/video/i,                                      'Video'],
  [/sample|test\s*shot|example|camera/i,          'Sample Shots'],
];

function detectCategory(text: string): string | null {
  for (const [re, label] of CATEGORY_PATTERNS) {
    if (re.test(text)) return label;
  }
  return null;
}

function resolveRelative(url: string): string {
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) return DXO_BASE + url;
  return url;
}

function isValidDxoImage(url: string): boolean {
  if (!url || url.startsWith('data:')) return false;
  const lower = url.toLowerCase();
  if (REVIEW_IMAGE_REGEXES.svgExtension.test(lower)) return false;
  if (REVIEW_IMAGE_REGEXES.badAsset.test(lower)) return false;
  if (!REVIEW_IMAGE_REGEXES.validExtension.test(lower)) return false;
  if (url.startsWith('http') || url.startsWith('//')) {
    return lower.includes('dxomark.com') || lower.includes('imgix') || lower.includes('imgproxy');
  }
  return true;
}

function cleanCaption(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/,\s*,/g, ',')
    .replace(/,\s*and\s*,/g, ' and')
    .replace(/\s*,\s*\./g, '.')
    .replace(/\(\s*\)/g, '')
    .trim();
}

/**
 * Walk the body element of a DXOMark review page, collecting all camera
 * sample images grouped by the heading category that precedes them.
 */
function extractReviewSampleImages(
  $: cheerio.CheerioAPI,
  bodyEl: cheerio.Cheerio<cheerio.Element>,
): IDxoSampleImage[] {
  const sampleImages: IDxoSampleImage[] = [];
  let currentCategory = 'Sample Shots';

  bodyEl.find('*').each((_, el) => {
    const tag = (el as cheerio.Element).name;

    // Update category from headings
    if (REVIEW_IMAGE_REGEXES.categoryHeading.test(tag)) {
      const headText = $(el).text().trim();
      const detected = detectCategory(headText);
      if (detected) currentCategory = detected;
      return;
    }

    if (tag !== 'a') return;

    const href = $(el).attr('href') ?? '';
    if (!isValidDxoImage(href)) return;

    const imgEl = $(el).find('img').first();
    if (!imgEl.length) return;

    const fullResUrl = resolveRelative(href);
    let caption: string | null = null;

    // Strategy A — figcaption inside the same <figure>
    const fig = $(el).closest('figure');
    if (fig.length) {
      const fc = fig.find('figcaption').first().text().trim();
      if (fc.length > 4) caption = cleanCaption(fc);
    }

    // Strategy B — next sibling of parent (or grandparent)
    if (!caption) {
      let next = $(el).parent().next();
      if (!next.length || next.is('a')) next = $(el).parent().parent().next();
      if (next.length) {
        const nextTxt = next.clone().find('a,img,figure').remove().end().text().trim();
        if (
          nextTxt.length > 5 &&
          nextTxt.length < 250 &&
          /[a-zA-Z]/.test(nextTxt) &&
          !REVIEW_IMAGE_REGEXES.captionNotHeading.test(nextTxt)
        ) {
          caption = cleanCaption(nextTxt);
        }
      }
    }

    sampleImages.push({ category: currentCategory, url: fullResUrl, caption });
  });

  // Deduplicate by full-res URL
  const seen = new Set<string>();
  return sampleImages.filter(img => {
    if (seen.has(img.url)) return false;
    seen.add(img.url);
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Review page — pros/cons extraction (separate from the summary-page version)
// ─────────────────────────────────────────────────────────────────────────────

function extractReviewProsCons($: cheerio.CheerioAPI): { pros: string[]; cons: string[] } {
  const pros: string[] = [];
  const cons: string[] = [];
  let prosCons: 'pros' | 'cons' | '' = '';

  $('h6, h5, h4, h3, li').each((_, el) => {
    const tag = (el as cheerio.Element).name;
    const raw = $(el).text();
    const txt = raw.trim();

    if (HTML_REGEXES.prosHeader.test(txt)) { prosCons = 'pros'; return; }
    if (HTML_REGEXES.consHeader.test(txt)) { prosCons = 'cons'; return; }
    if (HTML_REGEXES.sectionBreaker.test(txt)) { prosCons = ''; return; }

    if (tag === 'li' && txt.length > 5 && txt.length < 200) {
      if (/[\n\t]/.test(raw)) return;
      if (HTML_REGEXES.unitOnlyLabel.test(txt)) return;
      if (HTML_REGEXES.navItem.test(txt)) return;
      if (HTML_REGEXES.spatialTemporal.test(txt)) return;
      if (txt.split(' ').length < 3) return;
      if (prosCons === 'pros') pros.push(txt);
      else if (prosCons === 'cons') cons.push(txt);
    }
  });

  return { pros, cons };
}

// ─────────────────────────────────────────────────────────────────────────────
// Review page — scores (getScorePairUntilBoundary reused)
// ─────────────────────────────────────────────────────────────────────────────

function extractReviewScores($: cheerio.CheerioAPI): { scores: ReviewScores; bestScores: ReviewScores } {
  const emptyScores = (): ReviewScores => ({
    photo: null, photoMain: null, photoBokeh: null,
    photoUltraWide: null, photoTele: null,
    video: null, videoMain: null,
    videoUltraWide: null, videoTele: null,
  });

  const scores = emptyScores();
  const bestScores = emptyScores();

  const allText: string[] = [];
  $('*').each((_, el) => {
    if ($(el).children().length > 0) return;
    const txt = $(el).text().trim();
    if (txt.length > 0 && txt.length < 200) allText.push(txt);
  });

  let ctx = '';
  for (let i = 0; i < allText.length; i++) {
    const t = allText[i].replace(HTML_REGEXES.infoIconSuffix, '').trim();
    if (HTML_REGEXES.labelPhoto.test(t)) ctx = 'photo';
    if (HTML_REGEXES.labelVideo.test(t)) ctx = 'video';

    if (HTML_REGEXES.labelPhoto.test(t) && scores.photo === null)
      getScorePairUntilBoundary(allText, i, scores, bestScores, 'photo');
    else if (HTML_REGEXES.labelVideo.test(t) && scores.video === null)
      getScorePairUntilBoundary(allText, i, scores, bestScores, 'video');
    else if (HTML_REGEXES.labelMain.test(t)) {
      if (ctx === 'photo' && !scores.photoMain) getScorePairUntilBoundary(allText, i, scores, bestScores, 'photoMain');
      else if (ctx === 'video' && !scores.videoMain) getScorePairUntilBoundary(allText, i, scores, bestScores, 'videoMain');
    } else if (HTML_REGEXES.labelBokeh.test(t) && !scores.photoBokeh)
      getScorePairUntilBoundary(allText, i, scores, bestScores, 'photoBokeh');
    else if (HTML_REGEXES.labelUltraWide.test(t)) {
      if (ctx === 'photo' && !scores.photoUltraWide) getScorePairUntilBoundary(allText, i, scores, bestScores, 'photoUltraWide');
      else if (ctx === 'video' && !scores.videoUltraWide) getScorePairUntilBoundary(allText, i, scores, bestScores, 'videoUltraWide');
    } else if (HTML_REGEXES.labelTele.test(t)) {
      if (ctx === 'photo' && !scores.photoTele) getScorePairUntilBoundary(allText, i, scores, bestScores, 'photoTele');
      else if (ctx === 'video' && !scores.videoTele) getScorePairUntilBoundary(allText, i, scores, bestScores, 'videoTele');
    }
  }

  return { scores, bestScores };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: scrape the full camera review page
// ─────────────────────────────────────────────────────────────────────────────

export async function scrapeDxoReview(reviewUrl: string, nocache = false): Promise<IDxoReview | null> {
  const ck = `dxo:review:v3:${reviewUrl}`;
  if (!nocache) {
    const cached = await cacheGet<IDxoReview>(ck);
    if (cached) return cached;
  }

  let html: string;
  try {
    html = await getDxoHtml(reviewUrl);
  } catch {
    return null;
  }

  const $ = cheerio.load(html);

  const device =
    $('h1').first().text().replace(/\s*camera test.*/i, '').trim() ||
    $('title').first().text().replace(/camera test.*dxomark/i, '').replace(/[-–|]/g, '').trim();

  let overallScore: number | null = null;
  $('*').each((_, el) => {
    if (overallScore) return false;
    if ($(el).children().length > 0) return;
    const txt = $(el).text().trim();
    const n = parseInt(txt, 10);
    if (!isNaN(n) && n >= 50 && n <= 200 && txt === String(n)) overallScore = n;
  });

  let rankPosition: number | null = null;
  let rankLabel: string | null = null;
  const bodyText = $('body').text();
  const rankMatch =
    bodyText.match(/(\d+)(st|nd|rd|th)\s*Ranking Position/i) ||
    bodyText.match(/#(\d+)\s+in\s+Global Ranking/i) ||
    bodyText.match(/(\d+)(st|nd|rd|th)\s+in\s+Global Ranking/i);
  if (rankMatch) {
    rankPosition = parseInt(rankMatch[1], 10);
    rankLabel = `#${rankPosition} in Global Ranking`;
  }

  const cameraSpecs: string[] = [];
  let inSpecs = false;
  $('h6, h5, h4, h3, li, p').each((_, el) => {
    const txt = $(el).text().trim();
    if (/key camera spec/i.test(txt)) { inSpecs = true; return; }
    if (inSpecs && (el as cheerio.Element).name === 'li' && txt.length > 3) cameraSpecs.push(txt);
    if (inSpecs && /^(scoring|overview|test summary|pros|cons)/i.test(txt)) inSpecs = false;
  });

  const { scores, bestScores } = extractReviewScores($);
  const { pros, cons } = extractReviewProsCons($);
  const bodyEl = $('body') as cheerio.Cheerio<cheerio.Element>;
  const sampleImages = extractReviewSampleImages($, bodyEl);

  const result: IDxoReview = {
    device, reviewUrl, overallScore, rankPosition, rankLabel,
    cameraSpecs: [...new Set(cameraSpecs)].slice(0, 12),
    scores, bestScores,
    pros:  [...new Set(pros)].slice(0, 15),
    cons:  [...new Set(cons)].slice(0, 15),
    sampleImages,
    sampleCount: sampleImages.length,
    scrapedAt: new Date().toISOString(),
  };

  cacheSet(ck, result);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: resolve review URL for a device
// ─────────────────────────────────────────────────────────────────────────────

async function buildReviewUrl(brand: string, model: string): Promise<string | null> {
  const slug = `${brand} ${model}`.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const candidates = [
    `${DXO_BASE}/${slug}-camera-test-retested/`,
    `${DXO_BASE}/${slug}-camera-test/`,
  ];

  for (const url of candidates) {
    try {
      const resp = await axios.head(url, {
        headers: HEADERS, timeout: 8000, maxRedirects: 3,
        validateStatus: s => s < 400,
      });
      if (resp.status < 400) return url;
    } catch { /* try next */ }
  }

  try {
    const devicePageUrl = buildDxoUrl(brand, model);
    const html = await getDxoHtml(devicePageUrl);
    const $ = cheerio.load(html);
    let found: string | null = null;
    $('a[href*="camera-test"]').each((_, el) => {
      if (found) return false;
      const href = $(el).attr('href') ?? '';
      if (href.includes('camera-test')) {
        found = href.startsWith('http') ? href : `${DXO_BASE}${href}`;
      }
    });
    return found;
  } catch { return null; }
}

export async function getCameraReviewUrl(devicePageUrl: string): Promise<string | null> {
  const ck = `dxo:reviewurl:v1:${devicePageUrl}`;
  const cached = await cacheGet<string>(ck);
  if (cached) return cached;

  try {
    const html = await getDxoHtml(devicePageUrl);
    const $ = cheerio.load(html);
    let reviewUrl: string | null = null;
    $('a[href*="camera-test"]').each((_, el) => {
      if (reviewUrl) return false;
      const href = $(el).attr('href') ?? '';
      if (href.includes('camera-test')) {
        reviewUrl = href.startsWith('http') ? href : `${DXO_BASE}${href}`;
      }
    });
    if (reviewUrl) { cacheSet(ck, reviewUrl); return reviewUrl; }
  } catch { /* fall through */ }
  return null;
}

export async function getDxoReview(deviceName: string, nocache = false): Promise<IDxoReview | null> {
  const { brand, model } = splitBrandModel(deviceName);
  if (!model) return null;

  const urlCk = `dxo:reviewurl:v2:${brand}:${model}`.toLowerCase();
  let reviewUrl: string | null = nocache ? null : (await cacheGet<string>(urlCk));

  if (!reviewUrl) {
    reviewUrl = await buildReviewUrl(brand, model);
    if (reviewUrl) cacheSet(urlCk, reviewUrl);
  }

  if (!reviewUrl) return null;
  return scrapeDxoReview(reviewUrl, nocache);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: search
// ─────────────────────────────────────────────────────────────────────────────

export async function searchDxo(query: string): Promise<IDxoSearchResult[]> {
  const ck = `dxo:search:v7:${query.toLowerCase().trim()}`;
  const cached = await cacheGet<IDxoSearchResult[]>(ck);
  if (cached) return cached;

  try {
    const resp = await axios.get<unknown>(`${DXO_BASE}/wp-json/wp/v2/test`, {
      params: { search: query, per_page: 10, _fields: 'slug,title,link' },
      headers: JSON_HEADERS,
      timeout: 10000,
    });
    if (Array.isArray(resp.data) && resp.data.length > 0) {
      const results: IDxoSearchResult[] = (resp.data as Array<Record<string, unknown>>).map(p => ({
        name: String((p.title as Record<string, unknown>)?.rendered ?? p.slug ?? ''),
        url: String(p.link ?? `${DXO_BASE}/${p.slug}/`),
        score: null,
      }));
      cacheSet(ck, results);
      return results;
    }
  } catch { /* fall through */ }

  const { brand, model } = splitBrandModel(query);
  const result: IDxoSearchResult = { name: query, url: buildDxoUrl(brand, model), score: null };
  cacheSet(ck, [result]);
  return [result];
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: scrape a specific DXOMark page URL
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_SCORES: IDxoScore['scores'] = {
  photo: null, video: null, audio: null, display: null, zoom: null,
  bokeh: null, lowLight: null, selfie: null, portrait: null,
  photoMain: null, photoUltraWide: null, photoTele: null,
  videoMain: null, videoUltraWide: null, videoTele: null,
};

export async function scrapeDxoPage(pageUrl: string, nocache = false): Promise<IDxoScore> {
  const ck = `dxo:page:v7:${pageUrl}`;
  if (!nocache) {
    const cached = await cacheGet<IDxoScore>(ck);
    if (cached) return cached;
  }

  const FAILED: IDxoScore = {
    device: '', url: pageUrl, overallScore: null,
    scores: { ...EMPTY_SCORES },
    strengths: [], weaknesses: [], rankLabel: null, rankPosition: null,
    rankSegment: null, labelType: null, labelYear: null,
    scrapedAt: new Date().toISOString(), _source: 'failed',
  };

  let html: string;
  try {
    html = await getDxoHtml(pageUrl);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ...FAILED, _fetchError: message };
  }

  const urlMatch = pageUrl.match(/\/smartphones\/([^/]+)\/([^/?]+)/);
  const brand = urlMatch ? decodeURIComponent(urlMatch[1]) : '';
  const model = urlMatch ? decodeURIComponent(urlMatch[2]).replace(/-/g, ' ') : '';

  const t1 = parseNextData(html, pageUrl);
  if (t1 && (t1.overallScore || t1.strengths.length > 0)) { cacheSet(ck, t1); return t1; }

  const t2 = await queryGraphQL(brand, model, pageUrl);
  if (t2 && (t2.overallScore || t2.strengths.length > 0)) { cacheSet(ck, t2); return t2; }

  const t3 = parseHtmlFallback(html, pageUrl, brand, model);
  cacheSet(ck, t3);
  return t3;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: main entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function getDxoScores(deviceName: string, nocache = false): Promise<IDxoScore | null> {
  const ck = `dxo:result:v7:${deviceName.toLowerCase().trim()}`;
  if (!nocache) {
    const cached = await cacheGet<IDxoScore>(ck);
    if (cached) return cached;
  }

  const { brand, model } = splitBrandModel(deviceName);
  if (!model) return null;

  const result = await scrapeDxoPage(buildDxoUrl(brand, model), nocache);
  if (result._source !== 'failed') cacheSet(ck, result);
  return result;
}
