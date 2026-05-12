import { IPhoneDetails, IDeviceImage, IColorVariant, IPicturesPageData } from "../types";
import * as cheerio from 'cheerio';
import type { Element, AnyNode } from 'domhandler';
import { baseUrl } from "../config";
import { TSpecCategory } from "../types";
import { getHtml } from "./parser.service";
import { cacheGet, cacheSet } from "../cache";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Brand prefixes that GSMArena sometimes prepends to device slugs
 * and review/news URLs. Ordered most-specific → least-specific so the
 * first match wins and we don't strip "xiaomi_" when the prefix is
 * "xiaomi_redmi_".
 */
const BRAND_PREFIXES: readonly string[] = [
  // Compound sub-brand prefixes (must precede their parent brand)
  'xiaomi_poco_',
  'xiaomi_redmi_',
  'vivo_iqoo_',
  'samsung_galaxy_',
  'apple_iphone_',
  'google_pixel_',
  'huawei_honor_',
  'lenovo_motorola_',
  // Single-brand prefixes
  'xiaomi_',
  'vivo_',
  'samsung_',
  'apple_',
  'google_',
  'huawei_',
  'lenovo_',
  'motorola_',
  'asus_',
  'sony_',
  'zte_',
  'htc_',
  'meizu_',
  'infinix_',
  'tecno_',
  'itel_',
  'tcl_',
  'blackview_',
  'ulefone_',
  'doogee_',
  'oukitel_',
  'realme_',
  'oppo_',
  'oneplus_',
  'nothing_',
  'honor_',
  'nokia_',
  'poco_',
  'iqoo_',
  'redmi_',
];

/**
 * Generic tokens that appear in many device names and therefore cannot
 * alone establish that two slugs refer to the same model family.
 */
const GENERIC_TOKENS = new Set<string>([
  // Tier/grade suffixes
  'pro', 'plus', 'ultra', 'mini', 'lite', 'max', 'fe', 'se', 'neo',
  'edge', 'prime', 'power', 'play', 'note', 'fold', 'flip',
  // Connectivity/version tags
  '5g', '4g', 'lte', 'wi-fi', 'wifi',
  // Single-letter model tags (too ambiguous alone)
  'x', 'z', 's', 'a', 'c', 'e', 'f', 'y',
  // Brand names (a slug's own brand token is always generic for sibling-matching)
  'vivo', 'iqoo', 'xiaomi', 'samsung', 'apple', 'google', 'oppo',
  'realme', 'oneplus', 'nothing', 'nokia', 'motorola', 'honor',
  'huawei', 'lenovo', 'asus', 'sony', 'zte', 'htc', 'meizu',
  'infinix', 'tecno', 'itel', 'tcl', 'poco', 'redmi',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract an image URL from a Cheerio element by probing a priority-ordered
 * list of attributes. Falls back to empty string if none found.
 */
function extractImgUrl(
  $: cheerio.CheerioAPI,
  el: Element | AnyNode,
): string {
  const $el = $(el);
  return (
    $el.attr('data-seo-image') ||
    $el.attr('data-image-url') ||
    $el.attr('data-image') ||
    $el.attr('data-src') ||
    $el.attr('src') ||
    ''
  ).trim();
}

/**
 * Normalise a slug or href for comparison: remove .php, trailing numeric IDs,
 * _5g / _4g / _lte suffixes, and the longest matching brand prefix.
 *
 * When `brand` is provided (e.g. "vivo") we also try stripping it dynamically
 * so scraper variants like "brand_submodel_foo" and "submodel_foo" both
 * normalise the same way.
 */
function normalizeSlug(slug: string, brand?: string): string {
  let s = slug
    .toLowerCase()
    .replace(/\.php$/, '')
    .replace(/-\d+$/, '')
    .replace(/[_-](5g|4g|lte)$/, '');

  // Dynamic brand strip — use the actual brand string extracted from the page
  if (brand) {
    const brandSlug = brand.toLowerCase().replace(/\s+/g, '_') + '_';
    if (s.startsWith(brandSlug)) {
      s = s.slice(brandSlug.length);
    }
  }

  // Hardcoded prefix list as a reliable fallback
  for (const prefix of BRAND_PREFIXES) {
    if (s.startsWith(prefix)) {
      s = s.slice(prefix.length);
      break;
    }
  }

  return s;
}

/**
 * Split a slug into meaningful tokens, discarding pure-numeric fragments
 * and the bare "5g" / "4g" connectivity tags.
 */
function extractSlugTokens(slug: string): string[] {
  return slug
    .toLowerCase()
    .split(/[_\-\s]+/)
    .filter(t => t.length > 1 && !/^\d+$/.test(t) && !/^[45]g$/.test(t));
}

/**
 * Resolve a protocol-relative URL to https://.
 */
function ensureHttps(url: string): string {
  return url.startsWith('//') ? `https:${url}` : url;
}

// ─────────────────────────────────────────────────────────────────────────────
// Review-link helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assign a relevance score to a candidate href based on its URL shape.
 * Higher = more desirable.
 */
function reviewScore(href: string): number {
  if (href.includes('-review-')) return 100;
  if (href.includes('camera_samples') || href.includes('camera-samples')) return 90;
  if (href.includes('-news-') && href.includes('camera')) return 70;
  if (href.includes('-news-')) return 30;
  return 0;
}

/**
 * Determine whether a candidate href is related to the device described
 * by `specSlug`, `brand`, and `model`.
 *
 * Four independent strategies are tried in sequence; any hit returns true.
 */
function isLinkRelatedToDevice(
  href: string,
  specSlug: string,
  brand: string,
  model: string,
): boolean {
  const hrefClean = href.toLowerCase().replace(/\.php$/, '');
  const specNorm = normalizeSlug(specSlug, brand);

  // Strategy 1 — normalised slug overlap
  const linkNorm = normalizeSlug(hrefClean, brand);
  if (linkNorm.includes(specNorm) || specNorm.includes(linkNorm)) return true;

  // Strategy 2 — model token matching (uses word-boundary-aware test)
  if (model) {
    const modelTokens = model
      .toLowerCase()
      .split(/\s+/)
      .filter(p => p.length > 2 && !/^[45]g$/i.test(p));

    // Word-boundary regex prevents "pro" matching inside "protect", etc.
    const matched = modelTokens.filter(token => {
      try {
        return new RegExp(`\\b${token}\\b`).test(hrefClean);
      } catch {
        return hrefClean.includes(token);
      }
    });
    if (matched.length >= Math.min(2, modelTokens.length)) return true;
  }

  // Strategy 3 — fuzzy token overlap on spec slug
  const specTokens = extractSlugTokens(specSlug);
  const hrefTokens = extractSlugTokens(hrefClean);

  let matchCount = 0;
  for (const token of specTokens) {
    if (hrefTokens.some(ht => ht.includes(token) || token.includes(ht))) {
      matchCount++;
    }
  }
  const required = specTokens.length <= 2 ? specTokens.length : 2;
  if (matchCount >= required) return true;

  // Strategy 4 — raw slug fragment present in href (strip leading brand prefix)
  const specSlugClean = specSlug.toLowerCase().replace(/\.php$/, '').replace(/-\d+$/, '');
  const strippedSpec = specSlugClean.replace(/^[a-z]+_/, '');
  if (strippedSpec && hrefClean.includes(strippedSpec)) return true;

  return false;
}

/**
 * Find the best review/camera-samples URL from the already-loaded Cheerio
 * document. Returns `undefined` when no suitable link is found.
 */
function findBestReviewLink(
  $: cheerio.CheerioAPI,
  slug: string,
  brand: string,
  model: string,
): string | undefined {
  interface LinkCandidate { href: string; score: number; isRelated: boolean; }

  // ── Phase 1: score every .php link on the page ───────────────────────────
  const candidates: LinkCandidate[] = [];

  $('a[href]').each((_, el) => {
    const rawHref = ($(el).attr('href') || '').toLowerCase();
    if (!rawHref.endsWith('.php')) return;

    const score = reviewScore(rawHref);
    if (score === 0) return;

    const fullUrl = rawHref.startsWith('http') ? rawHref : `${baseUrl}/${rawHref}`;
    candidates.push({
      href: fullUrl,
      score,
      isRelated: isLinkRelatedToDevice(rawHref, slug, brand, model),
    });
  });

  candidates.sort((a, b) =>
    a.isRelated !== b.isRelated ? (a.isRelated ? -1 : 1) : b.score - a.score,
  );

  if (candidates.length > 0 && candidates[0].isRelated) return candidates[0].href;

  // Accept an unrelated high-score link only for review / camera content
  if (candidates.length > 0 && candidates[0].score >= 70) return candidates[0].href;

  // ── Phase 2: body-text mention fallback ──────────────────────────────────
  const pageText = $('body').text().toLowerCase();
  const probeTexts = [
    `${brand.toLowerCase()} ${model.toLowerCase()} review`,
    `${model.toLowerCase()} review`,
    `${brand.toLowerCase()} ${model.toLowerCase()} camera`,
    `${model.toLowerCase()} camera samples`,
  ];

  for (const probe of probeTexts) {
    if (!pageText.includes(probe)) continue;

    let found: string | undefined;
    $('a[href]').each((_, el) => {
      if (found) return;
      const href = ($(el).attr('href') || '').toLowerCase();
      const text = $(el).text().toLowerCase();
      if (
        (href.includes('review') || href.includes('camera') || href.includes('news')) &&
        (text.includes('review') || text.includes('camera'))
      ) {
        found = href.startsWith('http') ? href : `${baseUrl}/${href}`;
      }
    });
    if (found) return found;
  }

  // ── Phase 3: news links that mention camera ──────────────────────────────
  let finalFallback: string | undefined;
  $('a[href*="news"]').each((_, el) => {
    if (finalFallback) return;
    const href = $(el).attr('href') || '';
    const text = $(el).text().toLowerCase();
    if (href.includes('camera') || text.includes('camera')) {
      const full = href.startsWith('http') ? href : `${baseUrl}/${href}`;
      if (isLinkRelatedToDevice(href, slug, brand, model)) finalFallback = full;
    }
  });

  return finalFallback;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pictures-page scraper
// ─────────────────────────────────────────────────────────────────────────────

interface PicturesPageResult {
  hdImageUrl: string | undefined;
  officialImages: string[];
  colorVariants: IColorVariant[];
}

/**
 * Fetch and parse a GSMArena pictures page, collecting:
 *   - All official full-resolution press renders (/vv/pics/ images)
 *   - Colour-variant chips with per-colour image URLs
 *
 * Silently warns (never throws) so the caller always receives a valid result.
 */
async function scrapePicturesPage(url: string): Promise<PicturesPageResult> {
  const empty: PicturesPageResult = { hdImageUrl: undefined, officialImages: [], colorVariants: [] };

  let picHtml: string;
  try {
    picHtml = await getHtml(url);
  } catch (err) {
    console.warn(`[scrapePicturesPage] failed to fetch ${url}:`, err);
    return empty;
  }

  let $pic: cheerio.CheerioAPI;
  try {
    $pic = cheerio.load(picHtml);
  } catch (err) {
    console.warn(`[scrapePicturesPage] failed to parse HTML from ${url}:`, err);
    return empty;
  }

  const officialImages: string[] = [];
  const colorVariants: IColorVariant[] = [];

  // ── Pass 0A: extract gallery from inline JS ─────────────────────────────
  const scriptBlob = $pic('script')
    .map((_, el) => $pic(el).html() ?? '')
    .get()
    .join('\n');

  // imgroot base URL (older page format)
  const imgrootMatch = scriptBlob.match(/var\s+imgroot\s*=\s*["']([^"']+)["']/);
  const imgroot = imgrootMatch ? ensureHttps(imgrootMatch[1]) : '';

  // Cleaned array-variable patterns — handle both JS `var x = [...]` and
  // JSON `"key": [...]` forms, and tolerate multi-line arrays.
  const galleryArrayPatterns: RegExp[] = [
    /var\s+pics\s*=\s*\[([^\]]*)\]/s,
    /var\s+photos\s*=\s*\[([^\]]*)\]/s,
    /var\s+images\s*=\s*\[([^\]]*)\]/s,
    /"pics"\s*:\s*\[([^\]]*)\]/s,
    /"photos"\s*:\s*\[([^\]]*)\]/s,
    /"images"\s*:\s*\[([^\]]*)\]/s,
  ];

  for (const pattern of galleryArrayPatterns) {
    const m = scriptBlob.match(pattern);
    if (!m) continue;
    const inner = m[1];

    // Sub-case A: relative filenames + imgroot base
    if (imgroot) {
      const filenames = Array.from(inner.matchAll(/"([^"]+\.jpe?g)"/gi)).map(x => x[1]);
      for (const filename of filenames) {
        if (!filename.startsWith('http')) {
          const full = `${imgroot}${filename}`;
          if (!officialImages.includes(full)) officialImages.push(full);
        }
      }
    }

    // Sub-case B: full / protocol-relative URLs in the array
    const fullUrls = Array.from(inner.matchAll(/"((?:https?:)?\/\/[^"]+\.jpe?g)"/gi))
      .map(x => ensureHttps(x[1]));
    for (const u of fullUrls) {
      if (!officialImages.includes(u)) officialImages.push(u);
    }

    if (officialImages.length > 0) break;
  }

  // ── Pass 0B: <a href> full-res image links ──────────────────────────────
  $pic('a[href]').each((_, el) => {
    const href = ensureHttps(($pic(el).attr('href') ?? '').trim());
    if (
      /\.jpe?g$/i.test(href) &&
      (href.includes('gsmarena.com') || href.includes('fdn2.') || href.includes('fdn.')) &&
      !href.includes('/reviews/') &&
      !href.includes('/lifestyle/') &&
      !officialImages.includes(href)
    ) {
      officialImages.push(href);
    }
  });

  // ── Pass 1: <img> tags with /vv/pics/ paths ─────────────────────────────
  $pic('img').each((_, el) => {
    const raw = extractImgUrl($pic, el);
    const src = ensureHttps(raw);
    if (
      src.includes('/vv/pics/') &&
      src.includes('gsmarena.com') &&
      /\.jpe?g$/i.test(src) &&
      !officialImages.includes(src)
    ) {
      officialImages.push(src);
    }
  });

  const hdImageUrl = officialImages[0];

  // ── Pass 2: color variant chips ─────────────────────────────────────────
  const colorSelectors = [
    'ul.color-list li',
    '#model-3d li',
    '.model-3d li',
    '[class*="color-list"] li',
    '[class*="model-3d"] li',
    'ul[class*="colors"] li',
    '.pictures-colors li',
    '.color-buttons li',
  ].join(', ');

  $pic(colorSelectors).each((idx, el) => {
    const $li = $pic(el);

    // Use unified helper first; fall back to child <img>
    const raw =
      extractImgUrl($pic, el) ||
      extractImgUrl($pic, $li.find('img').get(0) as Element);
    const imgUrl = ensureHttps(raw);

    const colorName = (
      $li.attr('title') ||
      $li.attr('data-color') ||
      $li.find('span').text() ||
      $li.text()
    ).trim();

    if (colorName && imgUrl && (imgUrl.startsWith('http') || imgUrl.startsWith('//'))) {
      colorVariants.push({ colorName, imageUrl: imgUrl, isDefault: idx === 0 });
    }
  });

  // ── Fallback: infer color names from inline JS colors array ─────────────
  if (colorVariants.length === 0 && officialImages.length > 0) {
    const colorsMatch = scriptBlob.match(/(?:var\s+colors?|"colors?")\s*[=:]\s*\[([^\]]+)\]/);
    if (colorsMatch) {
      const names = Array.from(colorsMatch[1].matchAll(/"([^"]+)"/g)).map(m => m[1]);
      names.forEach((name, idx) => {
        const imgUrl = officialImages[idx] ?? officialImages[0];
        if (name && imgUrl) colorVariants.push({ colorName: name, imageUrl: imgUrl, isDefault: idx === 0 });
      });
    }
  }

  // ── Pass 3: imgroot fallback when /vv/pics/ not found ───────────────────
  let resolvedHd = hdImageUrl;
  if (!resolvedHd) {
    const isCleanImgroot = (src: string) =>
      src.includes('/imgroot/') &&
      src.includes('gsmarena.com') &&
      !src.includes('/reviews/') &&
      !src.includes('/camera') &&
      !src.includes('/lifestyle/') &&
      !src.includes('/inline/');

    let foundThumb: string | undefined;

    $pic('img').each((_, el) => {
      if (foundThumb) return;
      const src = ensureHttps(extractImgUrl($pic, el));
      if (isCleanImgroot(src) && (src.includes('/photos/') || src.includes('/design/'))) {
        foundThumb = src;
      }
    });

    if (!foundThumb) {
      $pic('img').each((_, el) => {
        if (foundThumb) return;
        const src = ensureHttps(extractImgUrl($pic, el));
        if (isCleanImgroot(src)) foundThumb = src;
      });
    }

    if (foundThumb) {
      resolvedHd = foundThumb.replace(/\/-[^/]+\/(?=[^/]+\.jpe?g$)/i, '/-/-/');
    }
  }

  return { hdImageUrl: resolvedHd, officialImages, colorVariants };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export async function getPhoneDetails(slug: string): Promise<IPhoneDetails> {
  const ck = `gsm:phone-details:v2:${slug}`;
  const cached = await cacheGet<IPhoneDetails>(ck);
  if (cached) {
    console.log(`[getPhoneDetails] cache HIT ${ck}`);
    return cached;
  }

  const html = await getHtml(`${baseUrl}/${slug}.php`);
  const $ = cheerio.load(html);

  // ── Identity ─────────────────────────────────────────────────────────────
  const brand = $('h1.specs-phone-name-title a').text().trim();
  const model = $('h1.specs-phone-name-title')
    .contents()
    .filter(function () { return this.type === 'text'; })
    .text()
    .trim();

  // ── Primary image (bigpic, ~300 px) ─────────────────────────────────────
  const imageUrl =
    $('.specs-photo-main a img').attr('src') ||
    $('.specs-photo-main img').attr('src') ||
    $('.specs-photo img').attr('src');

  // ── Colour variant images ────────────────────────────────────────────────
  const device_images: IDeviceImage[] = [];

  if (imageUrl) {
    const primaryColor =
      $('.specs-photo-main')
        .next('.specs-photo-colors, .color-list')
        .find('li.selected, li:first-child')
        .attr('title') || 'Default';
    device_images.push({ color: primaryColor, url: imageUrl });
  }

  // Pattern A: <li data-image-url="…">
  $('li[data-image-url]').each((_, el) => {
    const url = $(el).attr('data-image-url') || '';
    const color =
      $(el).attr('title') ||
      $(el).attr('data-color') ||
      $(el).text().trim() ||
      'Unknown';
    if (url && !device_images.some(i => i.url === url)) {
      device_images.push({ color, url });
    }
  });

  // Pattern B: <img> inside .specs-photo-colors / .color-list
  $('.specs-photo-colors li, .color-list li').each((_, el) => {
    const img = $(el).find('img');
    // Use unified helper on the img element
    const url = ensureHttps(extractImgUrl($, img.get(0) as Element));
    const color =
      $(el).attr('title') ||
      img.attr('alt') ||
      $(el).text().trim() ||
      'Unknown';
    if (url && !device_images.some(i => i.url === url)) {
      device_images.push({ color, url });
    }
  });

  // ── Review / camera-samples link ─────────────────────────────────────────
  const review_url = findBestReviewLink($, slug, brand, model);

  // ── Pictures-page URL ────────────────────────────────────────────────────
  let picturesPageUrl: string | undefined;
  $('a[href*="-pictures-"]').each((_, el) => {
    if (picturesPageUrl) return;
    const href = $(el).attr('href') ?? '';
    if (href.includes('-pictures-') && href.endsWith('.php')) {
      picturesPageUrl = href.startsWith('http') ? href : `${baseUrl}/${href}`;
    }
  });

  // ── HD images + colour variants from pictures page ───────────────────────
  let hdImageUrl: string | undefined;
  let officialImages: string[] = [];
  let colorVariants: IColorVariant[] = [];

  if (picturesPageUrl) {
    ({ hdImageUrl, officialImages, colorVariants } = await scrapePicturesPage(picturesPageUrl));
  }

  // ── Quick-spec highlights ─────────────────────────────────────────────────
  const release_date = $('span[data-spec="released-hl"]').text().trim();
  const dimensions = $('span[data-spec="body-hl"]').text().trim();
  const os = $('span[data-spec="os-hl"]').text().trim();
  const storage = $('span[data-spec="storage-hl"]').text().trim();

  // ── Full specification table ─────────────────────────────────────────────
  const specifications: Record<string, TSpecCategory> = {};

  $('#specs-list table').each((_, table) => {
    const categoryName = $(table).find('th').text().trim();
    if (!categoryName) return;

    const categorySpecs: TSpecCategory = {};
    const additionalFeatures: string[] = [];

    $(table).find('tr').each((_, row) => {
      const title = $(row).find('td.ttl').text().trim();
      const value =
        $(row).find('td.nfo').html()?.replace(/<br\s*\/?>/gi, '\n').trim() ?? '';

      if (title && title !== '\u00a0') {
        categorySpecs[title] = value;
      } else if (value) {
        additionalFeatures.push(value);
      }
    });

    if (additionalFeatures.length > 0) {
      categorySpecs['Features'] = additionalFeatures.join('\n');
    }

    if (Object.keys(categorySpecs).length > 0) {
      specifications[categoryName] = categorySpecs;
    }
  });

  // ── Sibling device slugs ─────────────────────────────────────────────────
  // Two devices are siblings when ALL specific (non-generic) tokens from the
  // current slug appear in the candidate slug.
  // e.g. "vivo_iqoo_z7_pro" specific tokens: ["z7"]  ← "iqoo" is generic
  //      "vivo_iqoo_z7_pro_5g" → sibling ✓
  //      "vivo_x300_pro_5g"    → NOT sibling (missing "z7") ✓

  const brandToken = slug.split('_')[0];
  const slugBase = slug.toLowerCase().replace(/-\d+$/, '');

  const specificTokens = slugBase
    .split('_')
    .filter(t => t.length > 1 && !GENERIC_TOKENS.has(t) && t !== brandToken);

  const matchTokens =
    specificTokens.length > 0
      ? specificTokens
      : slugBase.split('_').filter(t => t.length > 1 && t !== brandToken);

  const siblingDeviceSlugs: string[] = [];
  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') ?? '').replace(/\.php$/, '').replace(/^\//, '');
    if (!/^[a-z0-9_]+-\d+$/.test(href) || href === slug) return;

    const hrefBase = href.replace(/-\d+$/, '').toLowerCase();
    if (
      matchTokens.every(t => hrefBase.includes(t)) &&
      !siblingDeviceSlugs.includes(href)
    ) {
      siblingDeviceSlugs.push(href);
    }
  });

  // ── Assemble result ───────────────────────────────────────────────────────
  const picturesPageData: IPicturesPageData | undefined = picturesPageUrl
    ? { officialImages, colorVariants, picturesPageUrl }
    : undefined;

  const result: IPhoneDetails = {
    brand,
    model,
    imageUrl: hdImageUrl ?? imageUrl,
    device_images,
    review_url,
    siblingDeviceSlugs,
    release_date,
    dimensions,
    os,
    storage,
    specifications,
    picturesPageData,
  };

  cacheSet(ck, result);
  return result;
}
