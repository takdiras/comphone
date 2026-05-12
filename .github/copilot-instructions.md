# Comphone — Copilot Instructions

## Build & Dev Commands

```bash
bun run dev      # Start dev server (Next.js)
bun run build    # Production build
bun start        # Serve production build
```

## Architecture

This is a **Next.js 15 App Router** project with Tailwind CSS, deployed to Vercel. It scrapes [GSMArena](https://www.gsmarena.com) and [DXOMark](https://www.dxomark.com) for mobile device specs, reviews, and camera scores.

### Entry point & routes

```
src/app/
  layout.tsx          — Root layout with Tailwind globals
  page.tsx            — Search page (client component, debounced)
  globals.css         — Tailwind base + CSS variables
  api/
    search/route.ts   — GET /api/search?query= → ParserService.search()
```

### Scraping source layout

```
src/
  config.ts           — baseUrl = 'https://www.gsmarena.com'
  types.ts            — All TypeScript interfaces (IPhoneDetails, IReviewResult, etc.)
  cache.ts            — Two-layer cache: in-process LRU map → Upstash Redis REST
  parser/
    parser.service.ts — Core HTTP fetcher (UA rotation, retry); search & list scrapers (ParserService class)
    parser.brands.ts  — Scrapes /makers.php3 for brand directory
    parser.phone-details.ts — Scrapes device spec pages + pictures page
    parser.review.ts  — Scrapes review pages + camera sample sub-pages
    parser.dxomark.ts — Scrapes DXOMark scores and reviews
```

### Cache layer (`src/cache.ts`)

- **Layer 1**: In-process LRU `Map` (max 500 entries, evicts oldest 20% when full, no TTL)
- **Layer 2**: Upstash Redis REST via `axios` (no expiry — persists indefinitely)
- Falls back to memory-only when `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are absent
- **Cache invalidation**: bump the version suffix in the cache key constant (e.g. `gsm:phone-full:v2` → `v3`). Old keys are simply never read again.
- `cacheSet()` writes mem synchronously and fires Redis as non-fatal fire-and-forget

## Key Conventions

### Cache key naming

Cache keys follow the pattern `gsm:<resource>:v<N>:<identifier>` (e.g. `gsm:brand:v1:samsung`, `gsm:phone-full:v2:samsung galaxy s25 ultra`). Always increment `vN` when changing scraping logic for a cached resource.

### HTTP fetcher (`getHtml`)

All scraping goes through `getHtml()` in `parser.service.ts`. It:
- Rotates through an 8-entry User-Agent pool round-robin
- Retries up to 3 times with exponential backoff (600 ms → 1.2 s → 2.4 s) on 429/5xx/network errors
- Uses a shared keep-alive `axios` instance

Never call `axios.get` directly to fetch GSMArena pages; always use `getHtml()`.

### Image URL transformation

GSMArena thumbnail URLs (`/vv/pics/…`) are converted to HD bigpic URLs (`fdn2.gsmarena.com/vv/bigpic/…`) via `toBigpicFromImgSrc()` in `parser.service.ts`. Use this helper when extracting device images.

### Brand prefix stripping

`BRAND_PREFIXES` in `parser.phone-details.ts` lists compound sub-brand prefixes ordered most-specific first (e.g. `xiaomi_redmi_` before `xiaomi_`). When adding a new brand, insert compound prefixes before their parent.

### Debug routes

Routes under `/debug/*` are protected by `DEBUG_SECRET` env var (passed as `?secret=<value>`). If `DEBUG_SECRET` is unset the routes are open (dev mode). Always guard new debug routes with `requireDebugSecret()`.

### API response envelope

All data routes return `{ status: true, data: ... }`. Error responses return `{ status: false, error: "..." }`.

### Environment variables

| Variable | Purpose |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash bearer token |
| `DEBUG_SECRET` | Shared secret for `/debug/*` routes |
