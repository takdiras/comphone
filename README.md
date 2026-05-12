<div align="center">

# Comphone

### A better way to compare smartphone specs

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![Bun](https://img.shields.io/badge/Bun-1.x-fbf0df?logo=bun)](https://bun.sh/)
[![Vercel](https://img.shields.io/badge/Deploy%20on-Vercel-black?logo=vercel)](https://vercel.com/)

**Comphone** is a fork of [gsmarena-dxomark-mobile-specs-api](https://github.com/takdiras/gsmarena-dxomark-mobile-specs-api) rebuilt as a Next.js web app — focused on giving users a clean interface to search and compare smartphone specs sourced from GSMArena and DXOMark.

[🚀 Quick Start](#quick-start) · [🐛 Report Bug](../../issues) · [💡 Request Feature](../../issues)

</div>

---

## What's Different from the Original

The upstream project is a raw API server (Fastify). **Comphone** takes that scraping engine and wraps it in a proper web application:

| | Original | Comphone |
|:---|:---:|:---:|
| Framework | Fastify (API only) | Next.js 15 (App Router) |
| UI | None (JSON responses) | shadcn/ui + Tailwind CSS |
| Package manager | pnpm | Bun |
| Primary goal | API endpoints | Phone comparison web app |
| Data sources | GSMArena + DXOMark | GSMArena + DXOMark |

---

## Quick Start

**Prerequisites:** [Bun](https://bun.sh)

```bash
git clone https://github.com/takdiras/comphone
cd comphone
bun install
bun dev
# → http://localhost:3000
```

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/takdiras/comphone)

---

## Environment Variables

All optional. Without Redis, caching is in-memory only (does not survive cold starts).

| Variable | Description |
|:---|:---|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis auth token |

Create a `.env.local` file at the project root:

```env
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

---

## API Routes

The Next.js API routes expose the underlying scraping engine:

| Method | Route | Description |
|:---|:---|:---|
| `GET` | `/api/search?query=` | Search devices by name |

More routes coming as the app grows.

---

## Tech Stack

- **[Next.js 15](https://nextjs.org/)** — App Router, React Server Components
- **[shadcn/ui](https://ui.shadcn.com/)** — Component library (Radix + Tailwind)
- **[Bun](https://bun.sh/)** — Runtime & package manager
- **[Cheerio](https://cheerio.js.org/)** — HTML scraping
- **[Axios](https://axios-http.com/)** — HTTP client with retry + UA rotation
- **[Upstash Redis](https://upstash.com/)** — Optional persistent cache layer

---

## ⚠️ Disclaimer

This project scrapes publicly accessible pages for personal and educational use. It is not affiliated with, endorsed by, or connected to GSMArena or DXOMark in any way. Use responsibly and respect their Terms of Service.

---

## License

[MIT](./LICENSE) — forked from [gsmarena-dxomark-mobile-specs-api](https://github.com/takdiras/gsmarena-dxomark-mobile-specs-api)