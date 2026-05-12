import { NextRequest, NextResponse } from 'next/server'
import { ParserService } from '@/parser/parser.service'

const parser = new ParserService()

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('query')

  if (!query?.trim()) {
    return NextResponse.json(
      { status: false, error: 'query parameter is required' },
      { status: 400 },
    )
  }

  try {
    const data = await parser.search(query.trim())
    return NextResponse.json({ status: true, data })
  } catch (err: any) {
    console.error('[/api/search]', err?.message)
    return NextResponse.json(
      { status: false, error: 'Search failed' },
      { status: 500 },
    )
  }
}
